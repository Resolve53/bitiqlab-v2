/**
 * In-process Chromium runtime for tradingview-mcp.
 * CDP is bound to 127.0.0.1 only. No credentials or cookies are logged.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  MCP_ERROR_CLASSES,
  classifyConnectError,
  classifyPageState,
  sanitizeLogValue,
} = require("./tradingview-mcp-errors");
const { reconcileProfileLocks } = require("./tradingview-profile-lock");

const DEFAULT_URL = "https://www.tradingview.com/chart/";
const DEFAULT_PROFILE = "/data/tradingview-profile";

function readFlag(env, name, fallback) {
  const raw = env[name];
  if (raw == null || raw === "") return fallback;
  return !/^(0|false|no|off)$/i.test(String(raw).trim());
}

function readMs(env, name, fallback) {
  const raw = env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function browserConfig(env = process.env) {
  return {
    enabled: readFlag(env, "TRADINGVIEW_BROWSER_ENABLED", true),
    headless: readFlag(env, "TRADINGVIEW_BROWSER_HEADLESS", true),
    userDataDir: env.TRADINGVIEW_BROWSER_USER_DATA_DIR || DEFAULT_PROFILE,
    startupTimeoutMs: readMs(env, "TRADINGVIEW_BROWSER_STARTUP_TIMEOUT_MS", 30_000),
    url: env.TRADINGVIEW_BROWSER_URL || DEFAULT_URL,
    executable:
      env.TRADINGVIEW_BROWSER_EXECUTABLE ||
      env.CHROME_BIN ||
      env.CHROMIUM_PATH ||
      "",
    cdpHost: env.CDP_HOST || "127.0.0.1",
    cdpPort: Number(env.CDP_PORT || 9222) || 9222,
    extraArgs: String(env.TRADINGVIEW_BROWSER_EXTRA_ARGS || "")
      .split(/\s+/)
      .filter(Boolean),
    resetSessionRestore: readFlag(env, "TRADINGVIEW_BROWSER_RESET_SESSION", false),
  };
}

const MAX_RESTART_ATTEMPTS = 3;

function resolveExecutable(cfg, existsSyncFn = fs.existsSync) {
  const candidates = [
    cfg.executable,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSyncFn(p)) return p;
  }
  return cfg.executable || candidates[1] || "chromium";
}

function chromiumArgs(cfg, opts = {}) {
  const args = [
    `--remote-debugging-port=${cfg.cdpPort}`,
    `--remote-debugging-address=127.0.0.1`,
    `--user-data-dir=${cfg.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-translate",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--window-size=1920,1080",
  ];
  if (cfg.headless) args.push("--headless=new");
  args.push(...cfg.extraArgs);
  // Never pass the chart URL on every launch. A persistent profile restores
  // previous tabs; a URL argument opens an *additional* /chart/ tab.
  if (opts.includeUrl) args.push(cfg.url);
  return args;
}

const SESSION_RESTORE_RELATIVE = [
  "Default/Current Session",
  "Default/Current Tabs",
  "Default/Last Session",
  "Default/Last Tabs",
  "Default/Sessions",
];

function resetChromeSessionRestore(userDataDir, fsMod = fs) {
  if (!userDataDir) return [];
  const removed = [];
  for (const rel of SESSION_RESTORE_RELATIVE) {
    const full = path.join(userDataDir, rel);
    try {
      if (fsMod.existsSync(full)) {
        fsMod.rmSync(full, { recursive: true, force: true });
        removed.push(rel);
      }
    } catch {
      /* ignore */
    }
  }
  return removed;
}

function ensureUserDataDir(dir, mkdirFn = fs.mkdirSync) {
  mkdirFn(dir, { recursive: true });
  return dir;
}

function fetchJson(url, timeoutMs = 2000, httpMod = http) {
  return new Promise((resolve, reject) => {
    const req = httpMod.get(url, (res) => {
      let data = "";
      res.on("data", (c) => {
        data += c;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data || "{}") });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("CDP probe timeout"));
    });
  });
}

