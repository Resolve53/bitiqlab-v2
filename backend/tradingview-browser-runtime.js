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
  };
}

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

function chromiumArgs(cfg) {
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
  args.push(cfg.url);
  return args;
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

function interpretPageProbe(probe) {
  const url = String(probe?.url || "");
  const title = String(probe?.title || "");
  const readyState = probe?.readyState || null;
  let authenticated = "unknown";
  if (probe?.authenticated === true || probe?.authenticated === "yes") {
    authenticated = "yes";
  } else if (probe?.authenticated === false || probe?.authenticated === "no") {
    authenticated = "no";
  } else if (probe?.hasSignInControl || probe?.hasAnonymousMenu || isSignInUrl(url)) {
    authenticated = "no";
  } else if (probe?.hasAccountMenu) {
    authenticated = "yes";
  }

  const chartUrl = isTradingViewChartUrl(url);
  const documentReady = readyState === "complete" || readyState === "interactive";
  const chartChrome = Boolean(
    probe?.hasSymbolSearch || probe?.hasHeaderToolbar || probe?.hasTvApi || probe?.hasChartCanvas
  );
  let ready = false;
  let reason = probe?.reason || null;
  if (typeof probe?.ready === "boolean") {
    ready = probe.ready && chartUrl && authenticated !== "no";
    if (probe.ready && !chartUrl) reason = reason || "URL_NOT_CHART";
    if (probe.ready && authenticated === "no") reason = reason || "AUTH_SIGN_IN";
  } else {
    ready = chartUrl && documentReady && chartChrome && authenticated !== "no";
  }
  if (!reason) {
    if (authenticated === "no") reason = "AUTH_REQUIRED";
    else if (!chartUrl) reason = url ? "URL_NOT_CHART" : "NO_CHART_TARGET";
    else if (!documentReady && readyState) reason = "DOCUMENT_LOADING";
    else if (!chartChrome) reason = "CHART_CHROME_MISSING";
    else if (authenticated === "yes" && ready) reason = "CHART_AUTHENTICATED";
    else if (ready && authenticated === "unknown") reason = "CHART_READY_AUTH_UNKNOWN";
    else if (!ready) reason = "NOT_READY";
  }
  if (authenticated === "no") ready = false;
  return {
    ready,
    authenticated,
    url: url ? sanitizeTargetUrl(url) : null,
    title: title || null,
    pineEditor: Boolean(probe?.pineEditor),
    readyState,
    reason,
    hasSymbolSearch: Boolean(probe?.hasSymbolSearch),
    hasAccountMenu: Boolean(probe?.hasAccountMenu),
    hasSignInControl: Boolean(probe?.hasSignInControl),
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
  };

  function snapshot() {
    const cfg = browserConfig(deps.env || process.env);
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
    };
  }

  async function start() {
    const cfg = browserConfig(deps.env || process.env);
    state.browserEnabled = cfg.enabled;
    state.stopping = false;
    if (!cfg.enabled) {
      log("[browser] TRADINGVIEW_BROWSER_ENABLED=false — not launching Chromium");
      return snapshot();
    }
    if (String(cfg.cdpHost) !== "127.0.0.1" && String(cfg.cdpHost) !== "localhost") {
      log(
        `[browser] CDP_HOST=${cfg.cdpHost} ignored for bind; Chromium listens on 127.0.0.1 only`
      );
    }
    state.userDataDir = ensureUserDataDir(cfg.userDataDir, mkdirFn);
    state.executable = resolveExecutable(cfg, existsSyncFn);
    const args = chromiumArgs(cfg);
    log(
      `[browser] launching ${state.executable} cdp=127.0.0.1:${cfg.cdpPort} profile=${state.userDataDir} headless=${cfg.headless}`
    );
    const child = spawnFn(state.executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: state.userDataDir },
    });
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
      state.browserRunning = false;
      state.cdpReady = false;
      state.lastExitCode = code;
      state.lastExitSignal = signal;
      state.browserPid = null;
      log(`[browser] process exited code=${code} signal=${signal || ""}`);
      const restartDelayMs = deps.restartDelayMs ?? 1000;
      if (!state.stopping && cfg.enabled && !state.restarting) {
        log("[browser] unexpected exit — scheduling restart");
        setTimeout(() => {
          if (!state.stopping) {
            restart().catch((err) => {
              log(`[browser] restart failed: ${sanitizeLogValue(err instanceof Error ? err.message : err)}`);
            });
          }
        }, restartDelayMs);
      }
    });

    const cdp = await waitForCdp(cfg, { http: httpMod, timeoutMs: cfg.startupTimeoutMs });
    state.cdpReady = cdp.ok;
    state.lastCdpError = cdp.ok ? null : cdp.error;
    if (!cdp.ok) {
      log(`[browser] CDP startup failed: ${sanitizeLogValue(cdp.error)}`);
    } else {
      log("[browser] CDP is ready on 127.0.0.1");
    }
    return snapshot();
  }

  async function stop() {
    state.stopping = true;
    const child = state.child;
    state.child = null;
    if (child && state.browserRunning) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    state.browserRunning = false;
    state.cdpReady = false;
    state.browserPid = null;
  }

  async function restart() {
    if (state.restarting) return snapshot();
    state.restarting = true;
    try {
      await stop();
      await new Promise((r) => setTimeout(r, 400));
      return await start();
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
    log(
      `[browser] probe readyState=${after.page_ready_state || "unknown"} chart=${after.tradingview} authenticated=${after.authenticated} reason=${after.detection_reason || ""}`
    );
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
      );
      var hasAccountMenu = !!(
        document.querySelector('[data-name="header-user-menu-button"]')
        || document.querySelector('[data-name="header-user-menu"]')
      );
      if (hasAnonymousMenu) hasAccountMenu = false;
      if (!hasAccountMenu && !hasAnonymousMenu) {
        var openMenu = document.querySelector('button[aria-label="Open user menu"], button[aria-label*="Open user menu" i]');
        if (openMenu && !/anonymous/i.test(openMenu.className || '')) {
          if (openMenu.querySelector('img, [class*="avatar" i]')) hasAccountMenu = true;
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
      if (isSignInUrl || hasSignInControl || hasAnonymousMenu) authenticated = 'no';
      else if (hasAccountMenu) authenticated = 'yes';

      var chartUrl = isTvHost && isChartPath;
      var documentReady = readyState === 'complete' || readyState === 'interactive';
      var chartChrome = hasSymbolSearch || hasHeaderToolbar || hasTvApi || hasChartCanvas;
      var ready = chartUrl && documentReady && chartChrome && authenticated !== 'no';

      var reason = 'CHART_AUTHENTICATED';
      if (authenticated === 'no') reason = 'AUTH_REQUIRED';
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
        hasSignInControl: hasSignInControl,
        hasAnonymousMenu: hasAnonymousMenu,
        hasAccountMenu: hasAccountMenu,
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
  sanitizeTargetUrl,
  isIgnoredTargetUrl,
  isTradingViewChartUrl,
  isTradingViewHostUrl,
  isSignInUrl,
  selectChartTarget,
  summarizeCdpTargets,
  interpretPageProbe,
  listCdpTargets,
  MCP_ERROR_CLASSES,
};
