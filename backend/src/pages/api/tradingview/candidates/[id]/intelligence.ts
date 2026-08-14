/**
 * GET /api/tradingview/candidates/:id/intelligence
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import { Phase4PersistenceError } from "@/paper-forward";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const id = String(req.query.id || "");
  if (!id) return sendError(res, "Missing id", 400, req);

  try {
    const db = getDB();
    const byId = await db.getTradingViewCandidateById(id);
    const candidate = byId || (await db.getTradingViewCandidateByCandidateId(id));
    if (!candidate) return sendError(res, "Candidate not found", 404, req);

    const snapshots = await db.listIntelligenceSnapshots(candidate.candidate_id);
    return sendSuccess(
      res,
      {
        candidate_id: candidate.candidate_id,
        candidate_status: candidate.status,
        latest: snapshots[0] || null,
        history: snapshots.map((s) => ({
          enrichment_version: s.enrichment_version,
          status: s.status,
          quality_score: s.quality_score,
          fetched_at: s.fetched_at,
          freshness: s.freshness,
          provider_status: s.provider_status,
        })),
      },
      200,
      req
    );
  } catch (error) {
    if (error instanceof Phase4PersistenceError) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
