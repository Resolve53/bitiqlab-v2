import { EventEmitter } from "events";
import { createRequire } from "module";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireCjs = createRequire(path.join(process.cwd(), "package.json"));
const profileLock = requireCjs(path.join(process.cwd(), "tradingview-profile-lock.js"));
const { createRuntime } = requireCjs(path.join(process.cwd(), "tradingview-browser-runtime.js"));

const {
  SINGLETON_FILES,
  parseSingletonLockTarget,
  inspectProfileLockState,
  reconcileProfileLocks,
  removeSingletonFiles,
  isLiveChromiumProfileOwner,
} = profileLock;

const PROFILE = "/data/tradingview-profile";
const HOST = "railway-container-abc";

type MemoryEntry = {
  type: "file" | "symlink" | "dir";
  target?: string;
  content?: string;
};

function memoryFs(initial: Record<string, MemoryEntry> = {}) {
  const store = new Map<string, MemoryEntry>(Object.entries(initial));

  function key(p: string) {
    return path.resolve(p);
  }

  return {
    store,
    existsSync: (p: string) => store.has(key(p)),
    mkdirSync: (p: string) => {
      store.set(key(p), { type: "dir" });
    },
    lstatSync: (p: string) => {
      const entry = store.get(key(p));
      if (!entry) throw new Error(`ENOENT ${p}`);
      return { isSymbolicLink: () => entry.type === "symlink" };
    },
    readlinkSync: (p: string) => {
      const entry = store.get(key(p));
      if (!entry || entry.type !== "symlink") throw new Error(`EINVAL ${p}`);
      return entry.target || "";
    },
    unlinkSync: (p: string) => {
      store.delete(key(p));
    },
    readFileSync: (p: string) => {
      const entry = store.get(key(p));
      if (!entry) throw new Error(`ENOENT ${p}`);
      if (entry.type === "symlink") return entry.target || "";
      return entry.content || "";
    },
    realpathSync: (p: string) => path.resolve(p),
    readdirSync: (p: string) => {
      if (p !== "/proc") return [];
      return Object.keys(processTable);
    },
  };
}

const processTable: Record<number, { state: string; args: string[] }> = {};

function resetProcessTable() {
  for (const k of Object.keys(processTable)) delete processTable[Number(k)];
}

function seedSingletonLocks(
  fsMock: ReturnType<typeof memoryFs>,
  lockTarget: string,
  profileDir = PROFILE
) {
  fsMock.store.set(path.join(profileDir, "SingletonLock"), {
    type: "symlink",
    target: lockTarget,
  });
  fsMock.store.set(path.join(profileDir, "SingletonCookie"), {
    type: "symlink",
    target: "2480223369875263811",
  });
  fsMock.store.set(path.join(profileDir, "SingletonSocket"), {
    type: "symlink",
    target: "/tmp/.org.chromium.Chromium.test/SingletonSocket",
  });
  fsMock.store.set(path.join(profileDir, "Default/Cookies"), {
    type: "file",
    content: "sqlite-cookie-db-bytes",
  });
  fsMock.store.set(path.join(profileDir, "Default/Local Storage/leveldb/CURRENT"), {
    type: "file",
    content: "MANIFEST",
  });
}

