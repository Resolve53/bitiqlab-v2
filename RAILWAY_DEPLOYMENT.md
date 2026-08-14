# TradingView MCP + Binance Integration - Railway Deployment

## Architecture
```
┌─────────────────────────────────────┐
│   User Dashboard (Vercel)           │
│   - Create Strategy                 │
│   - Start Paper Trading             │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│   Backend API (Railway)              │
│   - /api/paper-trading/start        │
│   - /api/paper-trading/execute      │
└────────────┬────────────────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
┌──────────────┐ ┌────────────────────┐
│  Binance     │ │ TradingView MCP    │
│  Testnet     │ │ (Railway Service)  │
│  Execute     │ │ Auto-deploy        │
│  Trades      │ │ Strategies         │
└──────────────┘ └────────────────────┘
```

## Step 1: Deploy to Railway

### Option A: Using Railway UI (Recommended)

1. **Go to Railway Dashboard**: https://railway.app
2. **Create New Service**:
   - Click "New" → "Service"
   - Select "GitHub Repo"
   - Choose `bitiqlab-v2` repository
   
3. **Deploy Backend API**:
   - **Name**: `bitiqlab-backend`
   - **Dockerfile**: `backend.Dockerfile`
   - **Root Directory**: `/`
   - **Port**: 3001
   - **Environment Variables**:
     ```
     SUPABASE_URL=https://hcfbxpccsnksulgxgblw.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=<your-key>
     ANTHROPIC_API_KEY=sk-ant-<your-key>
     BINANCE_TESTNET_API_KEY=<your-key>
     BINANCE_TESTNET_API_SECRET=<your-secret>
     TRADINGVIEW_MCP_URL=http://tradingview-mcp:3000
     NEXT_PUBLIC_API_URL=https://bitiqlab-backend-production.up.railway.app
     ```

4. **Deploy TradingView MCP Service**:
   - **Name**: `tradingview-mcp`
   - **Config File Path:** `/railway.tradingview-mcp.toml` (required — root `/railway.toml` would force `backend.Dockerfile`)
   - **Dockerfile**: `./Dockerfile.mcp` (from that config file)
   - **Start command**: `node mcp-http-server.js`
   - **Root Directory**: `/`
   - **Port**: Railway `PORT` (HTTP only). Do **not** publish `9222`.
   - **Volume (required):** mount path `/data` — Chromium profile is `/data/tradingview-profile`
   - **Environment Variables**:
     ```
     ANTHROPIC_API_KEY=sk-ant-<your-key>
     NODE_ENV=production
     TRADINGVIEW_BROWSER_ENABLED=true
     TRADINGVIEW_BROWSER_HEADLESS=true
     TRADINGVIEW_BROWSER_USER_DATA_DIR=/data/tradingview-profile
     TRADINGVIEW_BROWSER_STARTUP_TIMEOUT_MS=30000
     TRADINGVIEW_BROWSER_URL=https://www.tradingview.com/chart/
     TRADINGVIEW_BROWSER_EXECUTABLE=/usr/bin/chromium
     CDP_HOST=127.0.0.1
     CDP_PORT=9222
     ```
   - First-login and smoke tests: [STAGE_1C_BROWSER_RUNTIME.md](./STAGE_1C_BROWSER_RUNTIME.md)

### Option B: Config-as-code (per service)

Root `/railway.toml` applies only to services that do **not** set a custom Config File Path. It builds `./backend.Dockerfile` (Next.js API).

`tradingview-mcp` must set Config File Path to `/railway.tradingview-mcp.toml`. Railway will not infer that file from the service name.

---

## Step 2: Verify Deployment

**Check Backend Health**:
```bash
curl https://bitiqlab-backend-production.up.railway.app/api/health
```

**Check MCP Server Health**:
```bash
curl https://tradingview-mcp-production.up.railway.app/health
```

Backend health should return HTTP 200.

MCP `/health` is HTTP 200 whenever the HTTP wrapper is up. `status` is `"ok"` only when Chromium, CDP, and an authenticated TradingView page are ready; otherwise `status` is `"degraded"` with `error_class` set (see Stage 1C).

---

## Step 3: Complete Workflow

### User Flow:

```
1. User goes to https://labbitiq.vercel.app
2. Creates strategy:
   {
     "name": "RSI Strategy",
     "symbol": "BTCUSDT",
     "entry_rules": {"conditions": "RSI<30"},
     "exit_rules": {"stop_loss_percent": -2}
   }

3. Clicks "Paper Trading" button
   ↓
   Backend automatically:
   - Creates trading session
   - Calls TradingView MCP to deploy strategy
   - MCP generates Pine Script
   - MCP deploys to TradingView automatically
   - Starts monitoring for signals
   
4. TradingView generates signal (RSI < 30)
   ↓
   Signal sent to: /api/paper-trading/tradingview-webhook
   ↓
   Backend executes on Binance testnet
   ↓
   Trade logged in database
   ↓
   Dashboard updates with P&L
```

---

## Step 4: Test End-to-End

