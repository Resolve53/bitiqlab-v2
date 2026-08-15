import { createRequire } from "module";
import path from "path";
import { describe, expect, it, vi } from "vitest";

const requireCjs = createRequire(path.join(process.cwd(), "package.json"));
const transfer = requireCjs(
  path.join(process.cwd(), "tradingview-session-transfer.js")
);
const { createRuntime } = requireCjs(
  path.join(process.cwd(), "tradingview-browser-runtime.js")
);

const SECRET_VALUE = "tv-session-super-secret-value-do-not-log";

function tvCookie(overrides: Record<string, unknown> = {}) {
  return {
    name: "sessionid",
    value: SECRET_VALUE,
    domain: ".tradingview.com",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    expires: Date.now() / 1000 + 86400,
    ...overrides,
  };
}

function memoryFs(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    files,
    existsSync: (p: string) => files.has(p),
    readFileSync: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p) as string;
    },
    writeFileSync: (p: string, data: string | Buffer) => {
      files.set(p, Buffer.isBuffer(data) ? data.toString("utf8") : String(data));
    },
    unlinkSync: (p: string) => {
      files.delete(p);
    },
    mkdirSync: () => undefined,
    chmodSync: () => undefined,
    statSync: (p: string) => ({ size: String(files.get(p) || "").length }),
  };
}

