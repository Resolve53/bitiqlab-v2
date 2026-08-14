/**
 * Stage 2B enrichment worker tick.
 * Discovers READY_FOR_ENRICHMENT candidates, claims them in the DB, then
 * reuses enrichCandidate() — no duplicate enrichment logic, no AI, no execution.
 */

import type { AuthorityDeps } from "@/tradingview-pipeline/authority";
import type { TradingViewCandidateRow } from "@/tradingview-pipeline/types";
import { enrichCandidate } from "./enrich";
import type { EnrichmentProviders, IntelligencePersistence } from "./enrich";
import { EnrichmentError } from "./errors";
import { getEnrichmentWorkerConfig, ENRICHMENT_WORKER_VERSION } from "./config";
import { workerLog } from "./log";
import { classifyEnrichmentOutcome } from "./retry-policy";
import type { EnrichCandidateResult } from "./types";

export { ENRICHMENT_WORKER_VERSION } from "./config";

export interface EnrichmentOpsPatch {
  status?: string;
  next_retry_at?: string | null;
  last_error_code?: string | null;
  last_error_message_safe?: string | null;
  enrichment_completed_at?: string | null;
  claimed_at?: string | null;
  claimed_by?: string | null;
}

export interface WorkerHeartbeatRow {
  worker_id: string;
  worker_version: string;
  status: string;
  last_heartbeat: string;
  last_tick_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  processed_count: number;
  failed_count: number;
  currently_processing: string | null;
}

export interface WorkerPersistence extends IntelligencePersistence {
  claimEnrichmentCandidates: (opts: {
    workerId: string;
    limit: number;
    staleLockMs: number;
    maxAttempts: number;
    nowMs: number;
  }) => Promise<TradingViewCandidateRow[]>;
  updateEnrichmentOps: (
    id: string,
    patch: EnrichmentOpsPatch
  ) => Promise<TradingViewCandidateRow>;
  getLatestIntelligenceSnapshot: (candidateId: string) => Promise<{
    status: string;
    enrichment_version: number;
    fetched_at: string;
    intelligence?: unknown;
  } | null>;
  upsertEnrichmentWorkerHeartbeat: (row: WorkerHeartbeatRow) => Promise<void>;
  listEnrichmentWorkerHeartbeats: () => Promise<WorkerHeartbeatRow[]>;
}

