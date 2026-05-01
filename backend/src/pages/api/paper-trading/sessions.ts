/**
 * GET /api/paper-trading/sessions
 * List paper trading sessions by strategy_id
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { strategy_id, limit = 10 } = req.query;

  if (!strategy_id || typeof strategy_id !== "string") {
    return sendError(res, "Missing or invalid strategy_id", 400, req);
  }

  try {
    const db = getDB();
    const limitNum = Math.min(parseInt(limit as string) || 10, 100);

    // Get trading sessions for this strategy
    const allSessions = await db.listTradingSessions({
      strategy_id,
    });

    // Limit results
    const sessions = allSessions.slice(0, limitNum);

    return sendSuccess(
      res,
      {
        sessions: sessions.map((s: any) => ({
          session_id: s.id,
          strategy_id: s.strategy_id,
          session_name: s.session_name,
          initial_balance: s.initial_balance,
          current_balance: s.current_balance,
          total_pnl: s.total_pnl,
          created_at: s.created_at,
          is_testnet: s.is_testnet,
          exchange: s.exchange,
        })),
        count: sessions.length,
      },
      200,
      req
    );
  } catch (error) {
    console.error("[SESSIONS] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to fetch sessions",
      500,
      req
    );
  }
});
