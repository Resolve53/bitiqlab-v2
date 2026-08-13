/**
 * POST /api/analysis/strategy-decision
 * Phase 4A: archive still allowed; promote/auto-force/Bitiq disabled.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { asyncHandler, sendSuccess, sendError } from "@/lib/utils";
import { evaluatePromotionReadiness } from "@/lib/bitiq-promotion-service";
import {
  PROMOTION_AUTO_DISABLED,
  PROMOTION_FORCE_DISABLED,
} from "@/lib/trading-safety";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { strategyId, decision, reason, session_id } = req.body;

  if (!strategyId || !decision || !["promote", "archive"].includes(decision)) {
    return sendError(
      res,
      "Missing or invalid fields: strategyId, decision (promote|archive)",
      400,
      req
    );
  }

  try {
    const db = getDB();
    await db.getStrategy(strategyId);
    const readiness = await evaluatePromotionReadiness(strategyId, session_id);

    if (decision === "archive") {
      await db.updateStrategy(strategyId, { status: "failed" });
      return sendSuccess(
        res,
        {
          strategyId,
          decision,
          timestamp: new Date(),
          reason: reason || "No reason provided",
          meetsPromotionCriteria: readiness.ready,
          readiness,
          message: `Strategy archived. Reason: ${reason || "none"}`,
        },
        200,
        req
      );
    }

    // Phase 4A: no auto-approve, no auto-force, no Bitiq deploy.
    return sendError(
      res,
      `${PROMOTION_AUTO_DISABLED} ${PROMOTION_FORCE_DISABLED}`,
      403,
      req
    );
  } catch (error) {
    console.error("Error making strategy decision:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Decision failed",
      500,
      req
    );
  }
});
