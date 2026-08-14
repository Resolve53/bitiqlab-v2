import { EventEmitter } from "events";
import { createRequire } from "module";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  browserConfig,
  chromiumArgs,
  createRuntime,
  resolveExecutable,
  waitForCdp,
} = require(path.join(process.cwd(), "tradingview-browser-runtime.js"));

function mockChild(pid = 4242) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function cdpHttpOk() {
  return {
    get: (_url: string, cb: (res: EventEmitter & { statusCode: number }) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      process.nextTick(() => {
        cb(res);
        res.emit("data", JSON.stringify({ Browser: "Chromium/120" }));
        res.emit("end");
      });
      const req = new EventEmitter() as EventEmitter & {
        setTimeout: () => void;
        destroy: () => void;
      };
      req.setTimeout = () => {};
      req.destroy = () => {};
      return req;
    },
  };
}

function cdpHttpFail() {
  return {
    get: () => {
      const req = new EventEmitter() as EventEmitter & {
        setTimeout: (ms: number, fn: () => void) => void;
        destroy: (err?: Error) => void;
      };
      req.setTimeout = () => {};
      req.destroy = (err?: Error) => {
        req.emit("error", err || new Error("destroyed"));
      };
      process.nextTick(() => req.emit("error", new Error("ECONNREFUSED")));
      return req;
    },
  };
}

describe("A. Browser lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts successfully when CDP answers", async () => {
    const child = mockChild();
    const spawn = vi.fn(() => child);
    const rt = createRuntime({
      spawn,
      http: cdpHttpOk(),
      existsSync: () => true,
      mkdirSync: () => undefined,
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: "/tmp/tv-profile-test",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        CDP_PORT: "9222",
      },
      log: () => {},
      restartDelayMs: 60_000,
    });
    const snap = await rt.start();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(snap.browser).toBe("ok");
    expect(snap.cdp).toBe("ok");
    expect(snap.cdp_bind).toBe("127.0.0.1");
    expect(rt.state.browserRunning).toBe(true);
    await rt.stop();
  });

  it("handles CDP startup timeout without crashing MCP", async () => {
    const child = mockChild();
    const rt = createRuntime({
      spawn: () => child,
      http: cdpHttpFail(),
      existsSync: () => true,
      mkdirSync: () => undefined,
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_STARTUP_TIMEOUT_MS: "40",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: "/tmp/tv-profile-test",
      },
      log: () => {},
      restartDelayMs: 60_000,
    });
    const snap = await rt.start();
    expect(snap.status).toBe("degraded");
    expect(snap.browser).toBe("ok");
    expect(snap.cdp).toBe("fail");
    expect(snap.error_class).toBe("CDP_UNREACHABLE");
    expect(snap.mcp_http).toBe("ok");
    await rt.stop();
  });

  it("detects a browser crash", async () => {
    const child = mockChild();
    const rt = createRuntime({
      spawn: () => child,
      http: cdpHttpOk(),
      existsSync: () => true,
      mkdirSync: () => undefined,
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: "/tmp/tv-profile-test",
      },
      log: () => {},
      restartDelayMs: 60_000,
    });
    await rt.start();
    child.emit("exit", 1, null);
    expect(rt.state.browserRunning).toBe(false);
    expect(rt.state.cdpReady).toBe(false);
    expect(rt.state.lastExitCode).toBe(1);
    expect(rt.snapshot().browser).toBe("fail");
    expect(rt.snapshot().error_class).toBe("BROWSER_NOT_RUNNING");
    await rt.stop();
  });

  it("restart path respawns Chromium", async () => {
    const children = [mockChild(1), mockChild(2)];
    const spawn = vi.fn(() => children.shift() || mockChild(3));
    const rt = createRuntime({
      spawn,
      http: cdpHttpOk(),
      existsSync: () => true,
      mkdirSync: () => undefined,
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: "/tmp/tv-profile-test",
      },
      log: () => {},
      restartDelayMs: 60_000,
    });
    await rt.start();
    expect(spawn).toHaveBeenCalledTimes(1);
    const snap = await rt.restart();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(snap.browser).toBe("ok");
    await rt.stop();
  });
});

describe("D. Persistent profile config", () => {
  it("honors TRADINGVIEW_BROWSER_USER_DATA_DIR", () => {
    const cfg = browserConfig({
      TRADINGVIEW_BROWSER_USER_DATA_DIR: "/custom/tv-profile",
    });
    expect(cfg.userDataDir).toBe("/custom/tv-profile");
    const args = chromiumArgs(cfg);
    expect(args.some((a: string) => a === "--user-data-dir=/custom/tv-profile")).toBe(
      true
    );
  });

  it("defaults to /data/tradingview-profile", () => {
    const cfg = browserConfig({});
    expect(cfg.userDataDir).toBe("/data/tradingview-profile");
  });

  it("binds CDP to 127.0.0.1 even if CDP_HOST is overridden", () => {
    const cfg = browserConfig({ CDP_HOST: "0.0.0.0", CDP_PORT: "9333" });
    const args = chromiumArgs(cfg);
    expect(args).toContain("--remote-debugging-address=127.0.0.1");
    expect(args).toContain("--remote-debugging-port=9333");
    expect(args.join(" ")).not.toMatch(/0\.0\.0\.0/);
  });

  it("resolveExecutable prefers env override when the file exists", () => {
    const exe = resolveExecutable(
      browserConfig({ TRADINGVIEW_BROWSER_EXECUTABLE: "/opt/chrome/chrome" }),
      (p: string) => p === "/opt/chrome/chrome"
    );
    expect(exe).toBe("/opt/chrome/chrome");
  });

  it("waitForCdp reports failure after timeout", async () => {
    const result = await waitForCdp(
      { cdpPort: 9222, startupTimeoutMs: 30 },
      { http: cdpHttpFail(), timeoutMs: 30, intervalMs: 5 }
    );
    expect(result.ok).toBe(false);
  });
});
