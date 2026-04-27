/**
 * POST /api/paper-trading/monitor - Monitor and auto-execute trading signals
 * Evaluates strategy conditions and automatically places trades
 *
 * Integrates with:
 * - TradingView MCP for real-time prices and indicators
 * - Binance testnet for order execution
 * - Strategy evaluator for signal generation
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";
import { getEvaluator } from "@/lib/strategy-evaluator";
import { getTradingViewMCP } from "@/lib/tradingview-mcp-client";

interface MonitorRequest {
  session_id: string;
  auto_trade?: boolean;
  use_mcp?: boolean;
}

interface MonitorResponse {
  status: string;
  session_id: string;
  message: string;
  price_source: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id, auto_trade = true, use_mcp = true }: MonitorRequest = req.body;

  if (!session_id) {
    return sendError(res, "Missing session_id", 400, req);
  }

  try {
    console.log(`[MONITOR] Starting monitoring for session: ${session_id}`);

    const db = getDB();
    const tradingClient = getTradingClient(true);
    const evaluator = getEvaluator();
    const tvMCP = getTradingViewMCP();

    // Get session and strategy
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    const strategy = await db.getStrategy(session.strategy_id);
    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    console.log(
      `[MONITOR] Strategy: ${strategy.name} (${strategy.symbol} ${strategy.timeframe})`
    );

    // Get current price
    let currentPrice = 0;
    let priceSource = "unknown";

    if (use_mcp) {
      try {
        const tvData = await tvMCP.getPrice(strategy.symbol);
        currentPrice = tvData.price;
        priceSource = "TradingView MCP";
        console.log(
          `[MONITOR] Price from TradingView MCP: ${strategy.symbol} = $${currentPrice}`
        );
      } catch (mcpError) {
        console.warn(`[MONITOR] TradingView MCP error, using Binance:`, mcpError);
        currentPrice = await tradingClient.getPrice(strategy.symbol);
        priceSource = "Binance";
      }
    } else {
      currentPrice = await tradingClient.getPrice(strategy.symbol);
      priceSource = "Binance";
    }

    // Check position status
    const trades = await db.listPaperTrades(session_id);
    let hasOpenPosition = false;
    let lastBuyPrice = 0;
    let lastBuyQuantity = 0;

    for (const trade of trades) {
      if (trade.side === "BUY") {
        hasOpenPosition = true;
        lastBuyPrice = trade.entry_price;
        lastBuyQuantity = trade.quantity;
      } else if (trade.side === "SELL") {
        hasOpenPosition = false;
      }
    }

    // Evaluate entry/exit
    let shouldTrade = false;
    let tradeSignal: "BUY" | "SELL" = "BUY";
    let signalReason = "";

    if (!hasOpenPosition) {
      // Entry signal
      const entrySignal = await evaluator.evaluateEntry(
        strategy.symbol,
        strategy.timeframe,
        strategy.entry_rules || { indicators: ["RSI", "MACD"] },
        currentPrice
      );

      console.log(
        `[MONITOR] Entry Signal: ${entrySignal.signal}, Confidence: ${entrySignal.confidence}%, Reason: ${entrySignal.reason}`
      );

      if (auto_trade && entrySignal.signal === "BUY" && entrySignal.confidence > 50) {
        shouldTrade = true;
        tradeSignal = "BUY";
        signalReason = entrySignal.reason;
        console.log(`[MONITOR] ✓ BUY signal triggered!`);
      }
    } else {
      // Exit signal
      const exitRules = strategy.exit_rules || {
        stop_loss_percent: 2,
        take_profit_percent: 5,
      };

      const exitSignal = await evaluator.evaluateExit(
        strategy.symbol,
        lastBuyPrice,
        currentPrice,
        exitRules
      );

      console.log(`[MONITOR] Exit Signal: ${exitSignal.shouldExit ? "SELL" : "HOLD"}`);

      if (auto_trade && exitSignal.shouldExit) {
        shouldTrade = true;
        tradeSignal = "SELL";
        signalReason = exitSignal.reason;
        console.log(`[MONITOR] ✓ SELL signal triggered!`);
      }
    }

    // Execute trade if signal
    if (shouldTrade) {
      try {
        console.log(`[MONITOR] Executing ${tradeSignal} trade...`);

        const riskAmount = session.initial_balance * 0.02;
        let quantity = 0;

        if (tradeSignal === "BUY") {
          quantity = riskAmount / currentPrice;
        } else {
          quantity = lastBuyQuantity;
        }

        quantity = Math.round(quantity * 10000) / 10000;

        console.log(
          `[MONITOR] Order: ${tradeSignal} ${quantity} ${strategy.symbol} @ $${currentPrice}`
        );

        const order = await tradingClient.marketOrder(strategy.symbol, tradeSignal, quantity);

        console.log(`[MONITOR] ✓ Order executed! Order ID: ${order.orderId}`);

        // Log trade
        await db.createPaperTrade({
          session_id,
          strategy_id: session.strategy_id,
          symbol: strategy.symbol,
          side: tradeSignal,
          entry_price: currentPrice,
          quantity,
          status: order.status,
          reason_entry: signalReason,
        });

        console.log(`[MONITOR] ✓ Trade recorded in database`);

        // Update P&L if SELL
        if (tradeSignal === "SELL") {
          const updatedTrades = await db.listPaperTrades(session_id);
          let totalProfit = 0;

          for (const trade of updatedTrades) {
            if (trade.side === "BUY") {
              const sellTrade = updatedTrades.find(
                (t) => t.side === "SELL" && t.symbol === trade.symbol
              );
              if (sellTrade) {
                totalProfit += (currentPrice - trade.entry_price) * trade.quantity;
              }
            }
          }

          await db.updateTradingSession(session_id, {
            current_balance: session.initial_balance + totalProfit,
            total_pnl: totalProfit,
          });

          console.log(`[MONITOR] ✓ Session balance updated`);
        }
      } catch (tradeError) {
        console.error(`[MONITOR] ✗ Trade execution failed:`, tradeError);
        return sendError(
          res,
          `Trade execution error: ${tradeError instanceof Error ? tradeError.message : "Unknown error"}`,
          500,
          req
        );
      }
    } else {
      console.log(`[MONITOR] No trade signal - waiting for next cycle`);
    }

    const response: MonitorResponse = {
      status: "success",
      session_id,
      message: "Monitor cycle completed",
      price_source: priceSource,
    };

    console.log(`[MONITOR] ✓ Monitor cycle complete\n`);

    return sendSuccess(res, response, 200, req);
  } catch (error) {
    console.error("[MONITOR] ✗ Monitor error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to monitor session",
      500,
      req
    );
  }
});
