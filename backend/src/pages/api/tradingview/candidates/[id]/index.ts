/**
 * GET /api/tradingview/candidates/:id
 * Candidate + latest intelligence snapshot (Stage 2).
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

export function publicCandidate(row: Record<string, unknown>) {
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    strategy_id: row.strategy_id,
    strategy_version_id: row.strategy_version_id,
    snapshot_hash: row.snapshot_hash,
    symbol: row.symbol,
    timeframe: row.timeframe,
    direction: row.direction,
    signal_candle_ts: row.signal_candle_ts,
    entry: row.entry,
    stop_loss: row.stop_loss,
    take_profits: row.take_profits,
    pine_version: row.pine_version,
    source: row.source,
    status: row.status,
    received_at: row.received_at,
    created_at: row.created_at,
  };
}

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
    const row = byId || (await db.getTradingViewCandidateByCandidateId(id));
    if (!row) return sendError(res, "Candidate not found", 404, req);

    let latest = null;
    try {
      latest = await db.getLatestIntelligenceSnapshot(row.candidate_id);
    } catch (err) {
      if (!(err instanceof Phase4PersistenceError)) throw err;
    }

    return sendSuccess(
      res,
      {
        ...publicCandidate(row as Record<string, unknown>),
        enrichment_status: latest?.status ?? null,
        latest_intelligence: latest
          ? {
              enrichment_version: latest.enrichment_version,
              status: latest.status,
              quality_score: latest.quality_score,
              score_breakdown: latest.score_breakdown,
              freshness: latest.freshness,
              provider_status: latest.provider_status,
              fetched_at: latest.fetched_at,
              intelligence: latest.intelligence,
            }
          : null,
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
