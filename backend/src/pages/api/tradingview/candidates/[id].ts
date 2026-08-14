/**
 * GET /api/tradingview/candidates/:id
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
    const row = byId || (await db.getTradingViewCandidateByCandidateId(id));
    if (!row) return sendError(res, "Candidate not found", 404, req);

    return sendSuccess(
      res,
      {
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
