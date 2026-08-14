/**
 * Adapter: DatabaseService → PaperForwardPersistence + PaperExecutionPersistence
 */

import type { DatabaseService } from "@/lib/db";
import type { PaperForwardPersistence } from "./session-service";
import type { PaperExecutionPersistence } from "./execution-persistence";

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
