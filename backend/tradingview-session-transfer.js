/**
 * Stage 1C — CDP session bootstrap transfer.
 *
 * Exports TradingView-only cookies (including HttpOnly) from a local
 * authenticated Chrome via CDP, encrypts them as a one-time secret artifact,
 * and imports them into Railway Chromium via CDP *before* TradingView is
 * opened. Cross-platform full-profile copy is unsupported.
 *
 * Never logs cookie values, tokens, or the encryption secret.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { sanitizeLogValue } = require("./tradingview-mcp-errors");

const ARTIFACT_KIND = "tradingview-session-bootstrap";
const ENVELOPE_KIND = "tradingview-session-bootstrap-envelope";
const ARTIFACT_VERSION = 1;
const DEFAULT_LOCAL_ARTIFACT = ".tv-session-bootstrap.enc";
const DEFAULT_VOLUME_ARTIFACT = "/data/tv-session-bootstrap.enc";
const DEFAULT_VOLUME_PROFILE = "/data/tradingview-profile";

const KDF_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keylen: 32,
});

const COOKIE_EXPORT_FIELDS = [
  "name",
  "value",
  "domain",
  "path",
  "expires",
  "httpOnly",
  "secure",
  "session",
  "sameSite",
  "priority",
  "sameParty",
  "sourceScheme",
  "sourcePort",
  "partitionKey",
];

class SessionTransferError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "SessionTransferError";
    this.code = code;
    this.error_class = code;
  }
}

function failClosed(code, message) {
  return new SessionTransferError(code, message);
}

function isTradingViewHost(host) {
  const d = String(host || "")
    .replace(/^\./, "")
    .toLowerCase()
    .trim();
  return d === "tradingview.com" || d.endsWith(".tradingview.com");
}

function isTradingViewCookie(cookie) {
  if (!cookie || typeof cookie !== "object") return false;
  if (!cookie.name || typeof cookie.value !== "string") return false;
  if (cookie.domain && isTradingViewHost(cookie.domain)) return true;
  if (cookie.url) {
    try {
      return isTradingViewHost(new URL(cookie.url).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

function filterTradingViewCookies(cookies) {
  return (Array.isArray(cookies) ? cookies : []).filter(isTradingViewCookie);
}

function pickCookieFields(cookie) {
  const out = {};
  for (const key of COOKIE_EXPORT_FIELDS) {
    if (cookie[key] !== undefined) out[key] = cookie[key];
  }
  return out;
}

function normalizeSameSite(value) {
  if (value == null || value === "") return undefined;
  const s = String(value);
  if (/^strict$/i.test(s)) return "Strict";
  if (/^lax$/i.test(s)) return "Lax";
  if (/^none$/i.test(s)) return "None";
  return undefined;
}

function cookieUrl(cookie) {
  const host = String(cookie.domain || "")
    .replace(/^\./, "")
    .toLowerCase();
  const secure =
    cookie.secure === true ||
    cookie.sourceScheme === "Secure" ||
    String(cookie.sameSite || "").toLowerCase() === "none";
  const scheme = secure ? "https" : "http";
  const p = cookie.path || "/";
  return `${scheme}://${host}${p.startsWith("/") ? p : `/${p}`}`;
}

function toCookieParam(cookie) {
  const param = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || "/",
    httpOnly: Boolean(cookie.httpOnly),
    secure: cookie.secure !== false,
    url: cookieUrl(cookie),
  };
  const sameSite = normalizeSameSite(cookie.sameSite);
  if (sameSite) param.sameSite = sameSite;
  if (typeof cookie.expires === "number" && cookie.expires > 0) {
    param.expires = cookie.expires;
  }
  if (cookie.partitionKey) param.partitionKey = cookie.partitionKey;
  if (cookie.sourceScheme) param.sourceScheme = cookie.sourceScheme;
  if (typeof cookie.sourcePort === "number") param.sourcePort = cookie.sourcePort;
  if (cookie.priority) param.priority = cookie.priority;
  return param;
}

function summarizeCookies(cookies) {
  const filtered = filterTradingViewCookies(cookies);
  const domains = [
    ...new Set(
      filtered.map((c) =>
        String(c.domain || "")
          .replace(/^\./, "")
          .toLowerCase()
      )
    ),
  ]
    .filter(Boolean)
    .sort();
  return {
    items: filtered.length,
    httpOnly: filtered.filter((c) => c.httpOnly).length,
    secure: filtered.filter((c) => c.secure).length,
    domains,
  };
}

function formatSummary(summary) {
  const domains = (summary.domains || []).join(",") || "none";
  return `items=${summary.items} httpOnly=${summary.httpOnly} secure=${summary.secure} domains=${domains}`;
}

function assertNoSecretMaterial(text) {
  const s = String(text || "");
  if (/cookie|sessionid|authorization|bearer |password|api[_-]?key|webhook_token/i.test(s)) {
    return "[redacted]";
  }
  return s;
}

function safeLog(log, message) {
  const line = assertNoSecretMaterial(message);
  if (typeof log === "function") log(line);
  else console.log(sanitizeLogValue(line));
}

function generateSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function deriveKey(secret, salt, params = KDF_PARAMS) {
  if (!secret || typeof secret !== "string") {
    throw failClosed("SECRET_REQUIRED", "TRADINGVIEW_SESSION_BOOTSTRAP_SECRET is required");
  }
  return crypto.scryptSync(secret, salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
  });
}

function buildPayload(cookies, extras = {}) {
  const filtered = filterTradingViewCookies(cookies).map(pickCookieFields);
  const summary = summarizeCookies(filtered);
  if (summary.items === 0) {
    throw failClosed("NO_TV_COOKIES", "No tradingview.com cookies available to export");
  }
  if (summary.httpOnly === 0) {
    throw failClosed(
      "NO_HTTPONLY_COOKIES",
      "Export refused: no HttpOnly TradingView cookies (session would be incomplete)"
    );
  }
  return {
    version: ARTIFACT_VERSION,
    kind: ARTIFACT_KIND,
    exported_at: extras.exported_at || new Date().toISOString(),
    source: extras.source || { transfer: "cdp" },
    cookies: filtered,
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw failClosed("INVALID_ARTIFACT", "Artifact payload is not an object");
  }
  if (payload.kind !== ARTIFACT_KIND || payload.version !== ARTIFACT_VERSION) {
    throw failClosed("INVALID_ARTIFACT", "Artifact kind/version is not a Stage 1C session bootstrap");
  }
  if (!Array.isArray(payload.cookies)) {
    throw failClosed("INVALID_ARTIFACT", "Artifact cookies array is missing");
  }
  const cookies = filterTradingViewCookies(payload.cookies);
  const summary = summarizeCookies(cookies);
  if (summary.items === 0) {
    throw failClosed("NO_TV_COOKIES", "Artifact contains no tradingview.com cookies");
  }
  if (summary.httpOnly === 0) {
    throw failClosed("NO_HTTPONLY_COOKIES", "Artifact contains no HttpOnly TradingView cookies");
  }
  return { payload: { ...payload, cookies }, summary };
}

function encryptPayload(payload, secret, opts = {}) {
  const kdf = { ...KDF_PARAMS, ...(opts.kdf || {}) };
  const salt = opts.salt || crypto.randomBytes(16);
  const iv = opts.iv || crypto.randomBytes(12);
  const key = deriveKey(secret, salt, kdf);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const summary = summarizeCookies(payload.cookies);
  return {
    version: ARTIFACT_VERSION,
    kind: ENVELOPE_KIND,
    alg: "aes-256-gcm",
    kdf: "scrypt",
    kdf_params: { N: kdf.N, r: kdf.r, p: kdf.p, keylen: kdf.keylen },
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    meta: {
      ...summary,
      exported_at: payload.exported_at || null,
    },
  };
}

function decryptEnvelope(envelope, secret) {
  if (!envelope || envelope.kind !== ENVELOPE_KIND || envelope.version !== ARTIFACT_VERSION) {
    throw failClosed("INVALID_ENVELOPE", "File is not a Stage 1C session bootstrap envelope");
  }
  if (envelope.alg !== "aes-256-gcm" || envelope.kdf !== "scrypt") {
    throw failClosed("INVALID_ENVELOPE", "Unsupported envelope algorithm");
  }
  if (!secret) {
    throw failClosed("SECRET_REQUIRED", "TRADINGVIEW_SESSION_BOOTSTRAP_SECRET is required");
  }
  let payload;
  try {
    const params = { ...KDF_PARAMS, ...(envelope.kdf_params || {}) };
    const key = deriveKey(secret, Buffer.from(envelope.salt, "base64"), params);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    payload = JSON.parse(plaintext.toString("utf8"));
  } catch (err) {
    if (err instanceof SessionTransferError) throw err;
    throw failClosed("DECRYPT_FAILED", "Decrypt failed (wrong secret or corrupt artifact)");
  }
  return validatePayload(payload);
}

function resolveArtifactPath(env = process.env) {
  const explicit = env.TRADINGVIEW_SESSION_BOOTSTRAP_PATH;
  if (explicit && String(explicit).trim()) return path.resolve(String(explicit).trim());
  const userData = String(env.TRADINGVIEW_BROWSER_USER_DATA_DIR || "");
  if (userData === DEFAULT_VOLUME_PROFILE || userData.startsWith("/data/")) {
    return DEFAULT_VOLUME_ARTIFACT;
  }
  return path.resolve(process.cwd(), DEFAULT_LOCAL_ARTIFACT);
}

function consumedPathFor(artifactPath) {
  return `${artifactPath}.consumed`;
}

function inspectBootstrapFiles(opts = {}) {
  const env = opts.env || process.env;
  const fsMod = opts.fs || fs;
  const artifactPath = resolveArtifactPath(env);
  const consumedPath = consumedPathFor(artifactPath);
  const secretConfigured = Boolean(String(env.TRADINGVIEW_SESSION_BOOTSTRAP_SECRET || "").trim());
  return {
    artifact_path: artifactPath,
    consumed_path: consumedPath,
    artifact_present: Boolean(fsMod.existsSync && fsMod.existsSync(artifactPath)),
    consumed: Boolean(fsMod.existsSync && fsMod.existsSync(consumedPath)),
    secret_configured: secretConfigured,
  };
}

function resolveImportRequest(opts = {}) {
  const env = opts.env || process.env;
  const files = inspectBootstrapFiles(opts);
  const secret = String(env.TRADINGVIEW_SESSION_BOOTSTRAP_SECRET || "").trim();
  if (files.artifact_present && !secret) {
    return {
      shouldImport: false,
      failClosed: true,
      reason: "SECRET_REQUIRED",
      path: files.artifact_path,
      secret: "",
      files,
    };
  }
  if (!files.artifact_present) {
    return {
      shouldImport: false,
      failClosed: false,
      reason: files.consumed ? "ALREADY_CONSUMED" : "NO_ARTIFACT",
      path: files.artifact_path,
      secret: "",
      files,
    };
  }
  return {
    shouldImport: true,
    failClosed: false,
    reason: "READY",
    path: files.artifact_path,
    secret,
    files,
  };
}

function writeArtifactFile(filePath, envelope, fsMod = fs) {
  const dir = path.dirname(filePath);
  if (typeof fsMod.mkdirSync === "function") {
    fsMod.mkdirSync(dir, { recursive: true });
  }
  const body = `${JSON.stringify(envelope, null, 2)}\n`;
  fsMod.writeFileSync(filePath, body, { encoding: "utf8", mode: 0o600 });
  if (typeof fsMod.chmodSync === "function") {
    try {
      fsMod.chmodSync(filePath, 0o600);
    } catch {
      /* ignore */
    }
  }
  return filePath;
}

