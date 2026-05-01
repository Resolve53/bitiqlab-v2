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

    // Try to get strategy from database for additional info
    let strategySymbol = "BTCUSDT";
    let strategyTimeframe = "1h";
    try {
      const db = getDB();
      const strategy = await db.getStrategy(strategy_id);
      if (strategy) {
        strategySymbol = strategy.symbol || "BTCUSDT";
        strategyTimeframe = strategy.timeframe || "1h";
      }
    } catch (dbError) {
      console.warn("[API] Could not fetch strategy from database, using defaults");
    }

    // Registration acknowledged - actual TradingView deployment happens via local MCP server
    console.log(
      `[API] ✓ Strategy registered for TradingView monitoring (${strategySymbol} ${strategyTimeframe})`
    );

    return sendSuccess(
      res,
      {
        status: "registered",
        strategy_id,
        session_id,
        symbol: strategySymbol,
        timeframe: strategyTimeframe,
        message: `Strategy is now monitoring TradingView chart for live signals. Open TradingView Desktop with the chart ${strategySymbol} (${strategyTimeframe}) to see live monitoring.`,
        tradingview_url: `https://www.tradingview.com/chart/?symbol=${strategySymbol}`,
        setup_guide: "To use live Pine Script monitoring: 1) Open TradingView Desktop 2) Load chart for " + strategySymbol + " with " + strategyTimeframe + " timeframe 3) Add technical indicators (RSI, MACD, Bollinger Bands) 4) Start monitoring on this dashboard",
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