```bash
# 1. Create strategy
STRATEGY_ID=$(curl -X POST https://bitiqlab-backend-production.up.railway.app/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test Strategy",
    "symbol":"BTCUSDT",
    "entry_rules":{"conditions":"RSI<30"},
    "exit_rules":{"stop_loss_percent":-2},
    "created_by":"test"
  }' | jq -r '.data.id')

# 2. Start paper trading (automatically deploys to TradingView)
SESSION_DATA=$(curl -X POST https://bitiqlab-backend-production.up.railway.app/api/paper-trading/start \
  -H "Content-Type: application/json" \
  -d '{"strategy_id":"'$STRATEGY_ID'","initial_balance":10000}')

SESSION_ID=$(echo $SESSION_DATA | jq -r '.data.session_id')
TRADINGVIEW_STATUS=$(echo $SESSION_DATA | jq -r '.data.tradingview_status')

echo "Session: $SESSION_ID"
echo "TradingView Status: $TRADINGVIEW_STATUS"

# 3. Simulate TradingView signal
curl -X POST https://bitiqlab-backend-production.up.railway.app/api/paper-trading/tradingview-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "session_id":"'$SESSION_ID'",
    "signal":"BUY",
    "symbol":"BTCUSDT",
    "reason":"RSI<30 detected"
  }'
```

---

## Troubleshooting

### MCP Server Not Connecting
**Error**: `"tradingview_status":"pending"`

**Solution**:
1. Check MCP health: `curl https://tradingview-mcp-production.up.railway.app/health`
2. Check Railway logs for MCP service
3. Verify `TRADINGVIEW_MCP_URL` env var is correct

### Binance Testnet Errors
**Error**: `"Insufficient USDT balance"`

**Solution**:
1. Go to https://testnet.binance.vision
2. Request test USDT from faucet
3. Verify API keys are correct

### Strategy Not Deploying to TradingView
**Check**:
1. MCP server is healthy
2. Strategy rules are valid JSON
3. Check Railway logs: `railway logs tradingview-mcp`

---

## Environment Variables Reference

| Variable | Value | Service |
|----------|-------|---------|
| `SUPABASE_URL` | Your Supabase URL | Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase key | Backend |
| `ANTHROPIC_API_KEY` | Claude API key | Both |
| `BINANCE_TESTNET_API_KEY` | Binance testnet key | Backend |
| `BINANCE_TESTNET_API_SECRET` | Binance testnet secret | Backend |
| `TRADINGVIEW_MCP_URL` | `http://tradingview-mcp:3000` | Backend |
| `NEXT_PUBLIC_API_URL` | Backend URL | Backend |

---

## Next Steps

1. ✅ Deploy both services to Railway
2. ✅ Verify health checks pass
3. ✅ Test end-to-end workflow
4. ⏳ (Optional) Set up Claude auto-improvement loop
5. ⏳ (Optional) Add promotion/drop decision logic

---

**Your complete MCP integration is ready!** 🚀

---

## Stage 2B — Enrichment worker (dedicated Railway service)

Stage 2 enrichment is automatic. Do **not** rely on manual `POST /api/tradingview/candidates/:id/enrich` in production.

### New Railway service

- **Name**: `bitiqlab-enrichment-worker`
- **Dockerfile**: `backend.Dockerfile` (same image as the API)
- **Root Directory**: `/`
- **Start command** (override the image `CMD`):

```
npm run worker:enrichment
```

That runs `tsx src/candidate-intelligence/worker-main.ts`.

- **Health**: `GET /health` on the worker process (uses `PORT`, default `3011` if unset), and `GET /api/health/enrichment-worker` on the backend API (reads durable DB heartbeats).
- **Poll interval**: `ENRICHMENT_WORKER_POLL_MS` (default `5000`)

### Required env vars (worker service)

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ENRICHMENT_WORKER_POLL_MS=5000
ENRICHMENT_WORKER_BATCH_SIZE=3
ENRICHMENT_WORKER_CONCURRENCY=1
ENRICHMENT_MAX_ATTEMPTS=5
ENRICHMENT_RETRY_BASE_MS=5000
ENRICHMENT_RETRY_MAX_MS=900000
ENRICHMENT_STALE_LOCK_MS=300000
ENRICHMENT_WORKER_ID=enrichment-railway-1
PORT=3011
```

Optional provider keys (same as API): `COINGLASS_API_KEY`, `COINAPI_KEY`, `ALPHA_VANTAGE_API_KEY`, `COINMARKETCAP_API_KEY`.

Apply `migrations/016_enrichment_worker.sql` in Supabase before starting the worker.

### Cron fallback (optional)

If you do not run a dedicated worker, you may call:

```
POST /api/internal/enrichment-tick
Header: x-enrichment-worker-key: $ENRICHMENT_WORKER_SECRET
```

`ENRICHMENT_WORKER_SECRET` must be set on the API; the route fails closed if it is missing.

---

## Stage 1C — TradingView browser runtime (tradingview-mcp)

Production MCP no longer uses a laptop CDP endpoint.

**Critical:** root `/railway.toml` forces `./backend.Dockerfile` (Next.js). Railway cannot pick a per-service Dockerfile from that single file.

On **tradingview-mcp only**:

1. Settings → Config-as-code → **Config File Path** = `/railway.tradingview-mcp.toml`
2. Root Directory = repository root (do not set `/backend`)
3. Redeploy
4. Confirm Settings → Build shows `./Dockerfile.mcp` (not `./backend.Dockerfile`)
5. Confirm deploy logs start with `node mcp-http-server.js`, **not** `node server.js`

- **Image:** `Dockerfile.mcp` (Debian slim + Chromium)
- **Start:** `node mcp-http-server.js`
- **HTTP:** Railway `PORT` (public/private as you already expose)
- **CDP:** `127.0.0.1:9222` inside the container only — never add a public TCP proxy for 9222
- **Volume:** mount `/data` so `/data/tradingview-profile` survives redeploys
- **Bootstrap:** one-time TradingView login into that profile (`npm run tv:bootstrap` locally, then copy the profile). Details: [STAGE_1C_BROWSER_RUNTIME.md](./STAGE_1C_BROWSER_RUNTIME.md)

This section does not change the Stage 2B enrichment worker.

