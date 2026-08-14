/**
 * POST /api/tradingview/pine
 * Generate Pine from an immutable strategy version. Does not deploy. No execution.
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
  CandidateValidationError,
  generatePineFromRequest,
  PineAuthorityError,
} from "@/tradingview-pipeline";
import { Phase3PersistenceError } from "@/research-engine/persistence-errors";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const body = req.body || {};
  try {
    const db = getDB();
    const pine = await generatePineFromRequest(
      { getStrategyVersionById: (id) => db.getStrategyVersionById(id) },
      {
        strategy_id: body.strategy_id || body.strategyId,
        strategy_version_id: body.strategy_version_id || body.strategyVersionId,
        snapshot_hash: body.snapshot_hash || body.snapshotHash,
        symbol: body.symbol,
        timeframe: body.timeframe,
      }
    );
    return sendSuccess(res, pine, 200, req);
  } catch (error) {
    if (error instanceof PineAuthorityError || error instanceof CandidateValidationError) {
      return sendError(res, error.message, 400, req);
    }
    if (error instanceof Phase3PersistenceError) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