describe("Stage 1C session transfer — cookies only", () => {
  it("keeps only tradingview.com cookies and drops foreign domains", () => {
    const cookies = transfer.filterTradingViewCookies([
      tvCookie(),
      tvCookie({ name: "sid", domain: "www.tradingview.com" }),
      tvCookie({ name: "sso", domain: "sso.tradingview.com" }),
      tvCookie({ name: "evil", domain: "nottradingview.com", value: SECRET_VALUE }),
      tvCookie({ name: "evil2", domain: "tradingview.com.evil.com", value: SECRET_VALUE }),
      tvCookie({ name: "google", domain: ".google.com", value: SECRET_VALUE }),
      { name: "broken", value: SECRET_VALUE },
    ]);
    expect(cookies.map((c: { domain: string }) => c.domain).sort()).toEqual([
      ".tradingview.com",
      "sso.tradingview.com",
      "www.tradingview.com",
    ]);
  });

  it("export payload is cookies-only and preserves HttpOnly", () => {
    const payload = transfer.buildPayload([
      tvCookie(),
      tvCookie({ name: "sessionid_sign", httpOnly: true }),
      tvCookie({ name: "tv_ecuid", httpOnly: false }),
    ]);
    expect(payload.kind).toBe("tradingview-session-bootstrap");
    expect(payload.version).toBe(1);
    expect(payload.cookies).toHaveLength(3);
    expect(payload.cookies.every((c: { httpOnly?: boolean; name: string }) => c.name)).toBe(true);
    expect(payload.cookies.filter((c: { httpOnly: boolean }) => c.httpOnly)).toHaveLength(2);
    expect(payload).not.toHaveProperty("userDataDir");
    expect(payload).not.toHaveProperty("profile");
    expect(JSON.stringify(payload)).not.toMatch(/Keychain|Cookies\.sqlite|Local State/i);
  });

  it("refuses export without HttpOnly TradingView cookies", () => {
    expect(() =>
      transfer.buildPayload([tvCookie({ httpOnly: false, name: "tv_ecuid" })])
    ).toThrow(/HttpOnly/);
  });

  it("encrypt/decrypt roundtrip and wrong secret fails closed", () => {
    const payload = transfer.buildPayload([tvCookie()]);
    const secret = transfer.generateSecret();
    const envelope = transfer.encryptPayload(payload, secret);
    expect(envelope.kind).toBe("tradingview-session-bootstrap-envelope");
    expect(JSON.stringify(envelope)).not.toContain(SECRET_VALUE);
    expect(envelope.meta.items).toBe(1);
    expect(envelope.meta.httpOnly).toBe(1);
    expect(envelope.meta.domains).toEqual(["tradingview.com"]);

    const ok = transfer.decryptEnvelope(envelope, secret);
    expect(ok.payload.cookies[0].value).toBe(SECRET_VALUE);
    expect(ok.payload.cookies[0].httpOnly).toBe(true);
    expect(ok.summary.items).toBe(1);

    expect(() => transfer.decryptEnvelope(envelope, "wrong-secret")).toThrow(/Decrypt failed/);
  });

  it("import applies HttpOnly cookies via Storage.setCookies then deletes the artifact", async () => {
    const logs: string[] = [];
    const applied: unknown[] = [];
    const fsMock = memoryFs();
    const exported = transfer.exportSessionToArtifact({
      cookies: [tvCookie(), tvCookie({ name: "sessionid_sign", domain: "www.tradingview.com" })],
      outPath: "/data/tv-session-bootstrap.enc",
      secret: "one-time-operator-secret",
      fs: fsMock,
      env: {},
    });
    expect(exported.secret).toBeNull();
    expect(fsMock.existsSync("/data/tv-session-bootstrap.enc")).toBe(true);
    expect(fsMock.readFileSync("/data/tv-session-bootstrap.enc")).not.toContain(SECRET_VALUE);

    const result = await transfer.importSessionFromArtifact({
      env: {
        TRADINGVIEW_SESSION_BOOTSTRAP_SECRET: "one-time-operator-secret",
        TRADINGVIEW_SESSION_BOOTSTRAP_PATH: "/data/tv-session-bootstrap.enc",
      },
      fs: fsMock,
      log: (m: string) => logs.push(m),
      applyCookies: async (cookies: Array<{ httpOnly?: boolean; value: string }>) => {
        applied.push(...cookies);
        return { applied: cookies.length, via: "Storage.setCookies" };
      },
    });

    expect(result.applied).toBe(true);
    expect(result.deleted).toBe(true);
    expect(fsMock.existsSync("/data/tv-session-bootstrap.enc")).toBe(false);
    expect(fsMock.existsSync("/data/tv-session-bootstrap.enc.consumed")).toBe(true);
    expect(applied).toHaveLength(2);
    expect(applied.every((c: { httpOnly?: boolean }) => c.httpOnly)).toBe(true);
    expect(logs.join("\n")).not.toContain(SECRET_VALUE);
    expect(logs.join("\n")).toMatch(/items=2/);
    expect(logs.join("\n")).toMatch(/httpOnly=2/);
    expect(logs.join("\n")).toMatch(/domains=[\w.,]*tradingview\.com/);
    expect(logs.join("\n")).not.toMatch(/\[redacted\]/);
    expect(logs.join("\n")).not.toMatch(/sessionid/);
    expect(fsMock.readFileSync("/data/tv-session-bootstrap.enc.consumed")).not.toContain(SECRET_VALUE);
  });

  it("fails closed when artifact exists without a secret and does not delete it", async () => {
    const fsMock = memoryFs();
    transfer.exportSessionToArtifact({
      cookies: [tvCookie()],
      outPath: "/tmp/tv-session-bootstrap.enc",
      secret: "keep-me",
      fs: fsMock,
      env: {},
    });
    const request = transfer.resolveImportRequest({
      env: { TRADINGVIEW_SESSION_BOOTSTRAP_PATH: "/tmp/tv-session-bootstrap.enc" },
      fs: fsMock,
    });
    expect(request.shouldImport).toBe(false);
    expect(request.failClosed).toBe(true);
    expect(request.reason).toBe("SECRET_REQUIRED");
    await expect(
      transfer.importSessionFromArtifact({
        env: { TRADINGVIEW_SESSION_BOOTSTRAP_PATH: "/tmp/tv-session-bootstrap.enc" },
        fs: fsMock,
        request,
      })
    ).rejects.toThrow(/secret/i);
    expect(fsMock.existsSync("/tmp/tv-session-bootstrap.enc")).toBe(true);
  });

  it("failed decrypt does not delete the artifact", async () => {
    const fsMock = memoryFs();
    transfer.exportSessionToArtifact({
      cookies: [tvCookie()],
      outPath: "/tmp/tv-session-bootstrap.enc",
      secret: "correct",
      fs: fsMock,
      env: {},
    });
    await expect(
      transfer.importSessionFromArtifact({
        env: {
          TRADINGVIEW_SESSION_BOOTSTRAP_PATH: "/tmp/tv-session-bootstrap.enc",
          TRADINGVIEW_SESSION_BOOTSTRAP_SECRET: "incorrect",
        },
        fs: fsMock,
      })
    ).rejects.toThrow(/Decrypt failed/);
    expect(fsMock.existsSync("/tmp/tv-session-bootstrap.enc")).toBe(true);
  });

  it("Storage.getCookies is preferred so HttpOnly cookies are included", async () => {
    const client = {
      Storage: {
        getCookies: vi.fn(async () => ({
          cookies: [
            tvCookie(),
            tvCookie({ name: "foreign", domain: "example.com", value: SECRET_VALUE }),
          ],
        })),
      },
      Network: {
        getAllCookies: vi.fn(async () => ({ cookies: [] })),
      },
    };
    const cookies = await transfer.collectCookiesFromCdp({ client });
    expect(client.Storage.getCookies).toHaveBeenCalled();
    expect(client.Network.getAllCookies).not.toHaveBeenCalled();
    expect(cookies).toHaveLength(1);
    expect(cookies[0].httpOnly).toBe(true);
    expect(cookies[0].domain).toBe(".tradingview.com");
  });

  it("falls back to Network.getAllCookies when Storage is missing", async () => {
    const client = {
      Network: {
        enable: vi.fn(async () => undefined),
        getAllCookies: vi.fn(async () => ({ cookies: [tvCookie({ name: "sessionid" })] })),
        setCookie: vi.fn(async () => ({ success: true })),
      },
    };
    const cookies = await transfer.collectCookiesFromCdp({ client });
    expect(cookies[0].httpOnly).toBe(true);
    const applied = await transfer.applyCookiesToCdp(cookies, { client });
    expect(applied.via).toBe("Network.setCookie");
    expect(client.Network.setCookie).toHaveBeenCalledTimes(1);
    const sent = client.Network.setCookie.mock.calls[0][0];
    expect(sent.httpOnly).toBe(true);
    expect(sent.domain).toBe(".tradingview.com");
    expect(sent.value).toBe(SECRET_VALUE);
  });

  it("toCookieParam keeps HttpOnly/Secure and builds a https url", () => {
    const param = transfer.toCookieParam(tvCookie({ sameSite: "None" }));
    expect(param.httpOnly).toBe(true);
    expect(param.secure).toBe(true);
    expect(param.sameSite).toBe("None");
    expect(param.url).toBe("https://tradingview.com/");
  });

  it("default Railway artifact path is on the volume, not inside the Chrome profile", () => {
    expect(
      transfer.resolveArtifactPath({
        TRADINGVIEW_BROWSER_USER_DATA_DIR: "/data/tradingview-profile",
      })
    ).toBe("/data/tv-session-bootstrap.enc");
    expect(
      transfer.resolveArtifactPath({
        TRADINGVIEW_SESSION_BOOTSTRAP_PATH: "/data/custom.enc",
      })
    ).toBe("/data/custom.enc");
  });

  it("summaries and logs never include cookie values", () => {
    const summary = transfer.summarizeCookies([tvCookie()]);
    const text = transfer.formatSummary(summary);
    expect(text).toMatch(/items=1/);
    expect(text).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(summary)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(summary)).not.toContain("sessionid");
  });
});

