/**
 * POST /api/strategies/deploy-rsi-macd
 * Deploy the RSI+MACD momentum strategy to TradingView and register in database
 *
 * Request body:
 * {
 *   name?: string;
 *   symbol?: string;
 *   timeframe?: string;
 *   market_type?: "spot" | "futures";
 * }
 *
 * Response:
 * {
 *   status: "success";
 *   strategy_id: string;
 *   name: string;
 *   message: string;
 * }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getDB } from "@/lib/db";
import { getStrategyManager } from "@/lib/tradingview-strategy-manager";

interface DeployRSIMACDRequest {
  name?: string;
  symbol?: string;
  timeframe?: string;
  market_type?: "spot" | "futures";
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const {
    name = "Bitiq RSI+MACD Momentum",
    symbol = "BTCUSDT",
    timeframe = "1h",
    market_type = "spot",
  }: DeployRSIMACDRequest = req.body;

  try {
    const db = getDB();
    const tvManager = getStrategyManager();

    console.log(`[DEPLOY-RSI-MACD] Deploying strategy: ${name}`);

    // Create strategy in database
    const strategy = await db.createStrategy({
      name,
      description: "RSI Oversold + MACD Bullish Crossover momentum strategy",
      symbol,
      timeframe,
      market_type,
      entry_rules: {
        indicators: ["rsi", "macd"],
        conditions: [
          "RSI < 30 (oversold)",
          "MACD bullish crossover",
        ],
      },
      exit_rules: {
        stop_loss_percent: 2,
        take_profit_percent: 5,
      },
    });

    console.log(`[DEPLOY-RSI-MACD] Strategy created with ID: ${strategy.id}`);

    // Deploy to TradingView asynchronously (non-blocking)
    tvManager
      .deployStrategy(name, symbol, timeframe, {
        rsi_length: 14,
        rsi_oversold: 30,
        rsi_overbought: 70,
        macd_fast: 12,
        macd_slow: 26,
        macd_signal: 9,
        stop_loss_percent: 2,
        take_profit_percent: 5,
      })
      .then(() => {
        console.log(`[DEPLOY-RSI-MACD] ✓ Strategy deployed to TradingView`);
      })
      .catch((error) => {
        console.warn(`[DEPLOY-RSI-MACD] TradingView deployment warning:`, error);
        // Don't fail if TradingView deployment has issues
      });

    return sendSuccess(
      res,
      {
        status: "success",
        strategy_id: strategy.id,
        name: strategy.name,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        message: `Strategy "${name}" created and deployment started`,
      },
      201,
      req
    );
  } catch (error) {
    console.error("[DEPLOY-RSI-MACD] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to deploy strategy",
      500,
      req
    );
  }
});
