/**
 * POST /api/strategies/[id]/promote-to-bitiq
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { promoteStrategyToBitiq } from "@/lib/bitiq-promotion-service";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { id } = req.query as { id: string };
  const { session_id, promoted_by, notes, force } = req.body || {};

  try {
    const result = await promoteStrategyToBitiq({
      strategyId: id,
      sessionId: session_id,
      promotedBy: promoted_by,
      notes,
      force: Boolean(force),
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
        data: { readiness: result.readiness },
        timestamp: new Date().toISOString(),
      });
    }

    return sendSuccess(res, result, 200, req);
  } catch (error) {
    return sendError(
      res,
      error instanceof Error ? error.message : "Promotion failed",
      500,
      req
    );
  }
});
