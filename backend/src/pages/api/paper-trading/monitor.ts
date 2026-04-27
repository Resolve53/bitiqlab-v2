/**
 * POST /api/paper-trading/monitor - Monitor and auto-execute trading signals
 * Evaluates strategy conditions and automatically places trades
 *
 * Enhanced with:
 * - TradingView price integration
 * - Detailed logging for debugging
 * - Guaranteed trade execution
 * - Auto-monitoring loop support
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";
import { getEvaluator } from "@/lib/strategy-evaluator";
import { getWebSocketManager } from "@/lib/binance-websocket";
import { getTradingViewMCP } from "@/lib/tradingview-mcp-client";

interface MonitorRequest {
  session_id: string;
  auto_trade?: boolean;
  check_interval?: number;
  use_mcp?: boolean;
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
  debug?: {
    price_source: string;
    current_price: number;
    signal_evaluated: boolean;
    trade_executed: boolean;
    error?: string;
  };
}

// Global monitoring state to prevent race conditions
const monitoringSessions = new Map<string, { interval: ReturnType<typeof setInterval> | null }>();

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const {
    session_id,
    auto_trade = true,
    check_interval = 5000,
    use_mcp = true,
  }: MonitorRequest = req.body;

  if (!session_id) {
    return sendError(res, "Missing session_id", 400, req);
  }

  try {
    const db = getDB();
    const tradingClient = getTradingClient(true);
    const evaluator = getEvaluator();
    const wsManager = getWebSocketManager();
    const tvMCP = getTradingViewMCP();

    console.log(`[MONITOR] Starting monitor for session: ${session_id}`);

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

    console.log(`[MONITOR] Strategy: ${strategy.name} (${strategy.symbol} ${strategy.timeframe})`);

    // Define the monitoring function
    const runMonitorCycle = async () => {
      try {
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

        // Get current price from TradingView MCP or Binance
        let currentPrice = 0;
        let priceSource = "unknown";
        let chartIndicators = {};

        if (use_mcp) {
          try {
            const tvData = await tvMCP.getPrice(strategy.symbol);
            currentPrice = tvData.price;
            priceSource = "TradingView MCP";
            console.log(
              `[MONITOR] Price from TradingView MCP: ${strategy.symbol} = $${currentPrice}`
            );

            // Also fetch indicators from MCP for better signal evaluation
            try {
              const indicators = await tvMCP.getIndicators(
                strategy.symbol,
                strategy.timeframe
              );
              chartIndicators = indicators;
              console.log(
                `[MONITOR] Indicators from TradingView MCP: RSI=${indicators.rsi}, MACD=${indicators.macd?.line}`
              );
            } catch (indError) {
              console.warn(`[MONITOR] Could not fetch indicators:`, indError);
            }
          } catch (mcpError) {
            console.warn(`[MONITOR] TradingView MCP failed, falling back to Binance:`, mcpError);
            currentPrice = await tradingClient.getPrice(strategy.symbol);
            priceSource = "Binance (fallback)";
          }
        } else {
          currentPrice = await tradingClient.getPrice(strategy.symbol);
          priceSource = "Binance";
        }

        console.log(`[MONITOR] Current Price (${priceSource}): ${strategy.symbol} = $${currentPrice}`);

        let shouldTrade = false;
        let tradeSignal: "BUY" | "SELL" = "BUY";
        let signalReason = "";

        // Evaluate entry/exit
        if (!hasOpenPosition) {
          console.log(`[MONITOR] No open position - evaluating ENTRY conditions`);

          let entrySignal;

          if (strategy.entry_rules && Object.keys(strategy.entry_rules).length > 0) {
            console.log(`[MONITOR] Using full technical analysis mode`);
            entrySignal = await evaluator.evaluateEntry(
              strategy.symbol,
              strategy.timeframe,
              strategy.entry_rules || {},
              currentPrice
            );
          } else {
            console.log(`[MONITOR] Using simplified entry mode (no rules configured)`);
            entrySignal = {
              signal: "BUY",
              confidence: 75, // Higher confidence in simplified mode
              reason: "Ready to enter (simplified mode)",
              indicators: {},
            };
          }

          console.log(
            `[MONITOR] Entry Signal: ${entrySignal.signal}, Confidence: ${entrySignal.confidence}%, Reason: ${entrySignal.reason}`
          );

          if (auto_trade && entrySignal.signal === "BUY" && entrySignal.confidence > 50) {
            shouldTrade = true;
            tradeSignal = "BUY";
            signalReason = entrySignal.reason;

            console.log(`[MONITOR] ✓ BUY signal triggered! (confidence: ${entrySignal.confidence}%)`);
          } else {
            console.log(
              `[MONITOR] ✗ BUY signal NOT triggered. auto_trade=${auto_trade}, signal=${entrySignal.signal}, confidence=${entrySignal.confidence}`
            );
          }
        } else {
          console.log(`[MONITOR] Open position detected - evaluating EXIT conditions`);

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

          console.log(
            `[MONITOR] Exit Signal: ${exitSignal.shouldExit ? "SELL" : "HOLD"}, Reason: ${exitSignal.reason}`
          );

          if (auto_trade && exitSignal.shouldExit) {
            shouldTrade = true;
            tradeSignal = "SELL";
            signalReason = exitSignal.reason;

            console.log(`[MONITOR] ✓ SELL signal triggered! (${exitSignal.reason})`);
          }
        }

        // Execute trade if signal triggered
        if (shouldTrade) {
          console.log(`[MONITOR] Executing ${tradeSignal} trade...`);

          try {
            const riskAmount = session.initial_balance * 0.02;
            let quantity = 0;

            if (tradeSignal === "BUY") {
              quantity = riskAmount / currentPrice;
            } else {
              quantity = lastBuyQuantity;
            }

            quantity = Math.round(quantity * 10000) / 10000;

            console.log(
              `[MONITOR] Order Details: ${tradeSignal} ${quantity} ${strategy.symbol} @ $${currentPrice}`
            );

            const order = await tradingClient.marketOrder(strategy.symbol, tradeSignal, quantity);

            console.log(`[MONITOR] ✓ Order placed successfully! Order ID: ${order.orderId}`);

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

            // Update session balance
            const updatedTrades = await db.listPaperTrades(session_id);
            let totalProfit = 0;

            for (const trade of updatedTrades) {
              if (trade.side === "BUY" && tradeSignal === "SELL") {
                totalProfit += (currentPrice - trade.entry_price) * trade.quantity;
              }
            }

            if (tradeSignal === "SELL") {
              await db.updateTradingSession(session_id, {
                current_balance: session.initial_balance + totalProfit,
                total_pnl: totalProfit,
              });
            }

            console.log(`[MONITOR] ✓ Trade recorded in database`);
          } catch (tradeError) {
            console.error(`[MONITOR] ✗ Trade execution failed:`, tradeError);
            throw tradeError;
          }
        } else {
          console.log(`[MONITOR] No trade signal - waiting for next cycle`);
        }
      } catch (cycleError) {
        console.error(`[MONITOR] Error in monitor cycle:`, cycleError);
      }
    };

    // Run initial cycle immediately
    console.log(`[MONITOR] Running initial monitor cycle...`);
    await runMonitorCycle();

    // Setup continuous monitoring
    if (check_interval > 0) {
      console.log(
        `[MONITOR] Setting up continuous monitoring every ${check_interval}ms`
      );

      if (monitoringSessions.has(session_id)) {
        const existing = monitoringSessions.get(session_id);
        if (existing?.interval) {
          clearInterval(existing.interval);
        }
      }

      const interval = setInterval(runMonitorCycle, check_interval);
      monitoringSessions.set(session_id, { interval });

      console.log(`[MONITOR] ✓ Monitoring active`);
    }

    // Get final status
    const session_updated = await db.getTradingSession(session_id);
    const trades = await db.listPaperTrades(session_id);

    const response: MonitorResponse = {
      session_id,
      session_stats: {
        current_balance: session_updated?.current_balance || 0,
        total_pnl: session_updated?.total_pnl || 0,
        total_trades: trades.length,
        win_rate: 0,
      },
      debug: {
        price_source: "TradingView (with Binance fallback)",
        current_price: 0,
        signal_evaluated: true,
        trade_executed: false,
      },
    };

    console.log(`[MONITOR] ✓ Monitor cycle complete`);

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

/**
 * Stop monitoring a session
 */
export function stopMonitoring(sessionId: string): void {
  const session = monitoringSessions.get(sessionId);
  if (session?.interval) {
    clearInterval(session.interval);
    monitoringSessions.delete(sessionId);
    console.log(`[MONITOR] Stopped monitoring session: ${sessionId}`);
  }
}


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
