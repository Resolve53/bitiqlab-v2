/**
 * Adapter: DatabaseService → PaperForwardPersistence
 */

import type { DatabaseService } from "@/lib/db";
import type { PaperForwardPersistence } from "./session-service";

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
