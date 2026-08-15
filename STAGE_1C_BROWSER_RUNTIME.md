# Stage 1C — Production TradingView browser runtime

Production `tradingview-mcp` no longer depends on Omar’s laptop, TradingView Desktop, or ngrok.

The Railway `tradingview-mcp` service launches Chromium in the same container, binds Chrome DevTools Protocol (CDP) to `127.0.0.1` only, opens TradingView Web, and reuses a persistent browser profile on a Railway volume.

## Architecture

```
Bitiq backend
  → TRADINGVIEW_MCP_URL (HTTP only)
    → tradingview-mcp (Railway)
         → Chromium in the same container
              CDP 127.0.0.1:9222  (internal, unpublished)
              profile /data/tradingview-profile  (Railway volume)
              https://www.tradingview.com/chart/
```

CDP is never published on the public Railway hostname.

## Railway build config (required — this is why production was running Next.js)

Repo-level `/railway.toml` **cannot** select a Dockerfile per Railway service. It always sets:

```
dockerfilePath = "./backend.Dockerfile"
```

That image runs `npm start` → `node server.js` (Next.js). That is why `tradingview-mcp` logs showed:

```
> bitiqlab-backend@1.0.0 start
> node server.js
Starting Next.js server...
```

**Fix (isolated to tradingview-mcp):**

1. This repo now has `/railway.tradingview-mcp.toml` with `dockerfilePath = "./Dockerfile.mcp"` and `startCommand = "node mcp-http-server.js"`.
2. **You must point the Railway service at that file.** Railway does not auto-detect `railway.tradingview-mcp.toml`.

In Railway → service **tradingview-mcp** → **Settings**:

| Setting | Value |
|---|---|
| Config File Path (Config-as-code) | `/railway.tradingview-mcp.toml` |
| Root Directory | empty / repository root (`/`) — **not** `/backend` |
| Dockerfile (after redeploy) | `./Dockerfile.mcp` (sourced from the MCP toml) |
| Volume mount | `/data` (already attached) |

Do **not** change the root `/railway.toml` Dockerfile for other services (`bitiqlab-v2`, Analysis, Signal, Trade, enrichment worker). Those must keep `./backend.Dockerfile`.

After the Config File Path is saved, **Redeploy**. Settings → Build must show `./Dockerfile.mcp`, not `./backend.Dockerfile`. Until that UI line changes, Stage 1C is **not** deployed.

Optional belt-and-suspenders variable on **tradingview-mcp only**:

```
RAILWAY_DOCKERFILE_PATH=Dockerfile.mcp
```

This is not a substitute for the Config File Path. While the service still loads `/railway.toml`, config-as-code will keep forcing `backend.Dockerfile`.

## Railway volume (manual step)

Railway volumes cannot be declared completely in this repo. In the Railway dashboard:

1. Open the `tradingview-mcp` service.
2. **Settings → Volumes → Add Volume**.
3. **Mount path:** `/data`
4. Leave the Chromium profile at the default:

```
TRADINGVIEW_BROWSER_USER_DATA_DIR=/data/tradingview-profile
```

The process creates `/data/tradingview-profile` on first start. Redeploys reuse cookies/session from that directory.

## Environment (tradingview-mcp service)

```
TRADINGVIEW_BROWSER_ENABLED=true
TRADINGVIEW_BROWSER_HEADLESS=true
TRADINGVIEW_BROWSER_USER_DATA_DIR=/data/tradingview-profile
TRADINGVIEW_BROWSER_STARTUP_TIMEOUT_MS=30000
TRADINGVIEW_BROWSER_URL=https://www.tradingview.com/chart/
TRADINGVIEW_BROWSER_EXECUTABLE=/usr/bin/chromium
CDP_HOST=127.0.0.1
CDP_PORT=9222
PORT=<Railway assigned>
```

Do not put TradingView passwords, cookies, or webhook tokens in source or logs.

## First-login / session bootstrap

