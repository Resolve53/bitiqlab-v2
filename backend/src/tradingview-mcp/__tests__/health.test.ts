import { createRequire } from "module";
import path from "path";
import { describe, expect, it } from "vitest";

const requireCjs = createRequire(path.join(process.cwd(), "package.json"));
const { createRuntime } = requireCjs(
  path.join(process.cwd(), "tradingview-browser-runtime.js")
);

function runtime() {
  return createRuntime({
    env: { TRADINGVIEW_BROWSER_ENABLED: "true" },
    spawn: () => {
      throw new Error("must not spawn in health unit tests");
    },
    log: () => {},
    restartDelayMs: 60_000,
  });
}

describe("B. Health snapshots", () => {
  it("HTTP up / browser down → degraded + BROWSER_NOT_RUNNING", () => {
    const rt = runtime();
    rt.state.browserRunning = false;
    rt.state.cdpReady = false;
    const snap = rt.snapshot();
    expect(snap.mcp_http).toBe("ok");
    expect(snap.browser).toBe("fail");
    expect(snap.status).toBe("degraded");
    expect(snap.error_class).toBe("BROWSER_NOT_RUNNING");
  });

  it("browser up / CDP down → degraded + CDP_UNREACHABLE", () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = false;
    const snap = rt.snapshot();
    expect(snap.browser).toBe("ok");
    expect(snap.cdp).toBe("fail");
    expect(snap.status).toBe("degraded");
    expect(snap.error_class).toBe("CDP_UNREACHABLE");
  });

  it("CDP up / TradingView unauthenticated → TRADINGVIEW_AUTH_REQUIRED", () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;
    rt.applyPageProbe({
      url: "https://www.tradingview.com/#signin",
      ready: false,
      authenticated: false,
    });
    const snap = rt.snapshot();
    expect(snap.cdp).toBe("ok");
    expect(snap.tradingview).toBe("not_authenticated");
    expect(snap.authenticated).toBe("no");
    expect(snap.status).toBe("degraded");
    expect(snap.error_class).toBe("TRADINGVIEW_AUTH_REQUIRED");
  });

  it("fully ready → status ok", () => {
    const rt = runtime();
    rt.state.browserRunning = true;
    rt.state.cdpReady = true;
    rt.applyPageProbe({
      url: "https://www.tradingview.com/chart/abc",
      ready: true,
      authenticated: true,
      hasUserMenu: true,
      pineEditor: true,
    });
    const snap = rt.snapshot();
    expect(snap.status).toBe("ok");
    expect(snap.mcp_http).toBe("ok");
    expect(snap.browser).toBe("ok");
    expect(snap.cdp).toBe("ok");
    expect(snap.tradingview).toBe("ready");
    expect(snap.authenticated).toBe("yes");
    expect(snap.error_class).toBeNull();
    expect(snap.profile_copy_required).toBe(false);
    expect(snap.session_bootstrap.status).toBe("none");
  });
});
