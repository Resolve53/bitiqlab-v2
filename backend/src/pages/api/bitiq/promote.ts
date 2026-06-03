/**
 * POST /api/bitiq/promote — Promote a strategy to the Bitiq live pipeline
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { promoteStrategyToBitiq } from "@/lib/bitiq-promotion-service";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const {
    strategy_id,
    session_id,
    promoted_by,
    notes,
    force,
  } = req.body || {};

  if (!strategy_id) {
    return sendError(res, "Missing strategy_id", 400, req);
  }

  try {
    const result = await promoteStrategyToBitiq({
      strategyId: strategy_id,
      sessionId: session_id,
      promotedBy: promoted_by,
      notes,
      force: Boolean(force),
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
        data: { readiness: result.readiness, details: result.error },
        timestamp: new Date().toISOString(),
      });
    }

    return sendSuccess(res, result, 200, req);
  } catch (error) {
    console.error("[BITIQ PROMOTE]", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Promotion failed",
      500,
      req
    );
  }
});
