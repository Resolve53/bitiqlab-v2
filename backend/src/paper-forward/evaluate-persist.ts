/**
 * Persist paper-forward evaluation + deterministic readiness from simulated trades only.
 */

import { PAPER_FORWARD_OPS_ENGINE_VERSION } from "./readiness-config";
import { evaluatePaperForward } from "./forward-evaluation";
import {
  evaluatePaperReadiness,
  type PaperReadinessDecision,
} from "./readiness-gate";
import { verifyImmutableSnapshot } from "./snapshot";
import { getPaperSession, type PaperForwardPersistence } from "./session-service";
import { insertPaperOpsEvent } from "./session-ops";
import type { PaperOpsPersistence } from "./ops-persistence";
import type { PaperForwardEvaluation } from "./forward-evaluation";
import type { PaperForwardSession, ValidationGateStatus } from "./types";

export interface EvaluatePersistResult {
  session: PaperForwardSession;
  evaluation: PaperForwardEvaluation;
  readiness: PaperReadinessDecision;
  snapshotOk: boolean;
}

function asGateStatus(raw: unknown): ValidationGateStatus | null {
  if (raw === "pass" || raw === "conditional" || raw === "fail") return raw;
  return null;
}

export async function evaluateAndPersistPaperSession(
  sessionDb: PaperForwardPersistence,
  ops: PaperOpsPersistence,
  sessionId: string,
  now?: Date
): Promise<EvaluatePersistResult> {
  const session = await getPaperSession(sessionDb, sessionId);
  const trades = await ops.listPaperForwardTrades(sessionId);
  let candles = session.candles_processed ?? 0;
  if (!candles) {
    candles = await ops.countPaperForwardCandleEvents(sessionId).catch(() => 0);
  }

  const evaluation = evaluatePaperForward({
    session,
    trades,
    closedCandlesProcessed: candles,
    now,
  });

  let snapshotOk = true;
  let snapshotError: string | undefined;
  try {
    verifyImmutableSnapshot(session);
  } catch (err) {
    snapshotOk = false;
    snapshotError = err instanceof Error ? err.message : String(err);
  }

  const validation = session.validation_id
    ? await ops.getStrategyValidationById(session.validation_id)
    : null;
  const validationStatus = asGateStatus(
    validation?.status ?? validation?.gate?.status
  );

  const readiness = evaluatePaperReadiness({
    session,
    evaluation,
    snapshotOk,
    snapshotError,
    validationStatus,
    validationId: session.validation_id,
    tickErrorCount: session.tick_error_count ?? 0,
  });

  await ops.insertPaperForwardEvaluation({
    session_id: session.id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    evaluation,
    engine_version: PAPER_FORWARD_OPS_ENGINE_VERSION,
  });

  await ops.insertPaperForwardReadiness({
    session_id: session.id,
    strategy_id: session.strategy_id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    validation_id: session.validation_id,
    status: readiness.status,
    reasons: readiness.reasons,
    checks: readiness.checks,
    config: readiness.config,
    engine_version: PAPER_FORWARD_OPS_ENGINE_VERSION,
  });

  const updated = await ops.updatePaperForwardExecution(session.id, {
    readiness_status: readiness.status,
    readiness_reasons: readiness.reasons,
    last_evaluated_at: evaluation.evaluatedAt,
  });

  await insertPaperOpsEvent(ops, {
    session_id: session.id,
    event_type: "EVALUATED",
    strategy_id: session.strategy_id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    payload: {
      closedTrades: evaluation.closedTrades,
      expectancy: evaluation.expectancy,
      profitFactor: evaluation.profitFactor,
      maxDrawdown: evaluation.maxDrawdown,
    },
  });
  await insertPaperOpsEvent(ops, {
    session_id: session.id,
    event_type: "READINESS_DECIDED",
    strategy_id: session.strategy_id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    payload: { status: readiness.status, reasons: readiness.reasons },
  });

  const next = (updated
    ? { ...session, ...updated }
    : {
        ...session,
        readiness_status: readiness.status,
        readiness_reasons: readiness.reasons,
        last_evaluated_at: evaluation.evaluatedAt,
      }) as PaperForwardSession;

  return { session: next, evaluation, readiness, snapshotOk };
}
