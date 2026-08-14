/**
 * Bounded retry classification. Transient vs structural vs capability.
 * Does not invent provider data. Does not retry forever.
 */

import { EnrichmentError, EnrichmentPersistenceError } from "./errors";
import type { EnrichCandidateResult, IntelligenceSnapshot } from "./types";

export const PERMANENT_ERROR_CODES = new Set([
  "PROVENANCE_INVALID",
  "CANDIDATE_MISSING",
  "WRONG_STATUS",
  "SNAPSHOT_NOT_EXECUTABLE",
  "UNSUPPORTED_MARKET",
  "STRATEGY_VERSION_MISMATCH",
  "VERSION_MISSING",
  "SNAPSHOT_MISSING",
  "TIMEFRAME_MISMATCH",
]);

export type RetryClass = "terminal" | "retry" | "capability" | "permanent";

export interface RetryDecision {
  class: RetryClass;
  nextRetryAt: string | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
}

const TRANSIENT_HINT =
  /timeout|timed out|econnreset|enotfound|network|429|rate.?limit|eai_again|socket|5\d\d|http_5|fetch failed|temporar/i;

export function sanitizeErrorMessage(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let s = String(raw).slice(0, 400);
  s = s.replace(/sk-ant-[a-zA-Z0-9-_]+/g, "[redacted]");
  s = s.replace(/Bearer\s+\S+/gi, "[redacted]");
  s = s.replace(/api[_-]?key[=:]\s*\S+/gi, "api_key=[redacted]");
  s = s.replace(/webhook_token[=:]\s*\S+/gi, "webhook_token=[redacted]");
  s = s.replace(/secret[=:]\s*\S+/gi, "secret=[redacted]");
  return s;
}

export function backoffMs(attempt: number, baseMs: number, capMs: number): number {
  const exp = Math.max(0, attempt - 1);
  const raw = baseMs * Math.pow(2, exp);
  return Math.min(capMs, raw);
}

function capabilityBlocked(snapshot: IntelligenceSnapshot | undefined): boolean {
  if (!snapshot) return false;
  const critical = snapshot.freshness.missing_critical || [];
  if (!critical.length && !snapshot.freshness.stale_fields?.length) {
    return snapshot.derivatives.liquidations.availability === "UNAVAILABLE_PLAN";
  }
  const stale = new Set(snapshot.freshness.stale_fields || []);
  if (stale.size > 0) return false;

  const capabilityAvail = new Set(["UNAVAILABLE_PLAN", "UNAVAILABLE"]);
  for (const field of critical) {
    if (field === "derivatives.liquidations") {
      const a = snapshot.derivatives.liquidations.availability;
      if (capabilityAvail.has(a) && a !== "STALE") continue;
      return false;
    }
    if (field === "market.price") return false;
    if (field === "macro") {
      const a = snapshot.macro.availability;
      if (a === "UNAVAILABLE" || a === "UNAVAILABLE_PLAN") {
        /* calendar outage can be transient; do not treat as capability */
        return false;
      }
    }
    if (field === "derivatives.open_interest" || field === "derivatives.funding") {
      return false;
    }
  }
  return critical.some((f) => f === "derivatives.liquidations");
}

function observabilityTransient(result: EnrichCandidateResult | undefined): boolean {
  const calls = result?.observability.calls || [];
  return calls.some((c) => {
    if (c.ok) return false;
    const blob = `${c.error || ""} ${c.error_code || ""}`;
    return TRANSIENT_HINT.test(blob);
  });
}

export function classifyEnrichmentOutcome(input: {
  result?: EnrichCandidateResult;
  error?: unknown;
  attempt: number;
  maxAttempts: number;
  nowMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
}): RetryDecision {
  const err = input.error;
  if (err instanceof EnrichmentError && PERMANENT_ERROR_CODES.has(err.code)) {
    return {
      class: "permanent",
      nextRetryAt: null,
      errorCode: err.code,
      errorMessageSafe: sanitizeErrorMessage(err.message),
    };
  }

  if (input.result?.status === "READY_FOR_AI_REVIEW") {
    return {
      class: "terminal",
      nextRetryAt: null,
      errorCode: null,
      errorMessageSafe: null,
    };
  }

  const atCap = input.attempt >= input.maxAttempts;
  const retryAt = new Date(
    input.nowMs + backoffMs(input.attempt, input.retryBaseMs, input.retryMaxMs)
  ).toISOString();

  if (input.result?.status === "ENRICHMENT_PARTIAL") {
    if (capabilityBlocked(input.result.snapshot) && !observabilityTransient(input.result)) {
      return {
        class: "capability",
        nextRetryAt: null,
        errorCode: "ENRICHMENT_PARTIAL_CAPABILITY",
        errorMessageSafe: sanitizeErrorMessage(
          `partial: missing_critical=${(input.result.snapshot.freshness.missing_critical || []).join(",")}`
        ),
      };
    }
    return {
      class: atCap ? "capability" : "retry",
      nextRetryAt: atCap ? null : retryAt,
      errorCode: "ENRICHMENT_PARTIAL",
      errorMessageSafe: sanitizeErrorMessage(
        `partial: stale=${(input.result.snapshot.freshness.stale_fields || []).join(",")}`
      ),
    };
  }

  const code =
    err instanceof EnrichmentError
      ? err.code
      : err instanceof EnrichmentPersistenceError
        ? "PERSISTENCE"
        : "ENRICHMENT_FAILED";
  const message =
    err instanceof Error ? err.message : input.result?.status || "enrichment failed";

  if (atCap) {
    return {
      class: "permanent",
      nextRetryAt: null,
      errorCode: String(code),
      errorMessageSafe: sanitizeErrorMessage(`${message} (max attempts ${input.maxAttempts})`),
    };
  }

  return {
    class: "retry",
    nextRetryAt: retryAt,
    errorCode: String(code),
    errorMessageSafe: sanitizeErrorMessage(message),
  };
}
