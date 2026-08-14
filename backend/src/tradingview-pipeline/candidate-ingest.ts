/**
 * Candidate ingest: validate → dedupe → persist.
 * NEVER places exchange orders or calls paper/live execution services.
 */

import {
  CandidateValidationError,
  PineAuthorityError,
  SnapshotHashMismatchError,
  TradingViewPipelinePersistenceError,
} from "./errors";
import {
  BITIQ_PINE_VERSION,
  CANDIDATE_SOURCE,
} from "./constants";
import type {
  CandidateIngestResult,
  TradingViewCandidateRow,
} from "./types";
import {
  assertPayloadSize,
  assertTimestampFreshness,
  buildCandidateId,
  extractWebhookToken,
  getConfiguredWebhookToken,
  parseCandidatePayload,
  parseWebhookBody,
  tokensEqual,
  verifyOptionalHmac,
} from "./webhook-security";
import {
  loadFrozenVersionAuthority,
  type AuthorityDeps,
} from "./authority";

export interface CandidatePersistence {
  insertTradingViewCandidate: (row: {
    candidate_id: string;
    strategy_id: string;
    strategy_version_id: string;
    snapshot_hash: string;
    symbol: string;
    timeframe: string;
    direction: string;
    signal_candle_ts: string;
    received_at: string;
    entry: number;
    stop_loss: number;
    take_profits: number[];
    pine_version: string;
    source: string;
    raw_payload: unknown;
    status: string;
  }) => Promise<TradingViewCandidateRow>;
  getTradingViewCandidateByNaturalKey: (key: {
    strategy_version_id: string;
    symbol: string;
    timeframe: string;
    direction: string;
    signal_candle_ts: string;
  }) => Promise<TradingViewCandidateRow | null>;
  getTradingViewCandidateByCandidateId: (
    candidateId: string
  ) => Promise<TradingViewCandidateRow | null>;
}

export interface IngestRequest {
  body: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  rawBody?: string;
  nowMs?: number;
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate|unique/i.test(message);
}

export async function ingestTradingViewCandidate(
  deps: AuthorityDeps & CandidatePersistence,
  req: IngestRequest
): Promise<CandidateIngestResult> {
  const expectedToken = getConfiguredWebhookToken();
  const rawBody =
    req.rawBody ??
    (typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));
  assertPayloadSize(rawBody);
  verifyOptionalHmac(rawBody, req.headers || {}, expectedToken);

  const parsedObj = parseWebhookBody(req.body);
  const providedToken = extractWebhookToken({
    query: req.query,
    headers: req.headers,
    payload: parsedObj,
  });
  if (!providedToken || !tokensEqual(providedToken, expectedToken)) {
    throw new CandidateValidationError(
      "Invalid webhook token",
      "UNAUTHORIZED",
      401
    );
  }

  const payload = parseCandidatePayload(parsedObj);
  assertTimestampFreshness(
    payload.signal_candle_ts,
    payload.timeframe,
    req.nowMs
  );

  try {
    const authority = await loadFrozenVersionAuthority(deps, {
      strategy_id: payload.strategy_id,
      strategy_version_id: payload.strategy_version_id,
      snapshot_hash: payload.snapshot_hash,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
    });

    if (payload.strategy_id !== authority.strategyId) {
      throw new CandidateValidationError(
        "strategy_id does not match frozen version",
        "STRATEGY_VERSION_MISMATCH",
        400
      );
    }
    if (payload.snapshot_hash !== authority.snapshotHash) {
      throw new CandidateValidationError(
        "snapshot_hash does not match frozen version",
        "SNAPSHOT_HASH_MISMATCH",
        400
      );
    }
    if (payload.timeframe !== authority.timeframe) {
      throw new CandidateValidationError(
        "timeframe does not match frozen version",
        "INVALID_TIMEFRAME",
        400
      );
    }
  } catch (err) {
    if (err instanceof CandidateValidationError) throw err;
    if (err instanceof SnapshotHashMismatchError) {
      throw new CandidateValidationError(
        err.message,
        "SNAPSHOT_HASH_MISMATCH",
        400
      );
    }
    if (err instanceof PineAuthorityError) {
      const code =
        err.code === "VERSION_MISSING" || err.code === "STRATEGY_VERSION_MISMATCH"
          ? "STRATEGY_VERSION_MISMATCH"
          : err.code === "SNAPSHOT_HASH_MISMATCH"
            ? "SNAPSHOT_HASH_MISMATCH"
            : err.code === "UNSUPPORTED_MARKET"
              ? payloadSymbolOrTimeframe(err.message)
              : "STRATEGY_VERSION_MISMATCH";
      throw new CandidateValidationError(err.message, code, 400);
    }
    throw err;
  }

  const candidateId = buildCandidateId({
    strategy_version_id: payload.strategy_version_id,
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    direction: payload.direction,
    signal_candle_ts: payload.signal_candle_ts,
  });

  const existing =
    (await deps.getTradingViewCandidateByCandidateId(candidateId)) ||
    (await deps.getTradingViewCandidateByNaturalKey({
      strategy_version_id: payload.strategy_version_id,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      direction: payload.direction,
      signal_candle_ts: payload.signal_candle_ts,
    }));
  if (existing) {
    return { duplicate: true, candidate: existing };
  }

  const receivedAt = new Date(req.nowMs ?? Date.now()).toISOString();
  try {
    const inserted = await deps.insertTradingViewCandidate({
      candidate_id: candidateId,
      strategy_id: payload.strategy_id,
      strategy_version_id: payload.strategy_version_id,
      snapshot_hash: payload.snapshot_hash,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      direction: payload.direction,
      signal_candle_ts: payload.signal_candle_ts,
      received_at: receivedAt,
      entry: payload.entry,
      stop_loss: payload.stop_loss,
      take_profits: payload.take_profits,
      pine_version: payload.pine_version || BITIQ_PINE_VERSION,
      source: CANDIDATE_SOURCE,
      raw_payload: parsedObj,
      status: "READY_FOR_ENRICHMENT",
    });
    return { duplicate: false, candidate: inserted };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const dup =
        (await deps.getTradingViewCandidateByCandidateId(candidateId)) ||
        (await deps.getTradingViewCandidateByNaturalKey({
          strategy_version_id: payload.strategy_version_id,
          symbol: payload.symbol,
          timeframe: payload.timeframe,
          direction: payload.direction,
          signal_candle_ts: payload.signal_candle_ts,
        }));
      if (dup) return { duplicate: true, candidate: dup };
    }
    if (err instanceof TradingViewPipelinePersistenceError) throw err;
    throw new TradingViewPipelinePersistenceError(
      err instanceof Error ? err.message : "Failed to persist candidate"
    );
  }
}

function payloadSymbolOrTimeframe(message: string): string {
  if (/timeframe/i.test(message)) return "INVALID_TIMEFRAME";
  if (/symbol/i.test(message)) return "INVALID_SYMBOL";
  return "STRATEGY_VERSION_MISMATCH";
}
