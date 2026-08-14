/**
 * Durable claim eligibility. In-memory CAS is used in tests; production uses
 * Postgres FOR UPDATE SKIP LOCKED via claim_enrichment_candidates.
 */

import type { TradingViewCandidateRow } from "@/tradingview-pipeline/types";

export const WORKER_IGNORABLE_STATUSES = [
  "READY_FOR_AI_REVIEW",
  "INVALID",
  "RECEIVED",
] as const;

export function attemptCountOf(row: TradingViewCandidateRow): number {
  return typeof row.attempt_count === "number" && Number.isFinite(row.attempt_count)
    ? row.attempt_count
    : 0;
}

export function isStaleEnriching(
  row: TradingViewCandidateRow,
  nowMs: number,
  staleLockMs: number
): boolean {
  if (row.status !== "ENRICHING") return false;
  if (!row.claimed_at) return true;
  const claimed = new Date(row.claimed_at).getTime();
  if (Number.isNaN(claimed)) return true;
  return claimed <= nowMs - staleLockMs;
}

export function isRetryDue(row: TradingViewCandidateRow, nowMs: number): boolean {
  if (row.status !== "ENRICHMENT_PARTIAL" && row.status !== "ENRICHMENT_FAILED") {
    return false;
  }
  if (!row.next_retry_at) return false;
  const t = new Date(row.next_retry_at).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}

export function isClaimEligible(
  row: TradingViewCandidateRow,
  nowMs: number,
  staleLockMs: number,
  maxAttempts: number
): boolean {
  if ((WORKER_IGNORABLE_STATUSES as readonly string[]).includes(row.status)) {
    return false;
  }
  if (attemptCountOf(row) >= maxAttempts) return false;
  if (row.status === "READY_FOR_ENRICHMENT") return true;
  if (isRetryDue(row, nowMs)) return true;
  if (isStaleEnriching(row, nowMs, staleLockMs)) return true;
  return false;
}

export async function claimEligibleCandidatesInMemory(
  rows: TradingViewCandidateRow[],
  opts: {
    workerId: string;
    nowMs: number;
    limit: number;
    staleLockMs: number;
    maxAttempts: number;
    lock: { run: <T>(fn: () => Promise<T> | T) => Promise<T> };
  }
): Promise<TradingViewCandidateRow[]> {
  return opts.lock.run(() => {
    const picked: TradingViewCandidateRow[] = [];
    const sorted = [...rows].sort((a, b) => {
      const ta = new Date(a.received_at || a.created_at).getTime();
      const tb = new Date(b.received_at || b.created_at).getTime();
      return ta - tb;
    });
    for (const row of sorted) {
      if (picked.length >= opts.limit) break;
      if (!isClaimEligible(row, opts.nowMs, opts.staleLockMs, opts.maxAttempts)) {
        continue;
      }
      row.status = "ENRICHING";
      row.claimed_at = new Date(opts.nowMs).toISOString();
      row.claimed_by = opts.workerId;
      row.last_attempt_at = row.claimed_at;
      row.attempt_count = attemptCountOf(row) + 1;
      picked.push(row);
    }
    return picked;
  });
}

export function createMemoryClaimLock() {
  let chain = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T> | T): Promise<T> {
      const run = chain.then(() => fn());
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
  };
}
