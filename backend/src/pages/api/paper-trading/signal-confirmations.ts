/**
 * GET /api/paper-trading/signal-confirmations?session_id=...
 * Recent pre-execution confirmation results (approved + blocked)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getRecentConfirmations } from "@/lib/signal-confirmation-service";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const sessionId = req.query.session_id as string;
  if (!sessionId) {
    return sendError(res, "Missing session_id query parameter", 400, req);
  }

  const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
  const confirmations = getRecentConfirmations(sessionId, limit);

  return sendSuccess(
    res,
    {
      session_id: sessionId,
      confirmations,
      gate_enabled: process.env.SIGNAL_REQUIRE_CONFIRMATIONS !== "false",
      min_onchain_score: parseInt(process.env.SIGNAL_MIN_ONCHAIN_SCORE || "50", 10),
      calendar_block_hours: parseInt(process.env.SIGNAL_CALENDAR_BLOCK_HOURS || "4", 10),
      require_claude_score: process.env.SIGNAL_REQUIRE_CLAUDE_SCORE !== "false",
      min_claude_score: parseInt(process.env.SIGNAL_MIN_CLAUDE_SCORE || "65", 10),
    },
    200,
    req
  );
});
