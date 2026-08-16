import { createRequire } from "module";
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const requireCjs = createRequire(path.join(process.cwd(), "package.json"));
const { createRuntime } = requireCjs(
  path.join(process.cwd(), "tradingview-browser-runtime.js")
);
const { MCP_ERROR_CLASSES } = requireCjs(
  path.join(process.cwd(), "tradingview-mcp-errors.js")
);

function runtime() {
  return createRuntime({
    env: { TRADINGVIEW_BROWSER_ENABLED: "true" },
    spawn: () => {
      throw new Error("must not spawn in readiness unit tests");
    },
    log: () => {},
    restartDelayMs: 60_000,
  });
}

const READY_PROBE = {
  url: "https://www.tradingview.com/chart/NRWVdyxJ/",
  title: "Chart",
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
};

describe("tool readiness — stale page state vs fresh probe", () => {
  it("1: stale not_ready + fresh authenticated probe → tools allowed", async () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;
    // Default unprobed / early-startup failure state
    expect(rt.snapshot().tradingview).toBe("not_ready");
    expect(rt.snapshot().authenticated).toBe("unknown");
    expect(() => rt.assertReadyForTools()).toThrowError(
      expect.objectContaining({ error_class: MCP_ERROR_CLASSES.TRADINGVIEW_PAGE_NOT_READY })
    );

    // Hard browser/CDP gate must NOT reject solely on stale page readiness
    expect(() => rt.assertBrowserCdpReady()).not.toThrow();

    const snap = await rt.ensureReadyForTools(async () => {
      rt.applyPageProbe(READY_PROBE);
    });
    expect(snap.tradingview).toBe("ready");
    expect(snap.authenticated).toBe("yes");
    expect(() => rt.assertReadyForTools()).not.toThrow();
  });

  it("2: stale not_ready + fresh probe still not ready → PAGE_NOT_READY", async () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;

    await expect(
      rt.ensureReadyForTools(async () => {
        rt.applyPageProbe({
          url: "https://www.tradingview.com/chart/",
          readyState: "loading",
          ready: false,
          authenticated: "unknown",
          reason: "CHART_NOT_READY",
        });
      })
    ).rejects.toMatchObject({
      error_class: MCP_ERROR_CLASSES.TRADINGVIEW_PAGE_NOT_READY,
    });
  });

  it("3: fresh probe unauthenticated → TRADINGVIEW_AUTH_REQUIRED", async () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;

    await expect(
      rt.ensureReadyForTools(async () => {
        rt.applyPageProbe({
          url: "https://www.tradingview.com/chart/",
          readyState: "complete",
          ready: false,
          authenticated: "no",
          hasSignInControl: true,
          hasAnonymousMenu: true,
          reason: "AUTH_REQUIRED",
        });
      })
    ).rejects.toMatchObject({
      error_class: MCP_ERROR_CLASSES.TRADINGVIEW_AUTH_REQUIRED,
    });
  });

  it("4: browser/CDP unavailable → fail closed; probe is never consulted", async () => {
    const rt = runtime();
    rt.state.browserRunning = false;
    rt.state.cdpReady = false;
    let probed = false;

    await expect(
      rt.ensureReadyForTools(async () => {
        probed = true;
        rt.applyPageProbe(READY_PROBE);
      })
    ).rejects.toMatchObject({
      error_class: MCP_ERROR_CLASSES.BROWSER_NOT_RUNNING,
    });
    expect(probed).toBe(false);

    rt.state.browserRunning = true;
    rt.state.cdpReady = false;
    probed = false;
    await expect(
      rt.ensureReadyForTools(async () => {
        probed = true;
        rt.applyPageProbe(READY_PROBE);
      })
    ).rejects.toMatchObject({
      error_class: MCP_ERROR_CLASSES.CDP_UNREACHABLE,
    });
    expect(probed).toBe(false);
  });

  it("mcp-http-server probes after browser/CDP gate, not before full page assert", () => {
    const src = readFileSync(path.join(process.cwd(), "mcp-http-server.js"), "utf8");
    const start = src.indexOf("async function ensureTradingViewReady");
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf("async function callMCPTool", start);
    const body = src.slice(start, end);
    expect(body).toMatch(/ensureReadyForTools\(\s*probeTradingViewPage\s*\)/);
    expect(body).not.toMatch(/assertReadyForTools\(\)\s*;\s*await probeTradingViewPage/);
  });
});