function readProcessInfo(pid: number) {
  const row = processTable[pid];
  if (!row) return { exists: false };
  return {
    exists: true,
    state: row.state,
    args: row.args,
  };
}

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
    get: (url: string, cb: (res: EventEmitter & { statusCode: number }) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const body = String(url).includes("/json/list")
        ? "[]"
        : JSON.stringify({ Browser: "Chromium/120" });
      process.nextTick(() => {
        cb(res);
        res.emit("data", body);
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

describe("profile lock parsing", () => {
  it("parses hostname-PID lock targets", () => {
    expect(parseSingletonLockTarget("railway-container-abc-9156")).toEqual({
      ok: true,
      hostname: "railway-container-abc",
      pid: 9156,
    });
  });

  it("rejects malformed lock targets", () => {
    expect(parseSingletonLockTarget("no-pid-here").ok).toBe(false);
    expect(parseSingletonLockTarget("").ok).toBe(false);
  });
});

describe("profile lock inspection", () => {
  afterEach(() => {
    resetProcessTable();
  });

  it("reports no lock files when profile is clean", () => {
    const fsMock = memoryFs();
    const result = inspectProfileLockState(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [],
    });
    expect(result.stale_lock_detected).toBe(false);
    expect(result.should_remove).toBe(false);
    expect(result.reason).toBe("no_lock_files");
  });

  it("preserves a valid live current-container lock", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, `${HOST}-4242`);
    processTable[4242] = {
      state: "S",
      args: ["/usr/bin/chromium", `--user-data-dir=${PROFILE}`, "--headless=new"],
    };
    const result = inspectProfileLockState(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [4242],
    });
    expect(result.should_remove).toBe(false);
    expect(result.reason).toBe("live_chromium_owner");
  });

  it("marks previous-container hostname locks as stale", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "old-railway-host-4242");
    const result = inspectProfileLockState(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [],
    });
    expect(result.should_remove).toBe(true);
    expect(result.reason).toBe("previous_container_hostname");
  });

  it("preserves previous-container hostname locks when current live exact-profile Chromium exists", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "old-railway-host-4242");
    processTable[8888] = {
      state: "S",
      args: ["/usr/bin/chromium", `--user-data-dir=${PROFILE}`, "--headless=new"],
    };
    const result = inspectProfileLockState(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [8888],
    });
    expect(result.should_remove).toBe(false);
    expect(result.reason).toBe("live_profile_owner_found_during_stale_check");
    expect(result.owners).toEqual([8888]);
  });

  it("marks dead PID locks as stale", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, `${HOST}-9999`);
    const result = inspectProfileLockState(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [],
    });
    expect(result.should_remove).toBe(true);
    expect(result.reason).toBe("pid_not_found");
  });

  it("marks zombie PID locks as stale", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, `${HOST}-7777`);
    processTable[7777] = {
      state: "Z",
      args: ["/usr/bin/chromium", `--user-data-dir=${PROFILE}`],
    };
    const result = inspectProfileLockState(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [7777],
    });
    expect(result.should_remove).toBe(true);
    expect(result.reason).toBe("pid_is_zombie");
  });

  it("fails safely on malformed lock when a live owner exists", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "not-a-valid-lock");
    processTable[5555] = {
      state: "S",
      args: ["/usr/bin/chromium", `--user-data-dir=${PROFILE}`],
    };
    const result = inspectProfileLockState(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [5555],
    });
    expect(result.should_remove).toBe(false);
    expect(result.reason).toBe("malformed_lock_live_owner_found");
  });

  it("removes malformed lock when no live owner is found", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "broken");
    const removed = reconcileProfileLocks(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [],
      log: () => {},
    });
    expect(removed.stale_lock_removed).toBe(true);
    expect(removed.reason).toBe("malformed_lock_no_live_owner");
    expect(SINGLETON_FILES.every((name: string) => !fsMock.existsSync(path.join(PROFILE, name)))).toBe(
      true
    );
  });
});

describe("profile lock reconciliation", () => {
  afterEach(() => {
    resetProcessTable();
  });

  it("removes only singleton files and leaves session data intact", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "old-host-1234");
    const cookiePath = path.join(PROFILE, "Default/Cookies");
    const lsPath = path.join(PROFILE, "Default/Local Storage/leveldb/CURRENT");

    reconcileProfileLocks(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [],
      log: () => {},
    });

    expect(fsMock.existsSync(cookiePath)).toBe(true);
    expect(fsMock.existsSync(lsPath)).toBe(true);
    expect(SINGLETON_FILES.every((name: string) => !fsMock.existsSync(path.join(PROFILE, name)))).toBe(
      true
    );
  });

  it("does not remove singleton files for a live owner", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, `${HOST}-4242`);
    processTable[4242] = {
      state: "S",
      args: ["/usr/bin/chromium", `--user-data-dir=${PROFILE}`],
    };
    reconcileProfileLocks(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [4242],
      log: () => {},
    });
    expect(SINGLETON_FILES.every((name: string) => fsMock.existsSync(path.join(PROFILE, name)))).toBe(
      true
    );
  });

  it("logs stale_lock_detected and stale_lock_removed without secrets", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "old-host-1234");
    const logs: string[] = [];
    reconcileProfileLocks(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [],
      log: (msg: string) => logs.push(msg),
    });
    expect(logs.join("\n")).toMatch(/stale_lock_detected=true/);
    expect(logs.join("\n")).toMatch(/stale_lock_removed=true/);
    expect(logs.join("\n")).toMatch(/reason=previous_container_hostname/);
    expect(logs.join("\n")).not.toMatch(/cookie|sqlite|2480223369875263811/i);
  });

  it("removeSingletonFiles only targets the three singleton names", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, `${HOST}-1`);
    fsMock.store.set(path.join(PROFILE, "Default/Preferences"), {
      type: "file",
      content: "{}",
    });
    const removed = removeSingletonFiles(PROFILE, fsMock);
    expect(removed.sort()).toEqual([...SINGLETON_FILES].sort());
    expect(fsMock.existsSync(path.join(PROFILE, "Default/Preferences"))).toBe(true);
  });

  it("rejects chromium processes bound to a different profile", () => {
    const owner = isLiveChromiumProfileOwner(100, PROFILE, {
      readProcessInfo: () => ({
        exists: true,
        state: "S",
        args: ["/usr/bin/chromium", "--user-data-dir=/other/profile"],
      }),
    });
    expect(owner.live).toBe(false);
    expect(owner.reason).toBe("pid_chromium_other_profile");
  });

  it("aborts deletion when live exact-profile Chromium appears between inspection and deletion", () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "old-host-1234");
    let scanCount = 0;
    const result = reconcileProfileLocks(PROFILE, {
      fs: fsMock,
      hostname: HOST,
      readProcessInfo: (pid: number) => {
        const row = processTable[pid];
        if (!row) return { exists: false };
        return {
          exists: true,
          state: row.state,
          args: row.args,
        };
      },
      listPids: () => {
        scanCount++;
        if (scanCount === 1) {
          return [];
        }
        if (!processTable[6666]) {
          processTable[6666] = {
            state: "S",
            args: ["/usr/bin/chromium", `--user-data-dir=${PROFILE}`],
          };
        }
        return [6666];
      },
      log: () => {},
    });
    expect(result.stale_lock_removed).toBe(false);
    expect(result.reason).toBe("live_profile_owner_found_before_delete");
    expect(result.owners).toEqual([6666]);
    expect(SINGLETON_FILES.every((name: string) => fsMock.existsSync(path.join(PROFILE, name)))).toBe(
      true
    );
  });
});