Headless Chromium cannot complete a TradingView captcha/login UI reliably. **Do not copy a macOS Chrome profile onto Railway Linux.** Cookie encryption is OS-specific (macOS Keychain vs Linux Chromium key storage). Full-profile copy is unsupported.

Transfer only TradingView session cookies through CDP:

```
local authenticated Chrome
  → npm run tv:session-export   (CDP Network/Storage, tradingview.com only)
  → encrypted one-time artifact
  → npm run tv:session-import   (inside the Railway container, CDP 127.0.0.1)
  → Linux profile persists at /data/tradingview-profile
```

### Option A — CDP session transfer (required)

1. On a trusted machine with Chromium/Chrome, sign in locally:

```bash
cd backend
# 0. Quit every Chrome that was launched with this profile.
#    pgrep -fl 'user-data-dir=.*tv-profile'

# 1. Safe first retry — one spawn + one probe, then inspect counts.
TRADINGVIEW_BOOTSTRAP_ONCE=1 \
TRADINGVIEW_BROWSER_HEADLESS=false \
TRADINGVIEW_BROWSER_USER_DATA_DIR=./.tv-profile \
npm run tv:bootstrap
```

Confirm logs show `spawn_count=0` (adopted) or `spawn_count=1`, and `targets=` is a small number (typically 1–3). If you see many `/chart/` tabs, Ctrl+C immediately. Then quit Chrome and retry with `TRADINGVIEW_BROWSER_RESET_SESSION=true` (clears session-restore files only; cookies/login stay).

Do **not** leave the 5-second poll running until those counts look right.

```bash
# 2. Only after counts look safe — full bootstrap poll
TRADINGVIEW_BROWSER_HEADLESS=false \
TRADINGVIEW_BROWSER_USER_DATA_DIR=./.tv-profile \
npm run tv:bootstrap
```

2. Sign in to TradingView in the opened window. Wait until the process logs `authenticated=yes` and `tradingview=ready`.
3. Export **only** TradingView cookies (including HttpOnly) via CDP. This does **not** copy `.tv-profile`:

```bash
# Exact local export command
cd backend
TRADINGVIEW_BROWSER_USER_DATA_DIR=./.tv-profile \
npm run tv:session-export -- --out ./tv-session-bootstrap.enc
```

The command prints `items=`, `httpOnly=`, `domains=`, the artifact path, and a **one-time secret**. It never prints cookie values. Treat the `.enc` file and the secret as credentials. The artifact is gitignored.

4. Copy **only** `tv-session-bootstrap.enc` onto the Railway volume at `/data/tv-session-bootstrap.enc` (Railway volume browser or `railway ssh`). Do **not** copy `.tv-profile`. Do not commit the artifact.

5. Import inside the `tradingview-mcp` container (CDP is loopback-only; there is no public HTTP import endpoint):

```bash
# Exact Railway import command (operator CLI, same container as Chromium)
TRADINGVIEW_SESSION_BOOTSTRAP_SECRET='<one-time-secret-from-export>' \
TRADINGVIEW_SESSION_BOOTSTRAP_PATH=/data/tv-session-bootstrap.enc \
TRADINGVIEW_BROWSER_USER_DATA_DIR=/data/tradingview-profile \
npm run tv:session-import
```

Or set `TRADINGVIEW_SESSION_BOOTSTRAP_SECRET` on the **tradingview-mcp** service and restart. On CDP-ready the runtime decrypts the artifact, applies cookies via CDP, **then** opens/reloads TradingView.

6. Confirm health:

```bash
curl -sS "$TRADINGVIEW_MCP_URL/health"
# expect tradingview=ready authenticated=yes status=ok
```

7. On success the artifact is shredded and deleted. Unset `TRADINGVIEW_SESSION_BOOTSTRAP_SECRET`. The Linux Chromium profile at `/data/tradingview-profile` now holds the session and is reused on redeploy.

### Browser / tab lifecycle (do not skip)