describe("Stage 1C runtime applies import before TradingView navigation", () => {
  function mockChild() {
    const { EventEmitter } = require("events");
    const child = new EventEmitter();
    child.pid = 99;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    return child;
  }

  function cdpHttp(list: unknown[]) {
    const { EventEmitter } = require("events");
    return {
      get: (url: string, cb: (res: { statusCode: number; on: Function; emit: Function }) => void) => {
        const res = new EventEmitter() as { statusCode: number } & InstanceType<typeof EventEmitter>;
        res.statusCode = 200;
        const body = String(url).includes("/json/list")
          ? JSON.stringify(list)
          : JSON.stringify({ Browser: "Chromium/120" });
        process.nextTick(() => {
          cb(res);
          res.emit("data", body);
          res.emit("end");
        });
        const req = new EventEmitter() as { setTimeout: () => void; destroy: () => void } & InstanceType<
          typeof EventEmitter
        >;
        req.setTimeout = () => {};
        req.destroy = () => {};
        return req;
      },
    };
  }

  it("imports session state before navigating a blank tab", async () => {
    const order: string[] = [];
    const sessionTransfer = {
      inspectBootstrapFiles: () => ({
        artifact_present: true,
        consumed: false,
        secret_configured: true,
      }),
      emptyBootstrapSummary: () => ({ status: "none", items: null }),
      resolveImportRequest: () => ({
        shouldImport: true,
        path: "/data/tv-session-bootstrap.enc",
        secret: "x",
        files: { artifact_present: true, secret_configured: true },
      }),
      importSessionFromArtifact: async () => {
        order.push("import");
        return {
          applied: true,
          reason: "IMPORTED",
          summary: { status: "imported", items: 2, httpOnly: 2, domains: ["tradingview.com"] },
        };
      },
    };
    const navigatePage = vi.fn(async () => {
      order.push("navigate");
    });
    const createTarget = vi.fn(async () => {
      order.push("create");
      return { id: "created" };
    });
    const rt = createRuntime({
      spawn: () => mockChild(),
      http: cdpHttp([
        { id: "t-new", type: "page", url: "chrome://new-tab-page/", title: "New Tab" },
      ]),
      existsSync: () => true,
      mkdirSync: () => undefined,
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: "/data/tradingview-profile",
        TRADINGVIEW_BROWSER_STARTUP_TIMEOUT_MS: "80",
      },
      log: () => {},
      restartDelayMs: 60_000,
      importSettleMs: 0,
      sessionTransfer,
      navigatePage,
      createTarget,
      closeBrowser: async () => undefined,
    });
    const snap = await rt.start({ preferAdopt: false });
    expect(order[0]).toBe("import");
    expect(order).toEqual(["import", "navigate"]);
    expect(createTarget).not.toHaveBeenCalled();
    expect(snap.session_bootstrap.status).toBe("imported");
    expect(snap.session_bootstrap.items).toBe(2);
    expect(snap.profile_copy_required).toBe(false);
    expect(snap.user_data_dir).toBe("/data/tradingview-profile");
    await rt.stop();
  });

  it("reloads an existing chart tab after import so TradingView sees the session", async () => {
    const order: string[] = [];
    const sessionTransfer = {
      inspectBootstrapFiles: () => ({
        artifact_present: true,
        consumed: false,
        secret_configured: true,
      }),
      emptyBootstrapSummary: () => ({ status: "none", items: null }),
      resolveImportRequest: () => ({
        shouldImport: true,
        path: "/data/tv-session-bootstrap.enc",
        secret: "x",
        files: { artifact_present: true, secret_configured: true },
      }),
      importSessionFromArtifact: async () => {
        order.push("import");
        return {
          applied: true,
          reason: "IMPORTED",
          summary: { status: "imported", items: 1, httpOnly: 1, domains: ["tradingview.com"] },
        };
      },
    };
    const navigatePage = vi.fn(async () => {
      order.push("navigate");
    });
    const rt = createRuntime({
      spawn: () => mockChild(),
      http: cdpHttp([
        { id: "t-chart", type: "page", url: "https://www.tradingview.com/chart/", title: "Chart" },
      ]),
      existsSync: () => true,
      mkdirSync: () => undefined,
      env: {
        TRADINGVIEW_BROWSER_ENABLED: "true",
        TRADINGVIEW_BROWSER_EXECUTABLE: "/usr/bin/chromium",
        TRADINGVIEW_BROWSER_USER_DATA_DIR: "/data/tradingview-profile",
        TRADINGVIEW_BROWSER_STARTUP_TIMEOUT_MS: "80",
      },
      log: () => {},
      restartDelayMs: 60_000,
      importSettleMs: 0,
      sessionTransfer,
      navigatePage,
      createTarget: vi.fn(async () => ({ id: "created" })),
      closeBrowser: async () => undefined,
    });
    await rt.start({ preferAdopt: false });
    expect(order).toEqual(["import", "navigate"]);
    expect(navigatePage).toHaveBeenCalledTimes(1);
    await rt.stop();
  });
});

