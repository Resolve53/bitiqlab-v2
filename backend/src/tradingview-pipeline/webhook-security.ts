import { createHash, timingSafeEqual } from "crypto";
import { CandidateValidationError } from "./errors";
import {
  BITIQ_PINE_VERSION,
  CANDIDATE_SOURCE,
  DIRECTIONS,
  MAX_CANDLE_AGE_MS,
  MAX_WEBHOOK_BYTES,
  timeframeToMs,
  type CandidateDirection,
} from "./constants";
import type { CandidateSignalPayload } from "./types";
import { SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES } from "@/truth-engine/strategy-schema";

export function getConfiguredWebhookToken(): string {
  const token = String(process.env.TRADINGVIEW_WEBHOOK_TOKEN || "").trim();
  if (!token) {
    throw new CandidateValidationError(
      "TRADINGVIEW_WEBHOOK_TOKEN is not configured — refusing webhook ingest",
      "WEBHOOK_TOKEN_MISSING",
      503
    );
  }
  return token;
}

export function candidateWebhookUrl(baseUrl?: string): string {
  const root = (
    baseUrl ||
    process.env.TRADINGVIEW_CANDIDATE_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    ""
  ).replace(/\/$/, "");
  const token = String(process.env.TRADINGVIEW_WEBHOOK_TOKEN || "").trim();
  if (!root) {
    return `/api/tradingview/candidates?token=${encodeURIComponent(token)}`;
  }
  return `${root}/api/tradingview/candidates?token=${encodeURIComponent(token)}`;
}

export function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function extractWebhookToken(input: {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}): string {
  const q = input.query || {};
  const h = input.headers || {};
  const p = input.payload || {};
  const fromQuery = String(q.token || q.webhook_token || "").trim();
  const fromPayload = String(p.webhook_token || p.token || "").trim();
  const headerAuth = String(h.authorization || h.Authorization || "").trim();
  const fromHeader = headerAuth.toLowerCase().startsWith("bearer ")
    ? headerAuth.slice(7).trim()
    : String(h["x-bitiq-webhook-token"] || "").trim();
  return fromQuery || fromPayload || fromHeader;
}

/**
 * TradingView webhooks cannot set arbitrary HMAC headers from Pine.
 * If a signature IS present (non-TV clients / future adapters), verify it.
 * Primary auth is the shared webhook token in the URL and/or JSON body.
 */
export function verifyOptionalHmac(
  rawBody: string,
  headers: Record<string, unknown>,
  secret: string
): void {
  const sig = String(
    headers["x-bitiq-signature"] || headers["x-hub-signature-256"] || ""
  ).trim();
  if (!sig) return;
  const hex = createHash("sha256").update(rawBody).update(secret).digest("hex");
  const expected = sig.startsWith("sha256=") ? `sha256=${hex}` : hex;
  if (!tokensEqual(sig, expected)) {
    throw new CandidateValidationError(
      "HMAC signature mismatch",
      "HMAC_MISMATCH",
      401
    );
  }
}

export function assertPayloadSize(raw: string | Buffer | object): void {
  const bytes = Buffer.byteLength(
    typeof raw === "string" || Buffer.isBuffer(raw) ? raw : JSON.stringify(raw),
    "utf8"
  );
  if (bytes > MAX_WEBHOOK_BYTES) {
    throw new CandidateValidationError(
      `Payload exceeds ${MAX_WEBHOOK_BYTES} bytes`,
      "PAYLOAD_TOO_LARGE",
      413
    );
  }
}

export function parseWebhookBody(body: unknown): Record<string, unknown> {
  if (body == null) {
    throw new CandidateValidationError("Empty webhook body", "INVALID_SCHEMA", 400);
  }
  if (typeof body === "string") {
    const trimmed = body.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not object");
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new CandidateValidationError(
        "Webhook body is not valid JSON",
        "INVALID_SCHEMA",
        400
      );
    }
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  throw new CandidateValidationError(
    "Webhook body is not a JSON object",
    "INVALID_SCHEMA",
    400
  );
}