export interface TickResult {
  worker_id: string;
  claimed: number;
  processed: number;
  succeeded: number;
  failed: number;
  reconciled: number;
  results: Array<{
    candidate_id: string;
    status_before: string;
    status_after: string;
    attempt: number;
    duration_ms: number;
    recovered_stale?: boolean;
  }>;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]);
    }
  }
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function runEnrichmentWorkerTick(
  deps: AuthorityDeps & WorkerPersistence,
  opts?: {
    nowMs?: number;
    providers?: Partial<EnrichmentProviders>;
    workerId?: string;
    heartbeat?: WorkerHeartbeatRow;
  }
): Promise<TickResult> {
  const cfg = getEnrichmentWorkerConfig();
  const nowMs = opts?.nowMs ?? Date.now();
  const workerId = opts?.workerId || cfg.workerId;
  const t0 = Date.now();

  const existing = (await deps.listEnrichmentWorkerHeartbeats()).find(
    (h) => h.worker_id === workerId
  );
  const heartbeat: WorkerHeartbeatRow = opts?.heartbeat ||
    existing || {
      worker_id: workerId,
      worker_version: cfg.workerVersion,
      status: "running",
      last_heartbeat: iso(nowMs),
      last_tick_at: iso(nowMs),
      last_success_at: null,
      last_failure_at: null,
      processed_count: 0,
      failed_count: 0,
      currently_processing: null,
    };
  heartbeat.worker_version = cfg.workerVersion;
  heartbeat.last_heartbeat = iso(nowMs);
  heartbeat.last_tick_at = iso(nowMs);
  heartbeat.status = "running";

  await deps.upsertEnrichmentWorkerHeartbeat(heartbeat);

  const claimed = await deps.claimEnrichmentCandidates({
    workerId,
    limit: cfg.batchSize,
    staleLockMs: cfg.staleLockMs,
    maxAttempts: cfg.maxAttempts,
    nowMs,
  });

  const results: TickResult["results"] = [];
  let succeeded = 0;
  let failed = 0;
  let reconciled = 0;

  await mapLimit(claimed, cfg.concurrency, async (row) => {
    const statusBefore = "ENRICHING";
    const recoveredStale = (row.attempt_count ?? 0) > 1;
    const started = Date.now();
    heartbeat.currently_processing = row.candidate_id;
    await deps.upsertEnrichmentWorkerHeartbeat({
      ...heartbeat,
      last_heartbeat: iso(Date.now()),
    });

    workerLog("enrichment_tick_start", {
      candidate_id: row.candidate_id,
      strategy_version_id: row.strategy_version_id,
      attempt: row.attempt_count ?? 0,
      status_before: statusBefore,
      worker_id: workerId,
      recovered_stale: recoveredStale,
    });

    try {
      const latest = await deps.getLatestIntelligenceSnapshot(row.candidate_id);
      if (latest?.status === "READY_FOR_AI_REVIEW") {
        await deps.updateEnrichmentOps(row.id, {
          status: "READY_FOR_AI_REVIEW",
          next_retry_at: null,
          last_error_code: null,
          last_error_message_safe: null,
          enrichment_completed_at: iso(nowMs),
        });
        reconciled += 1;
        succeeded += 1;
        heartbeat.processed_count += 1;
        heartbeat.last_success_at = iso(Date.now());
        results.push({
          candidate_id: row.candidate_id,
          status_before: statusBefore,
          status_after: "READY_FOR_AI_REVIEW",
          attempt: row.attempt_count ?? 0,
          duration_ms: Date.now() - started,
          recovered_stale: recoveredStale,
        });
        workerLog("enrichment_tick_reconciled", {
          candidate_id: row.candidate_id,
          strategy_version_id: row.strategy_version_id,
          attempt: row.attempt_count ?? 0,
          status_after: "READY_FOR_AI_REVIEW",
          duration_ms: Date.now() - started,
          worker_id: workerId,
        });
        return;
      }

      const result: EnrichCandidateResult = await enrichCandidate(deps, row.id, {
        nowMs,
        providers: opts?.providers,
      });
      const decision = classifyEnrichmentOutcome({
        result,
        attempt: row.attempt_count ?? 1,
        maxAttempts: cfg.maxAttempts,
        nowMs,
        retryBaseMs: cfg.retryBaseMs,
        retryMaxMs: cfg.retryMaxMs,
      });
      await deps.updateEnrichmentOps(row.id, {
        next_retry_at: decision.nextRetryAt,
        last_error_code: decision.errorCode,
        last_error_message_safe: decision.errorMessageSafe,
        enrichment_completed_at:
          result.status === "READY_FOR_AI_REVIEW" ? iso(nowMs) : null,
      });
      heartbeat.processed_count += 1;
      if (result.status === "READY_FOR_AI_REVIEW") {
        succeeded += 1;
        heartbeat.last_success_at = iso(Date.now());
      } else if (decision.class === "retry") {
        failed += 1;
        heartbeat.failed_count += 1;
        heartbeat.last_failure_at = iso(Date.now());
      } else {
        failed += 1;
        heartbeat.failed_count += 1;
        heartbeat.last_failure_at = iso(Date.now());
      }
      results.push({
        candidate_id: row.candidate_id,
        status_before: statusBefore,
        status_after: result.status,
        attempt: row.attempt_count ?? 0,
        duration_ms: Date.now() - started,
        recovered_stale: recoveredStale,
      });
      workerLog("enrichment_tick_done", {
        candidate_id: row.candidate_id,
        strategy_version_id: row.strategy_version_id,
        attempt: row.attempt_count ?? 0,
        status_before: statusBefore,
        status_after: result.status,
        duration_ms: Date.now() - started,
        worker_id: workerId,
        retry_class: decision.class,
      });
    } catch (error) {
      const decision = classifyEnrichmentOutcome({
        error,
        attempt: row.attempt_count ?? 1,
        maxAttempts: cfg.maxAttempts,
        nowMs,
        retryBaseMs: cfg.retryBaseMs,
        retryMaxMs: cfg.retryMaxMs,
      });
      const statusAfter =
        decision.class === "permanent" || decision.class === "capability"
          ? "ENRICHMENT_FAILED"
          : "ENRICHMENT_FAILED";
      try {
        await deps.updateEnrichmentOps(row.id, {
          status: statusAfter,
          next_retry_at: decision.nextRetryAt,
          last_error_code: decision.errorCode,
          last_error_message_safe: decision.errorMessageSafe,
        });
      } catch {
        /* still record failure on heartbeat */
      }
      failed += 1;
      heartbeat.processed_count += 1;
      heartbeat.failed_count += 1;
      heartbeat.last_failure_at = iso(Date.now());
      results.push({
        candidate_id: row.candidate_id,
        status_before: statusBefore,
        status_after: statusAfter,
        attempt: row.attempt_count ?? 0,
        duration_ms: Date.now() - started,
        recovered_stale: recoveredStale,
      });
      workerLog("enrichment_tick_error", {
        candidate_id: row.candidate_id,
        strategy_version_id: row.strategy_version_id,
        attempt: row.attempt_count ?? 0,
        status_before: statusBefore,
        status_after: statusAfter,
        duration_ms: Date.now() - started,
        worker_id: workerId,
        error_code: decision.errorCode,
        error: decision.errorMessageSafe,
      });
      if (error instanceof EnrichmentError && error.code === "CANDIDATE_MISSING") {
        return;
      }
    } finally {
      heartbeat.currently_processing = null;
    }
  });

  heartbeat.currently_processing = null;
  heartbeat.last_heartbeat = iso(Date.now());
  await deps.upsertEnrichmentWorkerHeartbeat(heartbeat);

  workerLog("enrichment_tick_summary", {
    worker_id: workerId,
    claimed: claimed.length,
    processed: results.length,
    succeeded,
    failed,
    duration_ms: Date.now() - t0,
  });

  return {
    worker_id: workerId,
    claimed: claimed.length,
    processed: results.length,
    succeeded,
    failed,
    reconciled,
    results,
  };
}