async function waitForCdp(cfg, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? cfg.startupTimeoutMs;
  const started = Date.now();
  const url = `http://127.0.0.1:${cfg.cdpPort}/json/version`;
  let lastErr = "not attempted";
  while (Date.now() - started < timeoutMs) {
    try {
      const { status, json } = await fetchJson(url, 1500, opts.http || http);
      if (status >= 200 && status < 300 && json) {
        return { ok: true, version: json };
      }
      lastErr = `http_${status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs || 250));
  }
  return { ok: false, error: lastErr };
}

function sanitizeTargetUrl(url) {
  if (!url) return "";
  const raw = String(url);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return `${parsed.origin}${parsed.pathname}`;
    }
  } catch {
    /* fall through */
  }
  return raw.split("?")[0].split("#")[0];
}

function isIgnoredTargetUrl(url) {
  const u = String(url || "");
  return /^(chrome|chrome-extension|devtools|about|edge|brave):/i.test(u)
    || /newtab|new-tab-page|ntp\/|chrome\/newtab/i.test(u);
}

function isTradingViewChartUrl(url) {
  return /^https?:\/\/(www\.)?tradingview\.com\/chart(\/|\?|$)/i.test(String(url || ""));
}

function isTradingViewHostUrl(url) {
  return /^https?:\/\/(www\.)?tradingview\.com(\/|$)/i.test(String(url || ""));
}

function isSignInUrl(url) {
  return /signin|accounts\/login|\/#signin/i.test(String(url || ""));
}

function selectChartTarget(targets) {
  const pages = (targets || []).filter(
    (t) => t && (t.type === "page" || t.type === "webview") && t.url
  );
  const usable = pages.filter((t) => !isIgnoredTargetUrl(t.url));
  return (
    usable.find((t) => isTradingViewChartUrl(t.url)) ||
    usable.find((t) => isTradingViewHostUrl(t.url) && !isSignInUrl(t.url)) ||
    usable.find((t) => isTradingViewHostUrl(t.url)) ||
    null
  );
}

function summarizeCdpTargets(targets) {
  const pages = (targets || []).filter((t) => t && (t.type === "page" || t.type === "webview"));
  return {
    page_target_count: pages.length,
    target_urls: pages.map((t) => sanitizeTargetUrl(t.url)),
  };
}

async function listCdpTargets(cfg, opts = {}) {
  const url = `http://127.0.0.1:${cfg.cdpPort}/json/list`;
  const { status, json } = await fetchJson(url, 2000, opts.http || http);
  if (status < 200 || status >= 300) {
    return { targets: [], error: `http_${status}` };
  }
  return { targets: Array.isArray(json) ? json : [] };
}

function isNavigableBlankTarget(url) {
  const u = String(url || "");
  if (/^(chrome-extension|devtools|edge|brave):/i.test(u)) return false;
  return /^(about:blank)$/i.test(u) || /newtab|new-tab-page|chrome\/newtab/i.test(u);
}

async function probeCdpOnce(cfg, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 400;
  try {
    const { status, json } = await fetchJson(
      `http://127.0.0.1:${cfg.cdpPort}/json/version`,
      timeoutMs,
      opts.http || http
    );
    return Boolean(status >= 200 && status < 300 && json);
  } catch {
    return false;
  }
}

async function navigateTarget(target, url, cfg, CDPImpl) {
  const CDP = CDPImpl || require("chrome-remote-interface");
  const client = await CDP({
    host: "127.0.0.1",
    port: cfg.cdpPort,
    target: target.id || target,
  });
  try {
    if (client.Page && typeof client.Page.navigate === "function") {
      await client.Page.enable();
      await client.Page.navigate({ url });
    }
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}

async function createChartTarget(url, cfg, CDPImpl) {
  const CDP = CDPImpl || require("chrome-remote-interface");
  const client = await CDP({ host: "127.0.0.1", port: cfg.cdpPort });
  try {
    if (client.Target && typeof client.Target.createTarget === "function") {
      return await client.Target.createTarget({ url });
    }
    return null;
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}

async function closeBrowserViaCdp(cfg, CDPImpl) {
  const CDP = CDPImpl || require("chrome-remote-interface");
  let client;
  try {
    client = await CDP({ host: "127.0.0.1", port: cfg.cdpPort });
    if (client.Browser && typeof client.Browser.close === "function") {
      await client.Browser.close();
    }
  } catch {
    /* CDP already gone */
  } finally {
    try {
      if (client) client.close();
    } catch {
      /* ignore */
    }
  }
}

function killChildTree(child) {
  if (!child) return;
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  const pid = child.pid;
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      /* not a process-group leader, or already gone */
    }
  }
}

function truthyAuthFlag(value) {
  return value === true || value === "true" || value === "yes" || value === 1;
}

function falseyAuthFlag(value) {
  return value === false || value === "false" || value === "no" || value === 0;
}

/**
 * Fail-closed auth resolution from page signals.
 * Never treats missing header-menu nodes as logged-in.
 * Never copies usernames, ids, tokens, or cookies.
 */
function resolveAuthFromSignals(probe = {}) {
  const url = String(probe.url || "");
  const winAuth = probe.windowIsAuthenticated;
  const signedOutUi =
    Boolean(probe.hasSignInControl) ||
    Boolean(probe.hasAnonymousMenu) ||
    isSignInUrl(url);

  if (falseyAuthFlag(winAuth)) {
    return { authenticated: "no", reason: "WINDOW_IS_AUTHENTICATED_FALSE" };
  }
  if (signedOutUi && !truthyAuthFlag(winAuth)) {
    return { authenticated: "no", reason: "AUTH_REQUIRED" };
  }

  const loggedInSignals = [
    truthyAuthFlag(winAuth) && "WINDOW_IS_AUTHENTICATED",
    probe.hasUserUsername && "USER_USERNAME_PRESENT",
    probe.hasUserId && "USER_ID_PRESENT",
    probe.hasSignOut && "SIGN_OUT_CONTROL",
    probe.hasAccountMenu && "ACCOUNT_MENU",
    probe.hasLoggedMenuClass && "LOGGED_MENU_CLASS",
    probe.hasProfileLink && "PROFILE_LINK",
  ].filter(Boolean);

  if (loggedInSignals.length) {
    return { authenticated: "yes", reason: "CHART_AUTHENTICATED" };
  }
  if (probe.authenticated === true || probe.authenticated === "yes") {
    return { authenticated: "yes", reason: probe.reason || "CHART_AUTHENTICATED" };
  }
  if (probe.authenticated === false || probe.authenticated === "no") {
    return { authenticated: "no", reason: probe.reason || "AUTH_REQUIRED" };
  }
  return { authenticated: "unknown", reason: "CHART_READY_AUTH_UNKNOWN" };
}

function interpretPageProbe(probe) {
  const prior = (probe && probe.authSignals) || {};
  const normalized = {
    ...probe,
    windowIsAuthenticated:
      probe?.windowIsAuthenticated !== undefined
        ? probe.windowIsAuthenticated
        : prior.window_is_authenticated,
    hasUserUsername: probe?.hasUserUsername ?? prior.has_user_username,
    hasUserId: probe?.hasUserId ?? prior.has_user_id,
    hasSignInControl: probe?.hasSignInControl ?? prior.has_sign_in,
    hasAnonymousMenu: probe?.hasAnonymousMenu ?? prior.has_anonymous_menu,
    hasAccountMenu: probe?.hasAccountMenu ?? prior.has_account_menu,
    hasSignOut: probe?.hasSignOut ?? prior.has_sign_out,
    hasProfileLink: probe?.hasProfileLink ?? prior.has_profile_link,
    hasLoggedMenuClass: probe?.hasLoggedMenuClass ?? prior.has_logged_menu_class,
    userishDataNames: probe?.userishDataNames || prior.userish_data_names,
  };
  const url = String(normalized.url || "");
  const title = String(normalized.title || "");
  const readyState = normalized.readyState || null;
  const auth = resolveAuthFromSignals({ ...normalized, url });
  const authenticated = auth.authenticated;

  const chartUrl = isTradingViewChartUrl(url);
  const documentReady = readyState === "complete" || readyState === "interactive";
  const chartChrome = Boolean(
    normalized.hasSymbolSearch || normalized.hasHeaderToolbar || normalized.hasTvApi || normalized.hasChartCanvas
  );
  let ready = false;
  let reason = auth.reason;
  if (typeof normalized.ready === "boolean") {
    ready = normalized.ready && chartUrl && authenticated !== "no";
    if (normalized.ready && !chartUrl) reason = "URL_NOT_CHART";
    else if (authenticated === "no") reason = auth.reason;
    else if (normalized.ready && authenticated === "unknown") reason = "CHART_READY_AUTH_UNKNOWN";
    else if (normalized.ready && authenticated === "yes") reason = "CHART_AUTHENTICATED";
  } else {
    ready = chartUrl && documentReady && chartChrome && authenticated !== "no";
    if (authenticated === "no") reason = auth.reason;
    else if (!chartUrl) reason = url ? "URL_NOT_CHART" : "NO_CHART_TARGET";
    else if (!documentReady && readyState) reason = "DOCUMENT_LOADING";
    else if (!chartChrome) reason = "CHART_CHROME_MISSING";
    else if (authenticated === "yes" && ready) reason = "CHART_AUTHENTICATED";
    else if (ready && authenticated === "unknown") reason = "CHART_READY_AUTH_UNKNOWN";
    else if (!ready) reason = "NOT_READY";
  }
  if (authenticated === "no") ready = false;

  const userishNames = Array.isArray(normalized.userishDataNames)
    ? normalized.userishDataNames.filter((n) => typeof n === "string" && n && !/token|cookie|password|secret|authorization/i.test(n)).slice(0, 20)
    : [];

  return {
    ready,
    authenticated,
    url: url ? sanitizeTargetUrl(url) : null,
    title: title || null,
    pineEditor: Boolean(normalized.pineEditor),
    readyState,
    reason,
    hasSymbolSearch: Boolean(normalized.hasSymbolSearch),
    hasAccountMenu: Boolean(normalized.hasAccountMenu),
    hasSignInControl: Boolean(normalized.hasSignInControl),
    authSignals: {
      window_is_authenticated:
        normalized.windowIsAuthenticated === true
          ? true
          : normalized.windowIsAuthenticated === false
            ? false
            : null,
      has_user_username: Boolean(normalized.hasUserUsername),
      has_user_id: Boolean(normalized.hasUserId),
      has_sign_in: Boolean(normalized.hasSignInControl),
      has_anonymous_menu: Boolean(normalized.hasAnonymousMenu),
      has_account_menu: Boolean(normalized.hasAccountMenu),
      has_sign_out: Boolean(normalized.hasSignOut),
      has_profile_link: Boolean(normalized.hasProfileLink),
      has_logged_menu_class: Boolean(normalized.hasLoggedMenuClass),
      userish_data_names: userishNames,
    },
  };
}

async function evaluateOnTarget(target, cfg, script, CDPImpl) {
  const CDP = CDPImpl || require("chrome-remote-interface");
  const client = await CDP({
    host: "127.0.0.1",
    port: cfg.cdpPort,
    target: target.id || target,
  });
  try {
    await client.Runtime.enable();
    const result = await client.Runtime.evaluate({
      expression: script,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
    }
    return result.result && result.result.value;
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}

function createRuntime(deps = {}) {
  const spawnFn = deps.spawn || spawn;
  const existsSyncFn = deps.existsSync || fs.existsSync;
  const mkdirFn = deps.mkdirSync || fs.mkdirSync;
  const httpMod = deps.http || http;
  const log = deps.log || ((msg) => console.log(sanitizeLogValue(msg)));

  const state = {
    browserEnabled: false,
    browserRunning: false,
    browserPid: null,
    lastExitCode: null,
    lastExitSignal: null,
    cdpReady: false,
    lastCdpError: null,
    startedAt: null,
    userDataDir: null,
    executable: null,
    page: {
      ready: false,
      authenticated: "unknown",
      url: null,
      title: null,
      pineEditor: false,
      readyState: null,
      reason: "NOT_PROBED",
      targetCount: null,
    },
    child: null,
    restarting: false,
    stopping: false,
    adoptedCdp: false,
    ensuredChartPage: false,
    spawnCount: 0,
    restartAttempts: 0,
    pendingRestart: null,
    lastExitHandled: null,
    sessionBootstrap: null,
  };

  function sessionTransfer() {
    return deps.sessionTransfer || require("./tradingview-session-transfer");
  }

  function snapshot() {
    const cfg = browserConfig(deps.env || process.env);
    const transfer = sessionTransfer();
    const files =
      typeof transfer.inspectBootstrapFiles === "function"
        ? transfer.inspectBootstrapFiles({ env: deps.env || process.env, fs: deps.fs || fs })
        : {};
    const bootstrap =
      state.sessionBootstrap ||
      (typeof transfer.emptyBootstrapSummary === "function"
        ? transfer.emptyBootstrapSummary(files)
        : { status: "none", items: null });
    const browser = !cfg.enabled
      ? "disabled"
      : state.browserRunning
        ? "ok"
        : "fail";
    const cdp = state.cdpReady ? "ok" : "fail";
    let tradingview = "fail";
    if (state.page.authenticated === "no") tradingview = "not_authenticated";
    else if (state.page.ready) tradingview = "ready";
    else if (state.cdpReady) tradingview = "not_ready";
    const overall =
      cfg.enabled && browser === "ok" && cdp === "ok" && tradingview === "ready"
        ? "ok"
        : "degraded";
    let error_class = null;
    if (cfg.enabled && browser === "fail") error_class = MCP_ERROR_CLASSES.BROWSER_NOT_RUNNING;
    else if (cdp === "fail") error_class = MCP_ERROR_CLASSES.CDP_UNREACHABLE;
    else if (tradingview === "not_authenticated") {
      error_class = MCP_ERROR_CLASSES.TRADINGVIEW_AUTH_REQUIRED;
    } else if (tradingview === "not_ready" || tradingview === "fail") {
      error_class = MCP_ERROR_CLASSES.TRADINGVIEW_PAGE_NOT_READY;
    }
    return {
      status: overall,
      mcp_http: "ok",
      browser,
      cdp,
      tradingview,
      authenticated: state.page.authenticated,
      browser_process: browser,
      tradingview_page: tradingview,
      error_class,
      cdp_bind: "127.0.0.1",
      user_data_dir: state.userDataDir || cfg.userDataDir,
      headless: cfg.headless,
      pid: state.browserPid,
      selected_target_url: state.page.url || null,
      page_ready_state: state.page.readyState || null,
      detection_reason: state.page.reason || null,
      page_target_count: state.page.targetCount ?? null,
      auth_signals: state.page.authSignals || null,
      spawn_count: state.spawnCount,
      restart_attempts: state.restartAttempts,
      adopted_cdp: Boolean(state.adoptedCdp),
      ensured_chart_page: Boolean(state.ensuredChartPage),
      session_bootstrap: {
        status: bootstrap.status || "none",
        artifact_present: Boolean(files.artifact_present),
        consumed: Boolean(files.consumed || bootstrap.consumed),
        secret_configured: Boolean(files.secret_configured),
        items: bootstrap.items == null ? null : bootstrap.items,
        reason: bootstrap.reason || null,
      },
      profile_copy_required: false,
    };
  }

  function attachChild(child) {
    state.child = child;
    state.browserPid = child.pid || null;
    state.browserRunning = true;
    state.startedAt = Date.now();
    state.lastExitCode = null;
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", (buf) => {
      const line = String(buf);
      if (!/cookie|token|password|authorization/i.test(line)) {
        log(`[browser:stderr] ${sanitizeLogValue(line.trim())}`);
      }
    });
    child.on("exit", (code, signal) => {
      state.lastExitHandled = handleChildExit(code, signal).catch((err) => {
        log(`[browser] exit handler failed: ${sanitizeLogValue(err instanceof Error ? err.message : err)}`);
      });
    });
  }

  async function handleChildExit(code, signal) {
    state.lastExitCode = code;
    state.lastExitSignal = signal;
    state.child = null;
    state.browserPid = null;
    log(`[browser] process exited code=${code} signal=${signal || ""}`);
    if (state.stopping) {
      state.browserRunning = false;
      state.cdpReady = false;
      return;
    }
    const cfg = browserConfig(deps.env || process.env);
    if (await probeCdpOnce(cfg, { http: httpMod })) {
      // macOS Google Chrome often exits the launcher after handing off to an
      // already-running Chrome. CDP is still live — adopt it. Do not spawn.
      state.adoptedCdp = true;
      state.browserRunning = true;
      state.cdpReady = true;
      state.lastCdpError = null;
      log("[browser] launcher exited but CDP is still live — adopting existing browser (no respawn)");
      return;
    }
    state.browserRunning = false;
    state.cdpReady = false;
    if (!cfg.enabled) return;
    scheduleRestart("unexpected exit and CDP is down");
  }

  function scheduleRestart(reason) {
    if (state.stopping || state.pendingRestart) return;
    if (state.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      log(
        `[browser] restart storm protection: refusing further restarts after ${state.restartAttempts} attempts`
      );
      return;
    }
    const delayMs = Math.min(
      (deps.restartDelayMs ?? 1000) * Math.pow(2, state.restartAttempts),
      30_000
    );
    state.restartAttempts += 1;
    log(
      `[browser] ${reason} — scheduling restart ${state.restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${delayMs}ms`
    );
    state.pendingRestart = setTimeout(() => {
      state.pendingRestart = null;
      if (state.stopping) return;
      restart().catch((err) => {
        log(`[browser] restart failed: ${sanitizeLogValue(err instanceof Error ? err.message : err)}`);
      });
    }, delayMs);
  }

  async function ensureSingleChartPage(cfg) {
    if (state.ensuredChartPage) {
      log("[browser] chart page already ensured — not creating another tab");
      return { created: false, reused: true };
    }
    let targets = [];
    try {
      const listed = await listCdpTargets(cfg, { http: httpMod });
      targets = listed.targets || [];
    } catch (err) {
      log(
        `[browser] target list failed while ensuring chart: ${sanitizeLogValue(err instanceof Error ? err.message : err)}`
      );
      return { created: false, error: true };
    }
    const summary = summarizeCdpTargets(targets);
    state.page.targetCount = summary.page_target_count;
    const existing = selectChartTarget(targets);
    if (existing && isTradingViewChartUrl(existing.url)) {
      state.ensuredChartPage = true;
      log(`[browser] reusing existing chart target url=${sanitizeTargetUrl(existing.url)}`);
      return { created: false, reused: true, target: existing };
    }
    const pages = targets.filter((t) => t && (t.type === "page" || t.type === "webview"));
    const blank = pages.find((t) => isNavigableBlankTarget(t.url));
    const navigateFn = deps.navigatePage || ((target, url) => navigateTarget(target, url, cfg, deps.CDP));
    const createFn = deps.createTarget || ((url) => createChartTarget(url, cfg, deps.CDP));
    try {
      if (blank) {
        log("[browser] navigating existing blank/newtab to chart (no extra tab)");
        await navigateFn(blank, cfg.url);
        state.ensuredChartPage = true;
        return { created: false, navigated: true };
      }
      log("[browser] no chart or blank tab — creating one chart target");
      await createFn(cfg.url);
      state.ensuredChartPage = true;
      return { created: true };
    } catch (err) {
      log(
        `[browser] failed to open a single chart page: ${sanitizeLogValue(err instanceof Error ? err.message : err)}`
      );
      return { created: false, error: true };
    }
  }

  async function adoptExistingCdp(cfg) {
    if (!(await probeCdpOnce(cfg, { http: httpMod }))) return false;
    state.adoptedCdp = true;
    state.browserRunning = true;
    state.cdpReady = true;
    state.lastCdpError = null;
    state.startedAt = state.startedAt || Date.now();
    state.userDataDir = state.userDataDir || cfg.userDataDir;
    log("[browser] adopting already-running Chromium on 127.0.0.1 (no second spawn)");
    return true;
  }

  async function reloadSelectedChart(cfg) {
    let targets = [];
    try {
      const listed = await listCdpTargets(cfg, { http: httpMod });
      targets = listed.targets || [];
    } catch (err) {
      log(
        `[browser] reload target list failed: ${sanitizeLogValue(err instanceof Error ? err.message : err)}`
      );
      return { reloaded: false };
    }
    const selected = selectChartTarget(targets);
    if (!selected) return { reloaded: false };
    const navigateFn = deps.navigatePage || ((target, url) => navigateTarget(target, url, cfg, deps.CDP));
    log(`[browser] reloading chart after session import url=${sanitizeTargetUrl(selected.url)}`);
    await navigateFn(selected, cfg.url);
    return { reloaded: true };
  }

  async function importSessionIfPresent(cfg) {
    const transfer = sessionTransfer();
    if (typeof transfer.resolveImportRequest !== "function") {
      return { applied: false, skipped: true, reason: "NO_TRANSFER" };
    }
    const env = deps.env || process.env;
    const fsMod = deps.fs || fs;
    let request;
    try {
      request = transfer.resolveImportRequest({ env, fs: fsMod });
    } catch (err) {
      const reason = err && err.code ? err.code : "IMPORT_FAILED";
      state.sessionBootstrap = { status: "failed", reason, items: null };
      log(`[session-import] fail closed: ${reason}`);
      return { applied: false, error: reason };
    }
    if (!request.shouldImport) {
      if (request.failClosed) {
        state.sessionBootstrap = {
          status: "failed",
          reason: "SECRET_REQUIRED",
          items: null,
          artifact_present: true,
        };
        log("[session-import] fail closed: artifact present but TRADINGVIEW_SESSION_BOOTSTRAP_SECRET is unset");
        return { applied: false, error: "SECRET_REQUIRED" };
      }
      state.sessionBootstrap = {
        status: request.reason === "ALREADY_CONSUMED" ? "consumed" : "none",
        reason: request.reason,
        items: null,
      };
      return { applied: false, skipped: true, reason: request.reason };
    }
    try {
      const imported = await transfer.importSessionFromArtifact({
        env,
        fs: fsMod,
        request,
        log,
        host: "127.0.0.1",
        port: cfg.cdpPort,
        CDP: deps.CDP,
        applyCookies: deps.applyCookies,
      });
      state.sessionBootstrap = {
        ...(imported.summary || {}),
        status: imported.applied ? "imported" : imported.summary?.status || "none",
        reason: imported.reason,
        items: imported.summary?.items ?? null,
      };
      return imported;
    } catch (err) {
      const reason = err && err.code ? err.code : "IMPORT_FAILED";
      state.sessionBootstrap = { status: "failed", reason, items: null };
      log(`[session-import] fail closed: ${reason}`);
      return { applied: false, error: reason };
    }
  }

  async function importThenOpenChart(cfg) {
    const imported = await importSessionIfPresent(cfg);
    const ensured = await ensureSingleChartPage(cfg);
    if (imported && imported.applied && ensured && ensured.reused) {
      await reloadSelectedChart(cfg);
    }
    if (imported && imported.applied) {
      const settleMs = deps.importSettleMs ?? 0;
      if (settleMs > 0) {
        await new Promise((r) => setTimeout(r, settleMs));
      }
    }
    return imported;
  }

  async function start(opts = {}) {
    const cfg = browserConfig(deps.env || process.env);
    state.browserEnabled = cfg.enabled;
    if (!cfg.enabled) {
      log("[browser] TRADINGVIEW_BROWSER_ENABLED=false — not launching Chromium");
      return snapshot();
    }
    if (state.restarting) {
      return snapshot();
    }
    if (state.browserRunning && (state.child || state.adoptedCdp || state.cdpReady)) {
      log("[browser] start() is a no-op — browser already running");
      return snapshot();
    }
    state.stopping = false;
    if (String(cfg.cdpHost) !== "127.0.0.1" && String(cfg.cdpHost) !== "localhost") {
      log(
        `[browser] CDP_HOST=${cfg.cdpHost} ignored for bind; Chromium listens on 127.0.0.1 only`
      );
    }
    const preferAdopt = opts.preferAdopt !== false;
    if (preferAdopt && (await adoptExistingCdp(cfg))) {
      await importThenOpenChart(cfg);
      return snapshot();
    }
    state.userDataDir = ensureUserDataDir(cfg.userDataDir, mkdirFn);
    reconcileProfileLocks(state.userDataDir, {
      fs: deps.fs || fs,
      log,
      hostname: deps.hostname,
      readProcessInfo: deps.readProcessInfo,
      listPids: deps.listPids,
    });
    state.executable = resolveExecutable(cfg, existsSyncFn);
    if (cfg.resetSessionRestore) {
      const removed = resetChromeSessionRestore(state.userDataDir, deps.fs || fs);
      if (removed.length) {
        log(`[browser] reset session restore files: ${removed.join(",")}`);
      }
    }
    // Never pass the chart URL here. Persistent profiles restore prior tabs;
    // appending the URL would add another /chart/ tab on every spawn.
    const args = chromiumArgs(cfg, { includeUrl: false });
    log(
      `[browser] launching ${state.executable} cdp=127.0.0.1:${cfg.cdpPort} profile=${state.userDataDir} headless=${cfg.headless} spawn=${state.spawnCount + 1}`
    );
    const child = spawnFn(state.executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: state.userDataDir },
    });
    state.spawnCount += 1;
    state.adoptedCdp = false;
    attachChild(child);

    const cdp = await waitForCdp(cfg, { http: httpMod, timeoutMs: cfg.startupTimeoutMs });
    state.cdpReady = cdp.ok;
    state.lastCdpError = cdp.ok ? null : cdp.error;
    if (!cdp.ok) {
      log(`[browser] CDP startup failed: ${sanitizeLogValue(cdp.error)}`);
    } else {
      log("[browser] CDP is ready on 127.0.0.1");
      await importThenOpenChart(cfg);
    }
    return snapshot();
  }

  async function stop() {
    state.stopping = true;
    if (state.pendingRestart) {
      clearTimeout(state.pendingRestart);
      state.pendingRestart = null;
    }
    const cfg = browserConfig(deps.env || process.env);
    const child = state.child;
    state.child = null;
    if (child) {
      killChildTree(child);
    }
    if (state.adoptedCdp || state.cdpReady) {
      const closer = deps.closeBrowser || ((c) => closeBrowserViaCdp(c, deps.CDP));
      try {
        await closer(cfg);
      } catch {
        /* ignore */
      }
    }
    state.browserRunning = false;
    state.cdpReady = false;
    state.browserPid = null;
    state.adoptedCdp = false;
    state.ensuredChartPage = false;
  }

  async function restart() {
    if (state.restarting) return snapshot();
    if (state.restartAttempts > MAX_RESTART_ATTEMPTS) {
      log("[browser] restart storm protection: max attempts exceeded");
      return snapshot();
    }
    state.restarting = true;
    try {
      const wasStopping = state.stopping;
      await stop();
      state.stopping = wasStopping;
      if (state.stopping) return snapshot();
      await new Promise((r) => setTimeout(r, deps.restartGapMs ?? 400));
      const cfg = browserConfig(deps.env || process.env);
      if (await probeCdpOnce(cfg, { http: httpMod })) {
        log("[browser] previous browser still owns CDP — adopting instead of spawning another instance");
        await adoptExistingCdp(cfg);
        await importThenOpenChart(cfg);
        return snapshot();
      }
      return await start({ preferAdopt: false });
    } finally {
      state.restarting = false;
    }
  }

  function applyPageProbe(probe) {
    const interpreted = interpretPageProbe(probe);
    state.page = {
      ...state.page,
      ...interpreted,
    };
    return state.page;
  }

  async function probeAndApply(opts = {}) {
    const cfg = browserConfig(deps.env || process.env);
    let targets = opts.targets;
    if (!targets) {
      const listed = await listCdpTargets(cfg, { http: httpMod });
      targets = listed.targets;
    }
    const summary = summarizeCdpTargets(targets);
    state.page.targetCount = summary.page_target_count;
    log(
      `[browser] cdp page targets=${summary.page_target_count} urls=${summary.target_urls.join(" | ") || "(none)"}`
    );
    const selected = selectChartTarget(targets);
    if (!selected) {
      applyPageProbe({
        url: "",
        ready: false,
        authenticated: "unknown",
        reason: "NO_CHART_TARGET",
        readyState: null,
      });
      log("[browser] selected target=none reason=NO_CHART_TARGET");
      return snapshot();
    }
    const selectedUrl = sanitizeTargetUrl(selected.url);
    log(`[browser] selected target url=${selectedUrl}`);
    const evaluate =
      opts.evaluate ||
      ((script) => evaluateOnTarget(selected, cfg, script, opts.CDP));
    let probe;
    try {
      probe = (await evaluate(tradingViewProbeScript())) || {};
    } catch (err) {
      applyPageProbe({
        url: selectedUrl,
        ready: false,
        authenticated: "unknown",
        reason: "PROBE_EVAL_FAILED",
      });
      log(
        `[browser] probe failed: ${sanitizeLogValue(err instanceof Error ? err.message : err)}`
      );
      return snapshot();
    }
    applyPageProbe({ ...probe, url: probe.url || selectedUrl });
    const after = snapshot();
    const signals = after.auth_signals || {};
    log(
      `[browser] probe readyState=${after.page_ready_state || "unknown"} chart=${after.tradingview} authenticated=${after.authenticated} reason=${after.detection_reason || ""}`
    );
    log(
      `[browser] auth_signals is_authenticated=${signals.window_is_authenticated} has_user_username=${signals.has_user_username} has_user_id=${signals.has_user_id} sign_in=${signals.has_sign_in} anonymous_menu=${signals.has_anonymous_menu} account_menu=${signals.has_account_menu} sign_out=${signals.has_sign_out} profile_link=${signals.has_profile_link}`
    );
    if (signals.userish_data_names && signals.userish_data_names.length) {
      log(`[browser] userish_data_names=${signals.userish_data_names.join(",")}`);
    }
    return after;
  }

  function assertReadyForTools() {
    const snap = snapshot();
    if (snap.browser === "fail") {
      throw classifyConnectError(new Error("browser down"), {
        browserEnabled: true,
        browserRunning: false,
        cdpReady: false,
      });
    }
    if (snap.cdp !== "ok") {
      throw classifyConnectError(new Error(state.lastCdpError || "cdp down"), {
        browserEnabled: true,
        browserRunning: true,
        cdpReady: false,
      });
    }
    const pageErr = classifyPageState(state.page);
    if (pageErr) throw pageErr;
    return snap;
  }

  return {
    state,
    snapshot,
    start,
    stop,
    restart,
    applyPageProbe,
    probeAndApply,
    ensureSingleChartPage,
    importSessionIfPresent,
    importThenOpenChart,
    reloadSelectedChart,
    assertReadyForTools,
    config: () => browserConfig(deps.env || process.env),
    waitForCdp: (cfg, opts) => waitForCdp(cfg || browserConfig(deps.env || process.env), { ...opts, http: httpMod }),
  };
}

