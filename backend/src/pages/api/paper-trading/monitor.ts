/**
 * POST /api/paper-trading/monitor - Monitor and auto-execute trading signals
 * Evaluates strategy conditions and automatically places trades
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";
import { getEvaluator } from "@/lib/strategy-evaluator";
import { getWebSocketManager } from "@/lib/binance-websocket";

interface MonitorRequest {
  session_id: string;
  auto_trade?: boolean;
  check_interval?: number;
}

interface MonitorResponse {
  session_id: string;
  last_signal?: {
    signal: string;
    confidence: number;
    symbol: string;
    price: number;
    timestamp: string;
  };
  position_status?: {
    has_position: boolean;
    symbol: string;
    entry_price: number;
    quantity: number;
    unrealized_pl: number;
  };
  session_stats: {
    current_balance: number;
    total_pnl: number;
    total_trades: number;
    win_rate: number;
  };
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id, auto_trade = true }: MonitorRequest = req.body;

  if (!session_id) {
    return sendError(res, "Missing session_id", 400, req);
  }

  try {
    const db = getDB();
    const tradingClient = getTradingClient(true);
    const evaluator = getEvaluator();
    const wsManager = getWebSocketManager();

    // Get trading session
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Get strategy
    const strategy = await db.getStrategy(session.strategy_id);
    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    // Get recent trades to check position status
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

    const response: MonitorResponse = {
      session_id,
      session_stats: {
        current_balance: session.current_balance,
        total_pnl: session.total_pnl || 0,
        total_trades: trades.length,
        win_rate: 0,
      },
    };

    // Get current price
    const currentPrice = await tradingClient.getPrice(strategy.symbol);

    // Evaluate strategy conditions
    let shouldTrade = false;
    let tradeSignal: "BUY" | "SELL" = "BUY";

    if (!hasOpenPosition) {
      // Check entry conditions with enhanced logic
      let entrySignal;

      // If strategy has proper entry rules, use evaluator
      if (strategy.entry_rules && Object.keys(strategy.entry_rules).length > 0) {
        entrySignal = await evaluator.evaluateEntry(
          strategy.symbol,
          strategy.timeframe,
          strategy.entry_rules || {},
          currentPrice
        );
      } else {
        // Fallback: simpler entry logic for strategies without detailed rules
        entrySignal = {
          signal: "BUY",
          confidence: 65,
          reason: "Strategy ready for entry (simplified mode)",
          indicators: {},
        };
      }

      if (
        auto_trade &&
        entrySignal.signal === "BUY" &&
        entrySignal.confidence > 50
      ) {
        shouldTrade = true;
        tradeSignal = "BUY";

        response.last_signal = {
          signal: entrySignal.signal,
          confidence: entrySignal.confidence,
          symbol: strategy.symbol,
          price: currentPrice,
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      // Check exit conditions
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

      if (auto_trade && exitSignal.shouldExit) {
        shouldTrade = true;
        tradeSignal = "SELL";

        response.last_signal = {
          signal: "SELL",
          confidence: 100,
          symbol: strategy.symbol,
          price: currentPrice,
          timestamp: new Date().toISOString(),
        };
      }

      // Update position status
      response.position_status = {
        has_position: true,
        symbol: strategy.symbol,
        entry_price: lastBuyPrice,
        quantity: lastBuyQuantity,
        unrealized_pl: (currentPrice - lastBuyPrice) * lastBuyQuantity,
      };
    }

    // Execute trade if conditions are met
    if (shouldTrade) {
      try {
        // Calculate position size based on 2% risk
        const riskAmount = session.initial_balance * 0.02;
        let quantity = 0;

        if (tradeSignal === "BUY") {
          quantity = riskAmount / currentPrice;
        } else {
          quantity = lastBuyQuantity;
        }

        // Round quantity
        quantity = Math.round(quantity * 10000) / 10000;

        // Place market order
        const order = await tradingClient.marketOrder(
          strategy.symbol,
          tradeSignal,
          quantity
        );

        // Log trade
        await db.createPaperTrade({
          session_id,
          strategy_id: session.strategy_id,
          symbol: strategy.symbol,
          side: tradeSignal,
          entry_price: currentPrice,
          quantity,
          status: order.status,
          reason_entry: response.last_signal?.signal
            ? `Auto-executed ${response.last_signal.signal} signal`
            : "Auto-executed trade",
        });

        // Update session balance
        let totalProfit = 0;
        for (const trade of trades) {
          if (
            trade.side === "BUY" &&
            tradeSignal === "SELL"
          ) {
            totalProfit += (currentPrice - trade.entry_price) * trade.quantity;
          }
        }

        if (tradeSignal === "SELL") {
          await db.updateTradingSession(session_id, {
            current_balance: session.initial_balance + totalProfit,
            total_pnl: totalProfit,
          });
        }
      } catch (tradeError) {
        console.error("Error executing trade:", tradeError);
        return sendError(
          res,
          `Trade execution error: ${tradeError instanceof Error ? tradeError.message : "Unknown error"}`,
          500,
          req
        );
      }
    }

    // Subscribe to price updates if not already subscribed
    wsManager.subscribe(strategy.symbol, (tick) => {
      // Price updates will be cached in the WebSocket manager
      console.log(`${strategy.symbol}: ${tick.price}`);
    });

    return sendSuccess(res, response, 200, req);
  } catch (error) {
    console.error("Monitor error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to monitor session",
      500,
      req
    );
  }
});
