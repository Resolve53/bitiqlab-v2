/**
 * Adapter: DatabaseService → PaperForwardPersistence + PaperExecutionPersistence
 */

import type { DatabaseService } from "@/lib/db";
import type { PaperForwardPersistence } from "./session-service";
import type { PaperExecutionPersistence } from "./execution-persistence";
import type { PaperOpsPersistence } from "./ops-persistence";
import { PAPER_FORWARD_OPS_ENGINE_VERSION } from "./readiness-config";

export function asPaperForwardPersistence(
  db: DatabaseService
): PaperForwardPersistence {
  return {
    getStrategyVersionById: (id) => db.getStrategyVersionById(id),
    getStrategyValidationById: (id) => db.getStrategyValidationById(id),
    getResearchRunById: (id) => db.getResearchRunById(id),
    getStrategy: (id) => db.getStrategy(id),
    createPaperForwardSession: (row) => db.createPaperForwardSession(row),
    getPaperForwardSession: (id) => db.getPaperForwardSession(id),
    updatePaperForwardLifecycle: (id, updates) =>
      db.updatePaperForwardLifecycle(id, updates),
    createStrategyAuditLog: (log) => db.createStrategyAuditLog(log),
    insertPaperForwardOpsEvent: (row) =>
      db.insertPaperForwardOpsEvent({
        ...row,
        engine_version: row.engine_version || PAPER_FORWARD_OPS_ENGINE_VERSION,
      }),
  };
}

export function asPaperExecutionPersistence(
  db: DatabaseService
): PaperExecutionPersistence {
  return {
    insertPaperForwardEvent: (row) =>
      db.insertPaperForwardEvent(row as unknown as Record<string, unknown>),
    insertPaperForwardTrade: (row) =>
      db.insertPaperForwardTrade(row as unknown as Record<string, unknown>),
    updatePaperForwardTrade: (sessionId, entryCandleTs, updates) =>
      db.updatePaperForwardTrade(sessionId, entryCandleTs, updates),
    upsertPaperForwardPosition: (row) =>
      db.upsertPaperForwardPosition(row as unknown as Record<string, unknown>),
    deletePaperForwardPosition: (sessionId) =>
      db.deletePaperForwardPosition(sessionId),
    updatePaperForwardExecution: (sessionId, updates) =>
      db.updatePaperForwardExecution(
        sessionId,
        updates as unknown as Record<string, unknown>
      ),
    listPaperForwardEvents: (sessionId, limit) =>
      db.listPaperForwardEvents(sessionId, limit),
    listPaperForwardTrades: (sessionId) => db.listPaperForwardTrades(sessionId),
    getPaperForwardPosition: (sessionId) =>
      db.getPaperForwardPosition(sessionId),
  };
}

export function asPaperOpsPersistence(db: DatabaseService): PaperOpsPersistence {
  return {
    getPaperForwardSession: (id) => db.getPaperForwardSession(id),
    updatePaperForwardLifecycle: (id, updates) =>
      db.updatePaperForwardLifecycle(id, updates),
    updatePaperForwardExecution: (id, updates) =>
      db.updatePaperForwardExecution(id, updates),
    listPaperForwardTrades: (sessionId) => db.listPaperForwardTrades(sessionId),
    listPaperForwardEvents: (sessionId, limit) =>
      db.listPaperForwardEvents(sessionId, limit),
    countPaperForwardCandleEvents: (sessionId) =>
      db.countPaperForwardCandleEvents(sessionId),
    listRunningPaperForwardSessions: (limit) =>
      db.listRunningPaperForwardSessions(limit),
    acquirePaperForwardTickLock: (sessionId, token, leaseMs) =>
      db.acquirePaperForwardTickLock(sessionId, token, leaseMs),
    releasePaperForwardTickLock: (sessionId, token) =>
      db.releasePaperForwardTickLock(sessionId, token),
    insertPaperForwardOpsEvent: (row) =>
      db.insertPaperForwardOpsEvent(row as unknown as Record<string, unknown>),
    insertPaperForwardEvaluation: (row) =>
      db.insertPaperForwardEvaluation({
        session_id: row.session_id,
        strategy_version_id: row.strategy_version_id,
        snapshot_hash: row.snapshot_hash,
        evaluation: row.evaluation,
        engine_version: row.engine_version,
      }),
    getLatestPaperForwardEvaluation: async (sessionId) => {
      const row = await db.getLatestPaperForwardEvaluation(sessionId);
      if (!row?.id) return null;
      return {
        id: String(row.id),
        evaluation: row.evaluation,
      };
    },
    insertPaperForwardReadiness: (row) =>
      db.insertPaperForwardReadiness(row as unknown as Record<string, unknown>),
    getLatestPaperForwardReadiness: async (sessionId) => {
      const row = await db.getLatestPaperForwardReadiness(sessionId);
      if (!row?.id) return null;
      return {
        id: String(row.id),
        decision: {
          status: row.status,
          reasons: row.reasons,
          checks: row.checks,
          config: row.config,
          evaluationSource: "paper_forward_simulated",
          historicalSourceExcluded: true as const,
        },
      };
    },
    insertPaperForwardReview: (row) =>
      db.insertPaperForwardReview(row as unknown as Record<string, unknown>),
    listPaperForwardReviews: (sessionId) =>
      db.listPaperForwardReviews(sessionId),
    listPaperForwardOpsEvents: (sessionId, limit) =>
      db.listPaperForwardOpsEvents(sessionId, limit),
    getStrategyValidationById: (id) => db.getStrategyValidationById(id),
    getStrategyVersionById: (id) => db.getStrategyVersionById(id),
    markStrategyVersionLivePhaseEligible: (versionId, actor, notes) =>
      db.markStrategyVersionLivePhaseEligible(versionId, actor, notes),
    createStrategyAuditLog: (log) => db.createStrategyAuditLog(log),
  };
}