describe("runtime integration — profile locks before spawn", () => {
  afterEach(() => {
    resetProcessTable();
  });

  it("clears stale locks before spawning Chromium on startup", async () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "previous-railway-host-4242");
    fsMock.mkdirSync(PROFILE);

    const spawn = vi.fn(() => mockChild(9001));
    const rt = createRuntime({
      spawn,
      http: cdpHttpOk(),
      existsSync: () => true,
      mkdirSync: (p: string) => fsMock.mkdirSync(p),
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [],
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: PROFILE,
      },
      log: () => {},
      createTarget: vi.fn(async () => ({ id: "created" })),
      navigatePage: vi.fn(async () => undefined),
      closeBrowser: vi.fn(async () => undefined),
    });

    await rt.start({ preferAdopt: false });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(
      SINGLETON_FILES.every((name: string) => !fsMock.existsSync(path.join(PROFILE, name)))
    ).toBe(true);
    expect(fsMock.existsSync(path.join(PROFILE, "Default/Cookies"))).toBe(true);
    await rt.stop();
  });

  it("repeated startups do not loop when locks belong to a live browser", async () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, `${HOST}-4242`);
    fsMock.mkdirSync(PROFILE);
    processTable[4242] = {
      state: "S",
      args: ["/usr/bin/chromium", `--user-data-dir=${PROFILE}`],
    };

    const spawn = vi.fn(() => mockChild(9002));
    const rt = createRuntime({
      spawn,
      http: cdpHttpOk(),
      existsSync: () => true,
      mkdirSync: (p: string) => fsMock.mkdirSync(p),
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [4242],
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: PROFILE,
      },
      log: () => {},
      createTarget: vi.fn(async () => ({ id: "created" })),
      navigatePage: vi.fn(async () => undefined),
      closeBrowser: vi.fn(async () => undefined),
    });

    await rt.start({ preferAdopt: false });
    await rt.start({ preferAdopt: false });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(
      SINGLETON_FILES.every((name: string) => fsMock.existsSync(path.join(PROFILE, name)))
    ).toBe(true);
    await rt.stop();
  });

  it("second startup after stale lock removal succeeds without extra cleanup loops", async () => {
    const fsMock = memoryFs();
    seedSingletonLocks(fsMock, "old-host-1234");
    fsMock.mkdirSync(PROFILE);

    const spawn = vi.fn(() => mockChild(9003));
    const rt = createRuntime({
      spawn,
      http: cdpHttpOk(),
      existsSync: () => true,
      mkdirSync: (p: string) => fsMock.mkdirSync(p),
      fs: fsMock,
      hostname: HOST,
      readProcessInfo,
      listPids: () => [],
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: PROFILE,
      },
      log: () => {},
      createTarget: vi.fn(async () => ({ id: "created" })),
      navigatePage: vi.fn(async () => undefined),
      closeBrowser: vi.fn(async () => undefined),
    });

    await rt.start({ preferAdopt: false });
    await rt.start({ preferAdopt: false });
    expect(spawn).toHaveBeenCalledTimes(1);
    await rt.stop();
  });
});
