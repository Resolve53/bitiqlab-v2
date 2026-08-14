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
    else if (state.page.ready) tradingview = "ok";
    else if (state.cdpReady) tradingview = "not_ready";
    const overall =
      cfg.enabled && browser === "ok" && cdp === "ok" && tradingview === "ok"
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
    const url = String(probe?.url || "");
    const title = String(probe?.title || "");
    let authenticated = "unknown";
    if (probe?.authenticated === true || probe?.authenticated === "yes") {
      authenticated = "yes";
    } else if (probe?.authenticated === false || probe?.authenticated === "no") {
      authenticated = "no";
    } else if (/signin|accounts\/login|\/#signin/i.test(url)) {
      authenticated = "no";
    } else if (probe?.hasUserMenu) {
      authenticated = "yes";
    }
    const ready = Boolean(
      probe?.ready ??
        (/tradingview\.com\/chart/i.test(url) && authenticated !== "no")
    );
    state.page = {
      ready,
      authenticated,
      url: url || null,
      title: title || null,
      pineEditor: Boolean(probe?.pineEditor),
    };
    return state.page;
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
      var signIn = document.querySelector('[data-name="header-user-menu-sign-in"]')
        || Array.from(document.querySelectorAll('button, a')).find(function(el) {
          return /sign in/i.test(el.textContent || el.getAttribute('aria-label') || '');
        });
      var userMenu = document.querySelector('[data-name="header-user-menu"]')
        || document.querySelector('[data-name="user-menu-button"]');
      var chart = document.querySelector('[data-name="legend-source-item"]')
        || document.querySelector('.chart-container')
        || document.querySelector('#header-toolbar-symbol-search')
        || /tradingview\\.com\\/chart/i.test(url);
      var pine = document.querySelector('[data-testid="pine-editor"]')
        || document.querySelector('.monaco-editor.pine-editor-monaco')
        || document.querySelector('[class*="PineEditor"]');
      var authenticated = false;
      if (userMenu && !signIn) authenticated = true;
      if (/signin|accounts\\/login/i.test(url)) authenticated = false;
      return {
        url: url,
        title: title,
        ready: !!chart && !/signin|accounts\\/login/i.test(url),
        authenticated: authenticated,
        hasUserMenu: !!userMenu,
        pineEditor: !!pine
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
  MCP_ERROR_CLASSES,
};