export function summarizeHeartbeats(
  rows: WorkerHeartbeatRow[],
  nowMs = Date.now(),
  staleMs = getEnrichmentWorkerConfig().heartbeatStaleMs
) {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(b.last_heartbeat).getTime() - new Date(a.last_heartbeat).getTime()
  );
  const latest = sorted[0] || null;
  const live = sorted.filter((r) => {
    const age = nowMs - new Date(r.last_heartbeat).getTime();
    return Number.isFinite(age) && age <= staleMs;
  });
  const processing = live
    .map((r) => r.currently_processing)
    .filter((x): x is string => Boolean(x));
  const status = !latest ? "no_workers" : live.length ? "ok" : "stale";
  return {
    status,
    last_heartbeat: latest?.last_heartbeat ?? null,
    last_tick_at: latest?.last_tick_at ?? null,
    last_success_at: latest?.last_success_at ?? null,
    last_failure_at: latest?.last_failure_at ?? null,
    processed_count: sorted.reduce((n, r) => n + (r.processed_count || 0), 0),
    failed_count: sorted.reduce((n, r) => n + (r.failed_count || 0), 0),
    currently_processing: processing[0] ?? null,
    worker_version: latest?.worker_version ?? ENRICHMENT_WORKER_VERSION,
    live_workers: live.length,
    workers: sorted.map((r) => ({
      worker_id: r.worker_id,
      status: r.status,
      last_heartbeat: r.last_heartbeat,
      currently_processing: r.currently_processing,
      processed_count: r.processed_count,
      failed_count: r.failed_count,
    })),
  };
}
