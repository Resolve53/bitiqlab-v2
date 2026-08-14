import { EventEmitter } from "events";
import { createRequire } from "module";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireCjs = createRequire(path.join(process.cwd(), "package.json"));
const {
  createRuntime,
  chromiumArgs,
  resetChromeSessionRestore,
  SESSION_RESTORE_RELATIVE,
  MAX_RESTART_ATTEMPTS,
  isNavigableBlankTarget,
} = requireCjs(path.join(process.cwd(), "tradingview-browser-runtime.js"));

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

function okReq(body: unknown) {
  return (cb: (res: EventEmitter & { statusCode: number }) => void) => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = 200;
    process.nextTick(() => {
      cb(res);
      res.emit("data", JSON.stringify(body));
      res.emit("end");
    });
    const req = new EventEmitter() as EventEmitter & {
      setTimeout: () => void;
      destroy: () => void;
    };
    req.setTimeout = () => {};
    req.destroy = () => {};
    return req;
  };
}

function failReq() {
  const req = new EventEmitter() as EventEmitter & {
    setTimeout: () => void;
    destroy: (err?: Error) => void;
  };
  req.setTimeout = () => {};
  req.destroy = (err?: Error) => {
    req.emit("error", err || new Error("destroyed"));
  };
  process.nextTick(() => req.emit("error", new Error("ECONNREFUSED")));
  return req;
}

function createCdpControl(initialList: unknown[] = []) {
  const control = {
    versionOk: true,
    list: initialList as unknown[],
  };
  const http = {
    get: (url: string, cb: (res: EventEmitter & { statusCode: number }) => void) => {
      if (String(url).includes("/json/list")) {
        return okReq(control.list)(cb);
      }
      if (!control.versionOk) {
        return failReq();
      }
      return okReq({ Browser: "Chromium/120" })(cb);
    },
  };
  return { http, control };
}

const TV_CHART = {
  id: "t-chart",
  type: "page",
  url: "https://www.tradingview.com/chart/",
  title: "Chart",
};
const NEWTAB = {
  id: "t-new",
  type: "page",
  url: "chrome://new-tab-page/",
  title: "New Tab",
};

function makeRuntime(opts: {
  spawn?: ReturnType<typeof vi.fn>;
  list?: unknown[];
  control?: { versionOk: boolean; list: unknown[] };
  http?: ReturnType<typeof createCdpControl>["http"];
  extra?: Record<string, unknown>;
}) {
  const createTarget = vi.fn(async () => ({ id: "created" }));
  const navigatePage = vi.fn(async () => undefined);
  const closeBrowser = vi.fn(async () => {
    if (opts.control) opts.control.versionOk = false;
  });
  const spawn = opts.spawn || vi.fn(() => mockChild());
  const cdp = opts.http
    ? { http: opts.http, control: opts.control }
    : createCdpControl(opts.list || []);
  const rt = createRuntime({
    spawn,
    http: cdp.http,
    existsSync: () => true,
    mkdirSync: () => undefined,
    env: {
      TRADINGVIEW_BROWSER_ENABLED: "true",
      TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
      TRADINGVIEW_BROWSER_USER_DATA_DIR: "/tmp/tv-profile-lifecycle",
      TRADINGVIEW_BROWSER_STARTUP_TIMEOUT_MS: "80",
    },
    log: () => {},
    restartDelayMs: 15,
    restartGapMs: 5,
    createTarget,
    navigatePage,
    closeBrowser,
    ...(opts.extra || {}),
  });
  return { rt, spawn, createTarget, navigatePage, closeBrowser, control: cdp.control };
}