export function buildCandidateId(input: {
  strategy_version_id: string;
  symbol: string;
  timeframe: string;
  direction: CandidateDirection;
  signal_candle_ts: string;
}): string {
  const key = [
    input.strategy_version_id,
    input.symbol.toUpperCase(),
    input.timeframe,
    input.direction,
    normalizeCandleTs(input.signal_candle_ts),
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

export function normalizeCandleTs(value: string | number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const ms = n > 1e12 ? n : n * 1000;
    return new Date(ms).toISOString();
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new CandidateValidationError(
      `Invalid signal_candle_ts: ${value}`,
      "INVALID_CANDLE_TS",
      400
    );
  }
  return d.toISOString();
}

export function assertTimestampFreshness(
  signalCandleTs: string,
  timeframe: string,
  nowMs = Date.now()
): void {
  const ts = new Date(signalCandleTs).getTime();
  if (Number.isNaN(ts)) {
    throw new CandidateValidationError(
      "signal_candle_ts is not a valid timestamp",
      "INVALID_CANDLE_TS",
      400
    );
  }
  if (nowMs - ts > MAX_CANDLE_AGE_MS) {
    throw new CandidateValidationError(
      "Stale candidate: signal_candle_ts is older than 48h",
      "STALE_CANDIDATE",
      400
    );
  }
  const futureSlack = timeframeToMs(timeframe) * 2;
  if (ts - nowMs > futureSlack) {
    throw new CandidateValidationError(
      "signal_candle_ts is too far in the future",
      "STALE_CANDIDATE",
      400
    );
  }
}

function asFiniteNumber(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new CandidateValidationError(
      `${field} must be a finite number`,
      "INVALID_SCHEMA",
      400
    );
  }
  return n;
}

export function parseCandidatePayload(
  raw: Record<string, unknown>
): CandidateSignalPayload {
  const required = [
    "strategy_id",
    "strategy_version_id",
    "snapshot_hash",
    "symbol",
    "timeframe",
    "direction",
    "signal_candle_ts",
  ];
  for (const field of required) {
    if (raw[field] == null || String(raw[field]).trim() === "") {
      throw new CandidateValidationError(
        `Missing required field: ${field}`,
        "INVALID_SCHEMA",
        400
      );
    }
  }

  const symbol = String(raw.symbol).toUpperCase();
  const timeframe = String(raw.timeframe);
  const direction = String(raw.direction).toUpperCase() as CandidateDirection;

  if (!(SUPPORTED_SYMBOLS as readonly string[]).includes(symbol)) {
    throw new CandidateValidationError(
      `Invalid symbol "${symbol}"`,
      "INVALID_SYMBOL",
      400
    );
  }
  if (!(SUPPORTED_TIMEFRAMES as readonly string[]).includes(timeframe)) {
    throw new CandidateValidationError(
      `Invalid timeframe "${timeframe}"`,
      "INVALID_TIMEFRAME",
      400
    );
  }
  if (!(DIRECTIONS as readonly string[]).includes(direction)) {
    throw new CandidateValidationError(
      `Invalid direction "${raw.direction}"`,
      "INVALID_DIRECTION",
      400
    );
  }

  const source = String(raw.source || CANDIDATE_SOURCE);
  if (source !== CANDIDATE_SOURCE) {
    throw new CandidateValidationError(
      `Invalid source "${source}" (expected TRADINGVIEW)`,
      "INVALID_SCHEMA",
      400
    );
  }

  const pineVersion = String(raw.pine_version || "");
  if (pineVersion && pineVersion !== BITIQ_PINE_VERSION) {
    throw new CandidateValidationError(
      `Unsupported pine_version "${pineVersion}"`,
      "INVALID_PINE_VERSION",
      400
    );
  }

  const takeProfitsRaw = raw.take_profits;
  let take_profits: number[] = [];
  if (takeProfitsRaw == null) {
    take_profits = [];
  } else if (Array.isArray(takeProfitsRaw)) {
    take_profits = takeProfitsRaw.map((v, i) => asFiniteNumber(v, `take_profits[${i}]`));
  } else {
    throw new CandidateValidationError(
      "take_profits must be an array",
      "INVALID_SCHEMA",
      400
    );
  }

  const signal_candle_ts = normalizeCandleTs(
    raw.signal_candle_ts as string | number
  );

  return {
    candidate_id:
      raw.candidate_id != null ? String(raw.candidate_id) : undefined,
    strategy_id: String(raw.strategy_id),
    strategy_version_id: String(raw.strategy_version_id),
    snapshot_hash: String(raw.snapshot_hash),
    symbol,
    timeframe,
    direction,
    signal_candle_ts,
    entry: asFiniteNumber(raw.entry, "entry"),
    stop_loss: asFiniteNumber(raw.stop_loss, "stop_loss"),
    take_profits,
    pine_version: pineVersion || BITIQ_PINE_VERSION,
    source: CANDIDATE_SOURCE,
    webhook_token:
      raw.webhook_token != null ? String(raw.webhook_token) : undefined,
  };
}