describe("Stage 1C docs and endpoints — no full-profile copy", () => {
  it("STAGE_1C docs no longer instruct copying .tv-profile onto Railway", () => {
    const fs = require("fs");
    const doc = fs.readFileSync(path.join(process.cwd(), "..", "STAGE_1C_BROWSER_RUNTIME.md"), "utf8");
    expect(doc).not.toMatch(/Copy `\.\/\.tv-profile` onto the Railway volume/);
    expect(doc).toMatch(/Do not copy a macOS Chrome profile onto Railway Linux/i);
    expect(doc).toMatch(/npm run tv:session-export/);
    expect(doc).toMatch(/npm run tv:session-import/);
    expect(doc).toMatch(/tradingview=ready authenticated=yes/);
    expect(doc).toMatch(/\/data\/tradingview-profile/);
  });

  it("health snapshot reports profile_copy_required=false", () => {
    const rt = createRuntime({
      env: { TRADINGVIEW_BROWSER_ENABLED: "true" },
      spawn: () => {
        throw new Error("must not spawn");
      },
      log: () => {},
      sessionTransfer: {
        inspectBootstrapFiles: () => ({
          artifact_present: false,
          consumed: false,
          secret_configured: false,
        }),
        emptyBootstrapSummary: () => ({ status: "none", items: null }),
      },
    });
    const snap = rt.snapshot();
    expect(snap.profile_copy_required).toBe(false);
    expect(snap.session_bootstrap.status).toBe("none");
    expect(snap.user_data_dir).toBe("/data/tradingview-profile");
  });
});
