/**
 * POST /api/paper-trading/register-tradingview
 * Register a strategy with TradingView MCP for live monitoring
 *
 * Links a paper trading session to TradingView for automatic signal generation
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface RegisterRequest {
  strategy_id: string;
  session_id: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { strategy_id, session_id }: RegisterRequest = req.body;

  if (!strategy_id || !session_id) {
    return sendError(
      res,
      "Missing required fields: strategy_id, session_id",
      400,
      req
    );
  }

  try {
    console.log(
      `[API] Registering strategy ${strategy_id} with TradingView for session ${session_id}`
    );

    const db = getDB();

    // Verify strategy exists
    const strategy = await db.getStrategy(strategy_id);
    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    // Verify session exists
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Link strategy to session for webhook monitoring
    await db.updateTradingSession(session_id, {
      strategy_id: strategy_id,
      status: "monitoring",
    });

    console.log(
      `[API] ✓ Strategy registered and linked to session for TradingView monitoring`
    );

    return sendSuccess(
      res,
      {
        status: "registered",
        strategy_id,
        session_id,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        message: `Strategy "${strategy.name}" is now monitoring TradingView chart for live signals`,
      },
      200,
      req
    );
  } catch (error) {
    console.error("[API] ✗ Registration error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to register with TradingView",
      500,
      req
    );
  }
});
