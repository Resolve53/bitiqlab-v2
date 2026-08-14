import { createRequire } from "module";
import path from "path";
import { describe, expect, it } from "vitest";

const requireCjs = createRequire(path.join(process.cwd(), "package.json"));
const {
  createRuntime,
  selectChartTarget,
  summarizeCdpTargets,
  isTradingViewChartUrl,
  isIgnoredTargetUrl,
  interpretPageProbe,
  sanitizeTargetUrl,
} = requireCjs(path.join(process.cwd(), "tradingview-browser-runtime.js"));

function runtime() {
  return createRuntime({
    env: { TRADINGVIEW_BROWSER_ENABLED: "true" },
    spawn: () => {
      throw new Error("must not spawn in page-detection unit tests");
    },
    log: () => {},
    restartDelayMs: 60_000,
  });
}

const CHROME_NEWTAB = {
  id: "t-newtab",
  type: "page",
  url: "chrome://new-tab-page/",
  title: "New Tab",
};
const ABOUT_BLANK = {
  id: "t-blank",
  type: "page",
  url: "about:blank",
  title: "",
};
const EXTENSION = {
  id: "t-ext",
  type: "page",
  url: "chrome-extension://abcdef/popup.html",
  title: "ext",
};
const SERVICE_WORKER = {
  id: "t-sw",
  type: "service_worker",
  url: "https://www.tradingview.com/sw.js",
  title: "sw",
};
const TV_HOME = {
  id: "t-home",
  type: "page",
  url: "https://www.tradingview.com/",
  title: "TradingView",
};
const TV_CHART = {
  id: "t-chart",
  type: "page",
  url: "https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT",
  title: "BTCUSDT Chart",
};
const TV_CHART_WWW = {
  id: "t-chart-2",
  type: "page",
  url: "https://tradingview.com/chart/abc123/",
  title: "Chart",
};

describe("CDP target selection", () => {
  it("recognizes www and non-www /chart/ URLs", () => {
    expect(isTradingViewChartUrl("https://www.tradingview.com/chart/")).toBe(true);
    expect(isTradingViewChartUrl("https://tradingview.com/chart/")).toBe(true);
    expect(isTradingViewChartUrl("https://www.tradingview.com/chart/xyz/")).toBe(true);
    expect(isTradingViewChartUrl("https://www.tradingview.com/")).toBe(false);
    expect(isTradingViewChartUrl("chrome://new-tab-page/")).toBe(false);
  });

  it("ignores chrome://, new-tab, about:blank, and extensions", () => {
    expect(isIgnoredTargetUrl("chrome://new-tab-page/")).toBe(true);
    expect(isIgnoredTargetUrl("about:blank")).toBe(true);
    expect(isIgnoredTargetUrl("chrome-extension://abc/x.html")).toBe(true);
    expect(isIgnoredTargetUrl("https://www.tradingview.com/chart/")).toBe(false);
  });

  it("selects the TradingView chart even when it is not the first page target", () => {
    const selected = selectChartTarget([
      CHROME_NEWTAB,
      ABOUT_BLANK,
      EXTENSION,
      SERVICE_WORKER,
      TV_HOME,
      TV_CHART,
    ]);
    expect(selected && selected.id).toBe("t-chart");
    expect(sanitizeTargetUrl(selected.url)).toBe("https://www.tradingview.com/chart/");
  });

  it("does not attach to service workers or stale non-chart targets when a chart exists", () => {
    const selected = selectChartTarget([SERVICE_WORKER, TV_HOME, TV_CHART_WWW]);
    expect(selected && selected.id).toBe("t-chart-2");
  });

  it("summarizes page targets without query tokens", () => {
    const summary = summarizeCdpTargets([CHROME_NEWTAB, TV_CHART, SERVICE_WORKER]);
    expect(summary.page_target_count).toBe(2);
    expect(summary.target_urls).toEqual([
      "chrome://new-tab-page/",
      "https://www.tradingview.com/chart/",
    ]);
    expect(summary.target_urls.join(" ")).not.toMatch(/BINANCE|BTCUSDT|token|session/i);
  });
});

describe("TradingView readiness / auth interpretation", () => {
  it("unprobed default is not_ready + unknown (the previous bootstrap bug)", () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;
    const snap = rt.snapshot();
    expect(snap.browser).toBe("ok");
    expect(snap.cdp).toBe("ok");
    expect(snap.tradingview).toBe("not_ready");
    expect(snap.authenticated).toBe("unknown");
    expect(snap.detection_reason).toBe("NOT_PROBED");
  });

  it("real loaded authenticated chart → tradingview=ready authenticated=yes", () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;
    const interpreted = interpretPageProbe({
      url: "https://www.tradingview.com/chart/",
      title: "BTCUSDT — TradingView",
      readyState: "complete",
      ready: true,
      authenticated: "yes",
      hasAccountMenu: true,
      hasSignInControl: false,
      hasAnonymousMenu: false,
      hasSymbolSearch: true,
      hasHeaderToolbar: true,
      hasTvApi: true,
      hasChartCanvas: true,
      reason: "CHART_AUTHENTICATED",
    });
    expect(interpreted.ready).toBe(true);
    expect(interpreted.authenticated).toBe("yes");
    rt.applyPageProbe(interpreted);
    const snap = rt.snapshot();
    expect(snap.tradingview).toBe("ready");
    expect(snap.authenticated).toBe("yes");
    expect(snap.status).toBe("ok");
  });

  it("unauthenticated TradingView chart → not_authenticated / no", () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;
    rt.applyPageProbe({
      url: "https://www.tradingview.com/chart/",
      title: "Chart",
      readyState: "complete",
      ready: false,
      authenticated: "no",
      hasAnonymousMenu: true,
      hasSignInControl: true,
      hasAccountMenu: false,
      hasSymbolSearch: true,
      hasChartCanvas: true,
      reason: "AUTH_REQUIRED",
    });
    const snap = rt.snapshot();
    expect(snap.tradingview).toBe("not_authenticated");
    expect(snap.authenticated).toBe("no");
    expect(snap.status).toBe("degraded");
    expect(snap.error_class).toBe("TRADINGVIEW_AUTH_REQUIRED");
  });

  it("does not treat a chrome:// target payload as a ready chart", () => {
    const interpreted = interpretPageProbe({
      url: "chrome://new-tab-page/",
      readyState: "complete",
      ready: true,
      authenticated: "unknown",
      hasChartCanvas: false,
    });
    expect(interpreted.ready).toBe(false);
    expect(interpreted.reason).toBe("URL_NOT_CHART");
  });

  it("probeAndApply uses the chart target, not the first chrome:// page", async () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;
    const snap = await rt.probeAndApply({
      targets: [CHROME_NEWTAB, ABOUT_BLANK, TV_CHART],
      evaluate: async () => ({
        url: "https://www.tradingview.com/chart/",
        title: "BTCUSDT — TradingView",
        readyState: "complete",
        ready: true,
        authenticated: "yes",
        hasAccountMenu: true,
        hasSymbolSearch: true,
        hasHeaderToolbar: true,
        hasTvApi: true,
        hasChartCanvas: true,
        reason: "CHART_AUTHENTICATED",
      }),
    });
    expect(snap.selected_target_url).toBe("https://www.tradingview.com/chart/");
    expect(snap.page_target_count).toBe(3);
    expect(snap.tradingview).toBe("ready");
    expect(snap.authenticated).toBe("yes");
    expect(snap.page_ready_state).toBe("complete");
    expect(snap.detection_reason).toBe("CHART_AUTHENTICATED");
  });
});