describe("lifecycle safety — tabs and browser instances", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("launch args never include the chart URL by default", () => {
    const args = chromiumArgs({
      cdpPort: 9222,
      userDataDir: "/tmp/p",
      headless: true,
      extraArgs: [],
      url: "https://www.tradingview.com/chart/",
    });
    expect(args.join(" ")).not.toMatch(/tradingview\.com/);
  });

  it("start() is idempotent — 10 calls spawn exactly one browser", async () => {
    const { rt, spawn } = makeRuntime({ list: [TV_CHART] });
    for (let i = 0; i < 10; i++) {
      await rt.start({ preferAdopt: false });
    }
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(rt.snapshot().spawn_count).toBe(1);
    expect(spawn.mock.calls[0][1].join(" ")).not.toMatch(/tradingview\.com/);
    await rt.stop();
  });

  it("adopts an already-running CDP instead of spawning a second Chrome", async () => {
    const { rt, spawn } = makeRuntime({ list: [TV_CHART] });
    const snap = await rt.start();
    expect(spawn).toHaveBeenCalledTimes(0);
    expect(snap.adopted_cdp).toBe(true);
    expect(snap.spawn_count).toBe(0);
    expect(snap.browser).toBe("ok");
    await rt.stop();
  });

  it("reuses a pre-existing chart target and does not create or navigate", async () => {
    const { rt, createTarget, navigatePage } = makeRuntime({ list: [NEWTAB, TV_CHART] });
    await rt.start({ preferAdopt: false });
    expect(createTarget).not.toHaveBeenCalled();
    expect(navigatePage).not.toHaveBeenCalled();
    expect(rt.snapshot().ensured_chart_page).toBe(true);
    await rt.stop();
  });

  it("navigates one blank/newtab when no chart exists, and never creates a second tab", async () => {
    const { rt, createTarget, navigatePage } = makeRuntime({ list: [NEWTAB] });
    await rt.start({ preferAdopt: false });
    expect(navigatePage).toHaveBeenCalledTimes(1);
    expect(navigatePage.mock.calls[0][1]).toBe("https://www.tradingview.com/chart/");
    expect(createTarget).not.toHaveBeenCalled();
    await rt.ensureSingleChartPage();
    await rt.ensureSingleChartPage();
    expect(navigatePage).toHaveBeenCalledTimes(1);
    expect(createTarget).not.toHaveBeenCalled();
    await rt.stop();
  });

  it("creates at most one chart target when there is no reusable page", async () => {
    const { rt, createTarget, navigatePage } = makeRuntime({ list: [] });
    await rt.start({ preferAdopt: false });
    expect(createTarget).toHaveBeenCalledTimes(1);
    expect(navigatePage).not.toHaveBeenCalled();
    await rt.ensureSingleChartPage();
    expect(createTarget).toHaveBeenCalledTimes(1);
    await rt.stop();
  });

  it("100 failed or successful probes never spawn, navigate, or create targets", async () => {
    const { rt, spawn, createTarget, navigatePage } = makeRuntime({
      list: [NEWTAB, TV_CHART],
    });
    await rt.start({ preferAdopt: false });
    const spawnAfterStart = spawn.mock.calls.length;
    const createdAfterStart = createTarget.mock.calls.length;
    const navigatedAfterStart = navigatePage.mock.calls.length;
    const targetsBefore = rt.snapshot().page_target_count;

    for (let i = 0; i < 50; i++) {
      await rt.probeAndApply({
        targets: [NEWTAB, TV_CHART],
        evaluate: async () => ({
          url: "https://www.tradingview.com/chart/",
          readyState: "complete",
          ready: true,
          authenticated: "unknown",
          hasSymbolSearch: true,
          hasChartCanvas: true,
        }),
      });
    }
    for (let i = 0; i < 50; i++) {
      await rt.probeAndApply({
        targets: [NEWTAB, TV_CHART],
        evaluate: async () => {
          throw new Error("probe exploded");
        },
      });
    }

    expect(spawn).toHaveBeenCalledTimes(spawnAfterStart);
    expect(createTarget).toHaveBeenCalledTimes(createdAfterStart);
    expect(navigatePage).toHaveBeenCalledTimes(navigatedAfterStart);
    expect(rt.snapshot().page_target_count).toBe(targetsBefore);
    expect(rt.snapshot().spawn_count).toBe(1);
    expect(rt.snapshot().authenticated).not.toBe("yes");
    await rt.stop();
  });

  it("probeAndApply source cannot open tabs or launch Chromium", () => {
    const src = require("fs").readFileSync(
      path.join(process.cwd(), "tradingview-browser-runtime.js"),
      "utf8"
    );
    const start = src.indexOf("async function probeAndApply");
    const end = src.indexOf("function assertReadyForTools");
    const body = src.slice(start, end);
    expect(body).not.toMatch(/Page\.navigate/);
    expect(body).not.toMatch(/createTarget/);
    expect(body).not.toMatch(/spawnFn/);
    expect(body).not.toMatch(/ensureSingleChartPage/);
    expect(body).not.toMatch(/includeUrl:\s*true/);
  });

  it("repeated restart attempts keep only one live child and kill the previous", async () => {
    let live = 0;
    const killed: number[] = [];
    const spawn = vi.fn(() => {
      live += 1;
      const child = mockChild(1000 + live);
      child.kill = vi.fn(() => {
        live -= 1;
        killed.push(child.pid);
      });
      return child;
    });
    const { http, control } = createCdpControl([TV_CHART]);
    const { rt } = makeRuntime({
      spawn,
      http,
      control,
      extra: {
        closeBrowser: async () => {
          control.versionOk = false;
        },
      },
    });
    await rt.start({ preferAdopt: false });
    expect(live).toBe(1);
    for (let i = 0; i < 5; i++) {
      await rt.restart();
      expect(live).toBe(1);
    }
    expect(spawn.mock.calls.length).toBe(6);
    expect(killed.length).toBeGreaterThanOrEqual(5);
    expect(new Set(killed).size).toBe(killed.length);
    await rt.stop();
  });

  it("caps automatic crash restarts so instances cannot accumulate", async () => {
    const children: ReturnType<typeof mockChild>[] = [];
    const { http, control } = createCdpControl([TV_CHART]);
    const spawn = vi.fn(() => {
      control.versionOk = true;
      const child = mockChild(2000 + children.length);
      children.push(child);
      return child;
    });
    const { rt } = makeRuntime({
      spawn,
      http,
      control,
      extra: {
        closeBrowser: async () => {
          control.versionOk = false;
        },
      },
    });
    await rt.start({ preferAdopt: false });
    expect(spawn).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 8; i++) {
      control.versionOk = false;
      const child = children[children.length - 1];
      if (!child) break;
      child.emit("exit", 1, null);
      await rt.state.lastExitHandled;
      await new Promise((r) => setTimeout(r, 40));
    }

    expect(rt.state.restartAttempts).toBeLessThanOrEqual(MAX_RESTART_ATTEMPTS);
    expect(spawn.mock.calls.length).toBeLessThanOrEqual(1 + MAX_RESTART_ATTEMPTS);
    expect(spawn.mock.calls.length).toBeGreaterThan(1);
    await rt.stop();
  });

  it("stop() cancels a pending restart and kills the child", async () => {
    const child = mockChild();
    const { rt, spawn } = makeRuntime({
      spawn: vi.fn(() => child),
      list: [TV_CHART],
    });
    await rt.start({ preferAdopt: false });
    rt.state.pendingRestart = setTimeout(() => {
      throw new Error("pending restart should have been cleared");
    }, 60_000);
    await rt.stop();
    expect(child.kill).toHaveBeenCalled();
    expect(rt.state.pendingRestart).toBeNull();
    expect(rt.state.browserRunning).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("resetChromeSessionRestore removes only session restore files", () => {
    const removed: string[] = [];
    const fsMock = {
      existsSync: (p: string) => String(p).includes("Default/"),
      rmSync: (p: string) => {
        removed.push(p);
      },
    };
    const out = resetChromeSessionRestore("/tmp/tv-profile", fsMock);
    expect(out).toEqual(SESSION_RESTORE_RELATIVE);
    expect(removed.every((p) => p.startsWith("/tmp/tv-profile/Default/"))).toBe(true);
    expect(removed.join(" ")).not.toMatch(/Cookies|Login Data|Web Data/i);
  });

  it("recognizes blank/newtab pages as navigable without treating extensions as blank", () => {
    expect(isNavigableBlankTarget("about:blank")).toBe(true);
    expect(isNavigableBlankTarget("chrome://new-tab-page/")).toBe(true);
    expect(isNavigableBlankTarget("chrome-extension://abc/popup.html")).toBe(false);
    expect(isNavigableBlankTarget("https://www.tradingview.com/chart/")).toBe(false);
  });
});
