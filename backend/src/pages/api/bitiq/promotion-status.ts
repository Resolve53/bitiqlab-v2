/**
 * GET /api/bitiq/promotion-status?strategy_id=
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { evaluatePromotionReadiness } from "@/lib/bitiq-promotion-service";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const strategyId = req.query.strategy_id as string;
  const sessionId = req.query.session_id as string | undefined;

  if (!strategyId) {
    return sendError(res, "Missing strategy_id query parameter", 400, req);
  }

  try {
    const db = getDB();
    const strategy = await db.getStrategy(strategyId);
    const readiness = await evaluatePromotionReadiness(strategyId, sessionId);
    const promotions = await db.listBitiqPromotions(strategyId);

    return sendSuccess(
      res,
      {
        strategy_id: strategyId,
        deployed_to_bitiq: strategy.deployed_to_bitiq,
        deployed_at: strategy.deployed_at,
        status: strategy.status,
        readiness,
        promotions,
        webhook_configured: Boolean(process.env.BITIQ_WEBHOOK_URL),
      },
      200,
      req
    );
  } catch (error) {
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to load promotion status",
      500,
      req
    );
  }
});
