/**
 * Phase 4C session operations helpers: ops audit, locks, stale, tick failure.
 * Lifecycle transitions stay in session-service (terminal-state protection).
 */

import {
  getPaperReadinessConfig,
  PAPER_FORWARD_OPS_ENGINE_VERSION,
  type PaperReadinessConfig,
} from "./readiness-config";
import type { PaperForwardSession } from "./types";
import { failPaperSession, type PaperForwardPersistence } from "./session-service";
import type { PaperOpsPersistence } from "./ops-persistence";

export type PaperOpsEventType =
  | "STARTED"
  | "PAUSED"
  | "RESUMED"
  | "ABORTED"
  | "COMPLETED"
  | "FAILED"
  | "TICK_LOCK_ACQUIRED"
  | "TICK_LOCK_RELEASED"
  | "TICK_OK"
  | "TICK_ERROR"
  | "TICK_RETRY"
  | "STALE_DETECTED"
  | "EVALUATED"
  | "READINESS_DECIDED"
  | "REVIEW_APPROVED"
  | "REVIEW_REJECTED";

export async function insertPaperOpsEvent(
  db: PaperOpsPersistence,
  row: {
    session_id: string;
    event_type: PaperOpsEventType;
    payload?: Record<string, unknown> | null;
    actor?: string | null;
    strategy_id?: string | null;
    strategy_version_id?: string | null;
    snapshot_hash?: string | null;
  }
): Promise<void> {
  await db.insertPaperForwardOpsEvent({
    session_id: row.session_id,
    strategy_id: row.strategy_id ?? null,
    strategy_version_id: row.strategy_version_id ?? null,
    snapshot_hash: row.snapshot_hash ?? null,
    event_type: row.event_type,
    payload: {
      engine: PAPER_FORWARD_OPS_ENGINE_VERSION,
      ...(row.payload ?? {}),
    },
    actor: row.actor ?? "system",
    engine_version: PAPER_FORWARD_OPS_ENGINE_VERSION,
  });
}

export async function acquireTickLock(
  db: PaperOpsPersistence,
  sessionId: string,
  token: string,
  leaseMs: number
): Promise<boolean> {
  return db.acquirePaperForwardTickLock(sessionId, token, leaseMs);
}

export async function releaseTickLock(
  db: PaperOpsPersistence,
  sessionId: string,
  token: string
): Promise<void> {
  await db.releasePaperForwardTickLock(sessionId, token);
}

export async function recordTickFailure(
  db: PaperOpsPersistence,
  sessionDb: PaperForwardPersistence,
  session: PaperForwardSession,
  error: string,
  config?: Partial<PaperReadinessConfig>
): Promise<PaperForwardSession> {
  const cfg = getPaperReadinessConfig(config);
  const count = (session.tick_error_count ?? 0) + 1;
  await db.updatePaperForwardExecution(session.id, {
    last_tick_error: error.slice(0, 2000),
    tick_error_count: count,
  });
  await insertPaperOpsEvent(db, {
    session_id: session.id,
    event_type: count > 1 ? "TICK_RETRY" : "TICK_ERROR",
    strategy_id: session.strategy_id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    payload: { error: error.slice(0, 500), tick_error_count: count },
  });
  if (count >= cfg.maxTickErrors) {
    return failPaperSession(
      sessionDb,
      session.id,
      `tick_error_count=${count}: ${error.slice(0, 200)}`
    );
  }
  return {
    ...session,
    last_tick_error: error.slice(0, 2000),
    tick_error_count: count,
  };
}

export async function recordTickSuccess(
  db: PaperOpsPersistence,
  session: PaperForwardSession,
  candlesProcessedDelta: number
): Promise<PaperForwardSession> {
  const candles = (session.candles_processed ?? 0) + candlesProcessedDelta;
  const next = await db.updatePaperForwardExecution(session.id, {
    last_tick_at: new Date().toISOString(),
    last_tick_error: null,
    candles_processed: candles,
  });
  await insertPaperOpsEvent(db, {
    session_id: session.id,
    event_type: "TICK_OK",
    strategy_id: session.strategy_id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    payload: { candlesProcessedDelta, candles_processed: candles },
  });
  return (next ?? {
    ...session,
    last_tick_at: new Date().toISOString(),
    last_tick_error: null,
    candles_processed: candles,
  }) as PaperForwardSession;
}

export function isSessionStale(
  session: PaperForwardSession,
  nowMs: number,
  staleAfterHours: number
): boolean {
  if (session.lifecycle_status !== "RUNNING") return false;
  const ref = session.last_tick_at ?? session.started_at;
  if (!ref) return false;
  return nowMs - new Date(ref).getTime() > staleAfterHours * 3_600_000;
}

export async function markSessionStale(
  db: PaperOpsPersistence,
  session: PaperForwardSession
): Promise<void> {
  if (session.stale_detected_at) return;
  await db.updatePaperForwardExecution(session.id, {
    stale_detected_at: new Date().toISOString(),
  });
  await insertPaperOpsEvent(db, {
    session_id: session.id,
    event_type: "STALE_DETECTED",
    strategy_id: session.strategy_id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    payload: {
      last_tick_at: session.last_tick_at ?? null,
      started_at: session.started_at,
    },
  });
}
