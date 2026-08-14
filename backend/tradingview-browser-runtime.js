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
      auth_signals: state.page.authSignals || null,
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