One bootstrap invocation launches **at most one** Chromium instance and maintains **at most one intended** TradingView chart target (a pre-existing valid chart tab is reused). The 5-second poll only lists CDP targets and evaluates JavaScript; it never navigates, never creates a target, and never respawns Chrome.

A previous bug could accumulate `/chart/` tabs: every spawn appended the chart URL, Chrome also restored prior session tabs from `.tv-profile`, and a macOS Chrome launcher exit was treated as a crash so the runtime spawned again. Those mechanisms can operate together. Session restore from an already-swollen profile can also reopen many tabs on a single launch. Use `TRADINGVIEW_BOOTSTRAP_ONCE=1` to tell the two apart before polling.

### Option B — temporary headful on Railway

Only if the service has an interactive display (it usually does not):

```
TRADINGVIEW_BROWSER_HEADLESS=false
```

Sign in once, then set `TRADINGVIEW_BROWSER_HEADLESS=true` and restart.

`GET /bootstrap` on the MCP service repeats these instructions and reports `authenticated` plus `session_bootstrap` metadata (`items`, artifact present/consumed) **without** cookie values, secrets, or a public import endpoint. `profile_copy_required` is always `false`.

## Health schema

`GET /health` is HTTP 200 whenever the MCP HTTP process is up. Browser/CDP/auth failures are **degraded**, not a generic `"ok"`.

```json
{
  "status": "degraded",
  "mcp_http": "ok",
  "browser": "ok",
  "cdp": "ok",
  "tradingview": "not_authenticated",
  "detection_reason": "AUTH_REQUIRED",
  "authenticated": "no",
  "error_class": "TRADINGVIEW_AUTH_REQUIRED",
  "cdp_bind": "127.0.0.1",
  "user_data_dir": "/data/tradingview-profile",
  "service": "tradingview-mcp"
}
```

`status` is `"ok"` only when browser, CDP, and an authenticated TradingView chart page are all ready (`tradingview` is `"ready"`).

## Error classes

The backend must surface these exact reasons (never “MCP server unreachable” when HTTP is up):

| Class | Meaning |
|---|---|
| `MCP_HTTP_UNREACHABLE` | MCP HTTP process did not answer |
| `BROWSER_NOT_RUNNING` | Chromium process is down |
| `CDP_UNREACHABLE` | Browser may be up; CDP on 127.0.0.1 failed |
| `TRADINGVIEW_PAGE_NOT_READY` | Chart page not loaded |
| `TRADINGVIEW_AUTH_REQUIRED` | Session missing; complete bootstrap |
| `TRADINGVIEW_SELECTOR_NOT_FOUND` | Chart control missing |
| `PINE_EDITOR_NOT_FOUND` | Pine editor DOM missing |
| `PINE_EDITOR_SETUP_REQUIRED` | Editor must be opened once |
| `COMPILE_FAILED` | Compile/add-to-chart failed or Pine errors present |

## Production smoke tests (not fully provable in CI)

After deploy + first login:

```bash
# 1. Health — expect status=ok, authenticated=yes
curl -sS "$TRADINGVIEW_MCP_URL/health"

# 2. Bootstrap status (no secrets)
curl -sS "$TRADINGVIEW_MCP_URL/bootstrap"

# 3. Frozen Pine deploy from the Bitiq backend
#    POST /api/tradingview/deploy with a frozen strategy_version
#    Expect steps.chart_set_symbol / pine_set_source / pine_smart_compile
#    and provenance markers still present in pine_get_source
```

Confirm in Railway logs:

- `[browser] CDP is ready on 127.0.0.1`
- `authenticated=yes`
- no cookie / token / password lines

CI covers lifecycle, health, error classes, profile env, safety, and provenance **without** a live TradingView session.

## What CI cannot prove

- Live Chromium on Railway
- Real TradingView login / captcha
- Real Pine Editor Monaco DOM
- Real compile / add-to-chart click
- Volume persistence across a real Railway redeploy

Those remain production-smoke-test-only.
