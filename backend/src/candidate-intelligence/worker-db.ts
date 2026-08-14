import type { AuthorityDeps } from "@/tradingview-pipeline/authority";
import type { TradingViewCandidateRow } from "@/tradingview-pipeline/types";
import type { DatabaseService } from "@/lib/db";
import type { WorkerPersistence } from "./worker";

export function workerDepsFromDb(
  db: Pick<
    DatabaseService,
    | "getStrategyVersionById"
    | "getTradingViewCandidateById"
    | "getTradingViewCandidateByCandidateId"
    | "updateTradingViewCandidateStatus"
    | "nextIntelligenceVersion"
    | "insertIntelligenceSnapshot"
    | "claimEnrichmentCandidates"
    | "updateEnrichmentOps"
    | "getLatestIntelligenceSnapshot"
    | "upsertEnrichmentWorkerHeartbeat"
    | "listEnrichmentWorkerHeartbeats"
  >
): AuthorityDeps & WorkerPersistence {
  return {
    getStrategyVersionById: (id) => db.getStrategyVersionById(id),
    getTradingViewCandidateById: (id) => db.getTradingViewCandidateById(id),
    getTradingViewCandidateByCandidateId: (id) =>
      db.getTradingViewCandidateByCandidateId(id),
    updateTradingViewCandidateStatus: (id, status) =>
      db.updateTradingViewCandidateStatus(id, status),
    nextIntelligenceVersion: (id) => db.nextIntelligenceVersion(id),
    insertIntelligenceSnapshot: (row) => db.insertIntelligenceSnapshot(row),
    claimEnrichmentCandidates: async (opts) =>
      (await db.claimEnrichmentCandidates(opts)) as unknown as TradingViewCandidateRow[],
    updateEnrichmentOps: (id, patch) => db.updateEnrichmentOps(id, patch),
    getLatestIntelligenceSnapshot: (id) => db.getLatestIntelligenceSnapshot(id),
    upsertEnrichmentWorkerHeartbeat: (row) => db.upsertEnrichmentWorkerHeartbeat(row),
    listEnrichmentWorkerHeartbeats: () => db.listEnrichmentWorkerHeartbeats(),
  };
}