function readEnvelopeFile(filePath, fsMod = fs) {
  if (!fsMod.existsSync(filePath)) {
    throw failClosed("NO_ARTIFACT", `Bootstrap artifact not found`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fsMod.readFileSync(filePath, "utf8"));
  } catch {
    throw failClosed("INVALID_ENVELOPE", "Bootstrap artifact is not valid JSON");
  }
  return parsed;
}

function shredAndUnlink(filePath, fsMod = fs) {
  try {
    if (!fsMod.existsSync(filePath)) return false;
    let size = 64;
    try {
      const st = fsMod.statSync(filePath);
      size = Math.max(64, Number(st.size) || 64);
    } catch {
      /* ignore */
    }
    fsMod.writeFileSync(filePath, Buffer.alloc(size, 0));
    fsMod.unlinkSync(filePath);
    return true;
  } catch {
    try {
      fsMod.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

function writeConsumedMarker(artifactPath, summary, fsMod = fs) {
  const marker = {
    kind: `${ARTIFACT_KIND}-consumed`,
    consumed_at: new Date().toISOString(),
    items: summary.items,
    httpOnly: summary.httpOnly,
    domains: summary.domains,
  };
  const dest = consumedPathFor(artifactPath);
  fsMod.writeFileSync(dest, `${JSON.stringify(marker, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return dest;
}

async function openCdp(opts = {}) {
  if (opts.client) return { client: opts.client, opened: false };
  const CDP = opts.CDP || require("chrome-remote-interface");
  const client = await CDP({
    host: opts.host || "127.0.0.1",
    port: Number(opts.port || 9222) || 9222,
  });
  return { client, opened: true };
}

async function collectCookiesFromCdp(opts = {}) {
  const { client, opened } = await openCdp(opts);
  try {
    let cookies = [];
    if (client.Storage && typeof client.Storage.getCookies === "function") {
      const result = await client.Storage.getCookies({});
      cookies = (result && result.cookies) || [];
    } else if (client.Network && typeof client.Network.getAllCookies === "function") {
      if (typeof client.Network.enable === "function") {
        try {
          await client.Network.enable();
        } catch {
          /* some stubs do not implement enable */
        }
      }
      const result = await client.Network.getAllCookies();
      cookies = (result && result.cookies) || [];
    } else {
      throw failClosed("CDP_COOKIE_API_UNAVAILABLE", "CDP Storage/Network cookie APIs are unavailable");
    }
    return filterTradingViewCookies(cookies);
  } finally {
    if (opened) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    }
  }
}

async function applyCookiesToCdp(cookies, opts = {}) {
  const params = filterTradingViewCookies(cookies).map(toCookieParam);
  if (!params.length) {
    throw failClosed("NO_TV_COOKIES", "No tradingview.com cookies to apply");
  }
  const { client, opened } = await openCdp(opts);
  try {
    if (client.Storage && typeof client.Storage.setCookies === "function") {
      await client.Storage.setCookies({ cookies: params });
      return { applied: params.length, via: "Storage.setCookies" };
    }
    if (client.Network && typeof client.Network.setCookie === "function") {
      if (typeof client.Network.enable === "function") {
        try {
          await client.Network.enable();
        } catch {
          /* ignore */
        }
      }
      for (const cookie of params) {
        await client.Network.setCookie(cookie);
      }
      return { applied: params.length, via: "Network.setCookie" };
    }
    throw failClosed("CDP_COOKIE_API_UNAVAILABLE", "CDP Storage/Network cookie APIs are unavailable");
  } finally {
    if (opened) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    }
  }
}

function exportSessionToArtifact(opts = {}) {
  const env = opts.env || process.env;
  const fsMod = opts.fs || fs;
  const cookies = opts.cookies;
  if (!Array.isArray(cookies)) {
    throw failClosed("NO_TV_COOKIES", "Export requires cookies collected from CDP");
  }
  const payload = buildPayload(cookies, {
    exported_at: opts.exported_at,
    source: opts.source || { transfer: "cdp" },
  });
  const summary = summarizeCookies(payload.cookies);
  const secret = String(opts.secret || env.TRADINGVIEW_SESSION_BOOTSTRAP_SECRET || "").trim() || generateSecret();
  const generatedSecret = !String(opts.secret || env.TRADINGVIEW_SESSION_BOOTSTRAP_SECRET || "").trim();
  const outPath = path.resolve(opts.outPath || resolveArtifactPath(env));
  if (fsMod.existsSync(outPath) && !opts.force) {
    throw failClosed("ARTIFACT_EXISTS", "Refusing to overwrite an existing bootstrap artifact (pass --force)");
  }
  const envelope = encryptPayload(payload, secret, { kdf: opts.kdf });
  writeArtifactFile(outPath, envelope, fsMod);
  return {
    path: outPath,
    secret: generatedSecret ? secret : null,
    used_provided_secret: !generatedSecret,
    summary,
    envelope_meta: envelope.meta,
  };
}

async function importSessionFromArtifact(opts = {}) {
  const env = opts.env || process.env;
  const fsMod = opts.fs || fs;
  const log = opts.log;
  const request = opts.request || resolveImportRequest({ env, fs: fsMod });
  if (!request.shouldImport) {
    if (request.failClosed) {
      safeLog(log, `[session-import] fail closed: artifact present but secret unset`);
      throw failClosed("SECRET_REQUIRED", "Artifact present but TRADINGVIEW_SESSION_BOOTSTRAP_SECRET is unset");
    }
    return {
      applied: false,
      skipped: true,
      reason: request.reason,
      summary: {
        status: request.reason === "ALREADY_CONSUMED" ? "consumed" : "none",
        ...request.files,
        items: null,
      },
    };
  }
  const envelope = readEnvelopeFile(request.path, fsMod);
  const { payload, summary } = decryptEnvelope(envelope, request.secret);
  const apply = opts.applyCookies || ((list, cdpOpts) => applyCookiesToCdp(list, cdpOpts));
  const applied = await apply(payload.cookies, {
    client: opts.client,
    CDP: opts.CDP,
    host: opts.host || "127.0.0.1",
    port: opts.port,
  });
  const deleted = shredAndUnlink(request.path, fsMod);
  writeConsumedMarker(request.path, summary, fsMod);
  safeLog(log, `[session-import] applied ${formatSummary(summary)} via=${applied.via || "cdp"} deleted=${deleted}`);
  return {
    applied: true,
    skipped: false,
    reason: "IMPORTED",
    deleted,
    via: applied.via,
    summary: {
      status: "imported",
      artifact_present: false,
      consumed: true,
      secret_configured: true,
      items: summary.items,
      httpOnly: summary.httpOnly,
      domains: summary.domains,
    },
  };
}

function emptyBootstrapSummary(files = {}) {
  return {
    status: "none",
    artifact_present: Boolean(files.artifact_present),
    consumed: Boolean(files.consumed),
    secret_configured: Boolean(files.secret_configured),
    items: null,
  };
}

module.exports = {
  ARTIFACT_KIND,
  ENVELOPE_KIND,
  ARTIFACT_VERSION,
  DEFAULT_LOCAL_ARTIFACT,
  DEFAULT_VOLUME_ARTIFACT,
  DEFAULT_VOLUME_PROFILE,
  KDF_PARAMS,
  SessionTransferError,
  failClosed,
  isTradingViewHost,
  isTradingViewCookie,
  filterTradingViewCookies,
  pickCookieFields,
  toCookieParam,
  summarizeCookies,
  formatSummary,
  generateSecret,
  buildPayload,
  validatePayload,
  encryptPayload,
  decryptEnvelope,
  resolveArtifactPath,
  consumedPathFor,
  inspectBootstrapFiles,
  resolveImportRequest,
  writeArtifactFile,
  readEnvelopeFile,
  shredAndUnlink,
  writeConsumedMarker,
  collectCookiesFromCdp,
  applyCookiesToCdp,
  exportSessionToArtifact,
  importSessionFromArtifact,
  emptyBootstrapSummary,
  cookieUrl,
};
