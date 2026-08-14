/**
 * POST /api/tradingview/candidates/:id/enrich
 * Stage 2 pre-trade intelligence. No AI decision. No execution.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import {
  EnrichmentError,
  EnrichmentPersistenceError,
  enrichCandidate,
} from "@/candidate-intelligence";
import { Phase3PersistenceError } from "@/research-engine/persistence-errors";
import { Phase4PersistenceError } from "@/paper-forward";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const id = String(req.query.id || "");
  if (!id) return sendError(res, "Missing id", 400, req);

  try {
    const db = getDB();
    const result = await enrichCandidate(
      {
        getStrategyVersionById: (vid) => db.getStrategyVersionById(vid),
        getTradingViewCandidateById: (cid) => db.getTradingViewCandidateById(cid),
        getTradingViewCandidateByCandidateId: (cid) =>
          db.getTradingViewCandidateByCandidateId(cid),
        updateTradingViewCandidateStatus: (cid, status) =>
          db.updateTradingViewCandidateStatus(cid, status),
        nextIntelligenceVersion: (cid) => db.nextIntelligenceVersion(cid),
        insertIntelligenceSnapshot: (row) => db.insertIntelligenceSnapshot(row),
      },
      id
    );

    const http =
      result.status === "READY_FOR_AI_REVIEW"
        ? 200
        : result.status === "ENRICHMENT_FAILED"
          ? 422
          : 200;

    return sendSuccess(
      res,
      {
        ...result,
        executed: false,
        ai_decision: null,
        notice:
          result.status === "READY_FOR_AI_REVIEW"
            ? "Intelligence snapshot stored. Stage 3 AI review is not run in Stage 2."
            : "Enrichment did not reach READY_FOR_AI_REVIEW (stale/missing critical data or provider failure).",
      },
      http,
      req
    );
  } catch (error) {
    if (error instanceof EnrichmentError) {
      return sendError(res, error.message, error.statusCode, req);
    }
    if (
      error instanceof EnrichmentPersistenceError ||
      error instanceof Phase3PersistenceError ||
      error instanceof Phase4PersistenceError
    ) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
