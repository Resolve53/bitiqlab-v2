/**
 * Phase 4C scheduler — process RUNNING paper sessions with lease locks.
 *
 * Design:
 * - HTTP cron hits POST /api/paper-forward/scheduler/run (not an in-process infinite loop).
 * - Compare-and-set tick_lock_token / tick_lock_until. Expired leases are stealable (restart-safe).
 * - Tick is the Phase 4B worker (idempotent cursor + unique events). Duplicate candles skipped.
 * - Failures increment tick_error_count; at maxTickErrors the session FAIL CLOSEs.
 * - Stale RUNNING sessions are detected and audited; they are not auto-failed unless errors max out.
 * - Never places exchange orders.
 */

import { randomUUID } from "crypto";
import { getTradingSafetyState, PAPER_SIMULATED_NOTICE } from "@/lib/trading-safety";
import {
  getPaperReadinessConfig,
  PAPER_FORWARD_OPS_ENGINE_VERSION,
  type PaperReadinessConfig,
} from "./readiness-config";
import {
  tickPaperSession,
  type MarketDataPort,
  type TickInput,
  type TickResult,
} from "./tick";
import {
  getPaperSession,
  type PaperForwardPersistence,
} from "./session-service";
import type { PaperExecutionPersistence } from "./execution-persistence";
import type { PaperOpsPersistence } from "./ops-persistence";
import {
  acquireTickLock,
  insertPaperOpsEvent,
  isSessionStale,
  markSessionStale,
  recordTickFailure,
  recordTickSuccess,
  releaseTickLock,
} from "./session-ops";
import { evaluateAndPersistPaperSession } from "./evaluate-persist";
import type { PaperForwardSession } from "./types";

export interface SchedulerTickFn {
  (
    sessionDb: PaperForwardPersistence,
    execDb: PaperExecutionPersistence,
    input: TickInput,
    market?: MarketDataPort
  ): Promise<TickResult>;
}

export interface SchedulerRunInput {
  now?: Date;
  actor?: string;
  config?: Partial<PaperReadinessConfig>;
  tickFn?: SchedulerTickFn;
  market?: MarketDataPort;
}

export interface SchedulerSessionResult {
  sessionId: string;
  status: "ticked" | "locked" | "skipped" | "error" | "stale" | "failed";
  candlesProcessed?: number;
  skippedDuplicate?: boolean;
  error?: string;
  readinessStatus?: string | null;
  stale?: boolean;
}

export interface SchedulerRunResult {
  engineVersion: string;
  processed: number;
  results: SchedulerSessionResult[];
  notice: string;
  safety: ReturnType<typeof getTradingSafetyState>;
}

export async function runScheduledPaperTicks(
  sessionDb: PaperForwardPersistence,
  execDb: PaperExecutionPersistence,
  ops: PaperOpsPersistence,
  input: SchedulerRunInput = {}
): Promise<SchedulerRunResult> {
  const cfg = getPaperReadinessConfig(input.config);
  const now = input.now ?? new Date();
  const actor = input.actor || "paper_forward_scheduler";
  const tickFn = input.tickFn ?? tickPaperSession;
  const running = await ops.listRunningPaperForwardSessions(
    cfg.maxSessionsPerSchedulerRun
  );

  const results: SchedulerSessionResult[] = [];

  for (const raw of running) {
    const sessionId = String(raw.id);
    let session: PaperForwardSession;
    try {
      session = await getPaperSession(sessionDb, sessionId);
    } catch (err) {
      results.push({
        sessionId,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (session.lifecycle_status !== "RUNNING") {
      results.push({ sessionId, status: "skipped" });
      continue;
    }

    let stale = false;
    if (isSessionStale(session, now.getTime(), cfg.staleAfterHours)) {
      await markSessionStale(ops, session);
      stale = true;
    }

    const token = randomUUID();
    const locked = await acquireTickLock(
      ops,
      sessionId,
      token,
      cfg.lockLeaseMs
    );
    if (!locked) {
      results.push({ sessionId, status: "locked", stale });
      continue;
    }

    await insertPaperOpsEvent(ops, {
      session_id: sessionId,
      event_type: "TICK_LOCK_ACQUIRED",
      actor,
      strategy_id: session.strategy_id,
      strategy_version_id: session.strategy_version_id,
      snapshot_hash: session.snapshot_hash,
      payload: { token, leaseMs: cfg.lockLeaseMs },
    });

    try {
      const tickResult = await tickFn(
        sessionDb,
        execDb,
        {
          sessionId,
          actor,
          now,
        },
        input.market
      );
      const afterTick = await getPaperSession(sessionDb, sessionId);
      await recordTickSuccess(ops, afterTick, tickResult.candlesProcessed);
      const evaluated = await evaluateAndPersistPaperSession(
        sessionDb,
        ops,
        sessionId,
        now
      );
      results.push({
        sessionId,
        status:
          evaluated.session.lifecycle_status === "FAILED" ? "failed" : "ticked",
        candlesProcessed: tickResult.candlesProcessed,
        skippedDuplicate: tickResult.skippedDuplicate,
        readinessStatus: evaluated.readiness.status,
        stale,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = await recordTickFailure(
        ops,
        sessionDb,
        await getPaperSession(sessionDb, sessionId).catch(() => session),
        message,
        input.config
      );
      results.push({
        sessionId,
        status: failed.lifecycle_status === "FAILED" ? "failed" : "error",
        error: message,
      });
    } finally {
      await releaseTickLock(ops, sessionId, token);
      await insertPaperOpsEvent(ops, {
        session_id: sessionId,
        event_type: "TICK_LOCK_RELEASED",
        actor,
        strategy_id: session.strategy_id,
        strategy_version_id: session.strategy_version_id,
        snapshot_hash: session.snapshot_hash,
        payload: { token },
      });
    }
  }

  return {
    engineVersion: PAPER_FORWARD_OPS_ENGINE_VERSION,
    processed: results.length,
    results,
    notice: PAPER_SIMULATED_NOTICE,
    safety: getTradingSafetyState(),
  };
}