function tradingViewProbeScript() {
  return `
    (function() {
      var url = location.href || '';
      var title = document.title || '';
      var readyState = document.readyState || '';
      var path = location.pathname || '';
      var host = (location.hostname || '').toLowerCase();
      var isTvHost = /(^|\\.)tradingview\\.com$/.test(host);
      var isChartPath = /^\\/chart(\\/|$)/.test(path);
      var isSignInUrl = /signin|accounts\\/login|#signin/i.test(url);

      function guestName(name) {
        return !name || /^guest$/i.test(String(name));
      }
      function readUser(obj) {
        if (!obj || typeof obj !== 'object') {
          return { hasUsername: false, hasId: false };
        }
        var name = obj.username;
        var hasUsername = typeof name === 'string' && name.length > 0 && !guestName(name);
        var id = obj.id;
        var hasId = id != null && String(id) !== '' && String(id) !== '0';
        return { hasUsername: hasUsername, hasId: hasId };
      }

      var windowIsAuthenticated = null;
      if (window.is_authenticated === true || window.is_authenticated === 1) windowIsAuthenticated = true;
      else if (window.is_authenticated === false || window.is_authenticated === 0) windowIsAuthenticated = false;

      var userObj = null;
      try { if (typeof window.user !== 'undefined') userObj = window.user; } catch (e1) {}
      try {
        if (!userObj && window.TradingViewApi && window.TradingViewApi.user) userObj = window.TradingViewApi.user;
      } catch (e2) {}
      var userBits = readUser(userObj);
      if (userObj && (userObj.is_authenticated === true || userObj.authenticated === true)) {
        windowIsAuthenticated = windowIsAuthenticated === false ? false : true;
      }

      var hasSignInControl = !!(
        document.querySelector('[data-name="header-user-menu-sign-in"]')
        || document.querySelector('[data-name="login-page-email-button"]')
      );
      if (!hasSignInControl) {
        var controls = document.querySelectorAll('button, a, [role="button"]');
        for (var i = 0; i < controls.length; i++) {
          var text = (controls[i].textContent || '').replace(/\\s+/g, ' ').trim();
          var label = (controls[i].getAttribute('aria-label') || '').trim();
          var name = controls[i].getAttribute('data-name') || '';
          if (/header-user-menu-sign-in/i.test(name)) { hasSignInControl = true; break; }
          if (/^sign in$/i.test(text) || /^sign in$/i.test(label)) { hasSignInControl = true; break; }
        }
      }

      var hasAnonymousMenu = !!(
        document.querySelector('[class*="user-menu-button--anonymous"]')
        || document.querySelector('[class*="userMenuButtonAnonymous"]')
        || document.querySelector('[class*="tv-header__user-menu-button--anonymous"]')
      );
      var hasLoggedMenuClass = !!(
        document.querySelector('[class*="user-menu-button--logged"]')
        || document.querySelector('[class*="tv-header__user-menu-button--logged"]')
      );
      var hasAccountMenu = !!(
        document.querySelector('[data-name="header-user-menu-button"]')
        || document.querySelector('[data-name="header-user-menu"]')
        || document.querySelector('[data-name="user-menu-button"]')
        || document.querySelector('[data-name="header-toolbar-user-menu"]')
      );
      if (hasAnonymousMenu) hasAccountMenu = false;
      var hasSignOut = !!(
        document.querySelector('[data-name="header-user-menu-sign-out"]')
        || document.querySelector('[data-name="header-user-menu-logout"]')
      );
      var hasProfileLink = !!document.querySelector('a[href^="/u/"], a[href*="tradingview.com/u/"]');

      var userishDataNames = [];
      var named = document.querySelectorAll('[data-name]');
      for (var d = 0; d < named.length && userishDataNames.length < 20; d++) {
        var dn = named[d].getAttribute('data-name') || '';
        if (/user|account|avatar|profile|sign|login|logout/i.test(dn) && userishDataNames.indexOf(dn) === -1) {
          userishDataNames.push(dn);
        }
      }

      var hasSymbolSearch = !!(
        document.querySelector('#header-toolbar-symbol-search')
        || document.querySelector('[data-name="header-toolbar-symbol-search"]')
        || document.querySelector('button[aria-label*="Symbol Search" i]')
        || document.querySelector('button[aria-label*="Change symbol" i]')
      );
      var hasHeaderToolbar = !!(
        document.querySelector('#header-toolbar')
        || document.querySelector('[id^="header-toolbar"]')
      );
      var hasTvApi = typeof window.TradingViewApi !== 'undefined' || typeof window.TradingView !== 'undefined';
      var hasChartCanvas = !!document.querySelector('canvas');
      var pine = document.querySelector('[data-testid="pine-editor"]')
        || document.querySelector('.monaco-editor.pine-editor-monaco')
        || document.querySelector('[class*="PineEditor"]');

      var authenticated = 'unknown';
      if (windowIsAuthenticated === false || isSignInUrl || hasSignInControl || hasAnonymousMenu) {
        authenticated = 'no';
      } else if (
        windowIsAuthenticated === true
        || userBits.hasUsername
        || userBits.hasId
        || hasSignOut
        || hasAccountMenu
        || hasLoggedMenuClass
        || hasProfileLink
      ) {
        authenticated = 'yes';
      }

      var chartUrl = isTvHost && isChartPath;
      var documentReady = readyState === 'complete' || readyState === 'interactive';
      var chartChrome = hasSymbolSearch || hasHeaderToolbar || hasTvApi || hasChartCanvas;
      var ready = chartUrl && documentReady && chartChrome && authenticated !== 'no';

      var reason = 'CHART_AUTHENTICATED';
      if (authenticated === 'no' && windowIsAuthenticated === false) reason = 'WINDOW_IS_AUTHENTICATED_FALSE';
      else if (authenticated === 'no') reason = 'AUTH_REQUIRED';
      else if (!isTvHost) reason = 'URL_NOT_TRADINGVIEW';
      else if (!isChartPath) reason = 'URL_NOT_CHART';
      else if (!documentReady) reason = 'DOCUMENT_LOADING';
      else if (!chartChrome) reason = 'CHART_CHROME_MISSING';
      else if (authenticated === 'unknown') reason = 'CHART_READY_AUTH_UNKNOWN';

      return {
        url: url,
        title: title,
        readyState: readyState,
        ready: ready,
        authenticated: authenticated,
        windowIsAuthenticated: windowIsAuthenticated,
        hasUserUsername: userBits.hasUsername,
        hasUserId: userBits.hasId,
        hasSignInControl: hasSignInControl,
        hasAnonymousMenu: hasAnonymousMenu,
        hasAccountMenu: hasAccountMenu,
        hasLoggedMenuClass: hasLoggedMenuClass,
        hasSignOut: hasSignOut,
        hasProfileLink: hasProfileLink,
        userishDataNames: userishDataNames,
        hasSymbolSearch: hasSymbolSearch,
        hasHeaderToolbar: hasHeaderToolbar,
        hasTvApi: hasTvApi,
        hasChartCanvas: hasChartCanvas,
        pineEditor: !!pine,
        reason: reason
      };
    })()
  `;
}

module.exports = {
  DEFAULT_URL,
  DEFAULT_PROFILE,
  getBrowserConfig: browserConfig,
  browserConfig,
  resolveExecutable,
  chromiumArgs,
  ensureUserDataDir,
  waitForCdp,
  fetchJson,
  createRuntime,
  tradingViewProbeScript,
  resetChromeSessionRestore,
  SESSION_RESTORE_RELATIVE,
  MAX_RESTART_ATTEMPTS,
  reconcileProfileLocks,
  probeCdpOnce,
  isNavigableBlankTarget,
  sanitizeTargetUrl,
  isIgnoredTargetUrl,
  isTradingViewChartUrl,
  isTradingViewHostUrl,
  isSignInUrl,
  selectChartTarget,
  summarizeCdpTargets,
  interpretPageProbe,
  resolveAuthFromSignals,
  listCdpTargets,
  MCP_ERROR_CLASSES,
};
