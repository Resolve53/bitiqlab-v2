/**
 * POST /api/paper-trading/multi-coin-scan
 * Scan multiple coins and execute trades when strategy signals are found
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";
import { getEvaluator } from "@/lib/strategy-evaluator";

interface ScanRequest {
  session_id: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id }: ScanRequest = req.body;

  if (!session_id) {
    return sendError(res, "Missing session_id", 400, req);
  }

  try {
    console.log(`[MULTI-COIN-SCAN] Starting scan for session: ${session_id}`);

    const db = getDB();
    const tradingClient = getTradingClient(true);
    const evaluator = getEvaluator();

    // Get session
    let session, strategy, config;
    try {
      session = await db.getTradingSession(session_id);
      if (!session) {
        return sendError(res, "Trading session not found", 404, req);
      }

      strategy = await db.getStrategy(session.strategy_id);
      if (!strategy) {
        return sendError(res, "Strategy not found", 404, req);
      }

      // Get multi-coin config
      config = session.metadata?.multi_coin_config;
      if (!config) {
        return sendError(res, "Multi-coin config not found", 400, req);
      }
    } catch (dbError) {
      console.warn(
        `[MULTI-COIN-SCAN] Database error, using fallback`,
        dbError
      );
      return sendError(res, "Session or strategy not found", 404, req);
    }

    const coins = config.custom_coins || [];
    const scanResults = {
      coins_scanned: coins.length,
      signals_found: 0,
      trades_executed: 0,
      results: [] as any[],
    };

    console.log(
      `[MULTI-COIN-SCAN] Scanning ${coins.length} coins for ${strategy.name}`
    );

    // Scan each coin
    for (const coin of coins) {
      try {
        let currentPrice = 0;

        // Get current price
        try {
          currentPrice = await tradingClient.getPrice(coin);
        } catch (priceError) {
          console.warn(`[MULTI-COIN-SCAN] Could not get price for ${coin}:`, priceError);
          scanResults.results.push({
            coin,
            status: "price_error",
            message: "Could not fetch price",
          });
          continue;
        }

        // Check if strategy signals for this coin
        let entrySignal = null;
        try {
          let entryRules: any = { conditions: [] };
          if (strategy.entry_rules) {
            if (Array.isArray(strategy.entry_rules)) {
              entryRules = { conditions: strategy.entry_rules };
            } else {
              entryRules = strategy.entry_rules;
            }
          }

          entrySignal = await evaluator.evaluateEntry(
            coin,
            strategy.timeframe,
            entryRules,
            currentPrice
          );
        } catch (signalError) {
          console.warn(`[MULTI-COIN-SCAN] Could not evaluate signal for ${coin}:`, signalError);
          continue;
        }

        if (entrySignal && entrySignal.signal === "BUY" && entrySignal.confidence > 50) {
          scanResults.signals_found++;
          console.log(
            `[MULTI-COIN-SCAN] ✓ Signal found on ${coin}: Confidence ${entrySignal.confidence}%`
          );

          // Check if we can open more positions
          let openPositions = 0;
          try {
            const trades = await db.listPaperTrades(session_id);
            openPositions = trades.filter((t) => t.side === "BUY" && t.status !== "CLOSED").length;
          } catch (tradeError) {
            console.warn(`[MULTI-COIN-SCAN] Could not count open positions`);
          }

          if (openPositions < config.max_concurrent_positions) {
            try {
              const quantity = config.position_size_per_coin / currentPrice;
              const order = await tradingClient.marketOrder(
                coin,
                "BUY",
                quantity
              );

              scanResults.trades_executed++;
              console.log(
                `[MULTI-COIN-SCAN] ✓ Trade executed on ${coin}: ${quantity.toFixed(4)} @ $${currentPrice}`
              );

              // Log the trade
              try {
                await db.createPaperTrade({
                  session_id,
                  strategy_id: strategy.id,
                  symbol: coin,
                  side: "BUY",
                  entry_price: currentPrice,
                  quantity,
                  status: order.status,
                  reason_entry: entrySignal.reason,
                });
              } catch (logError) {
                console.warn(`[MULTI-COIN-SCAN] Could not log trade for ${coin}`);
              }

              scanResults.results.push({
                coin,
                status: "trade_executed",
                price: currentPrice,
                quantity: quantity.toFixed(4),
                confidence: entrySignal.confidence,
              });
            } catch (tradeError) {
              console.warn(`[MULTI-COIN-SCAN] Trade execution failed for ${coin}:`, tradeError);
              scanResults.results.push({
                coin,
                status: "trade_failed",
                error: tradeError instanceof Error ? tradeError.message : "Unknown error",
              });
            }
          } else {
            console.log(
              `[MULTI-COIN-SCAN] ⊘ Max concurrent positions reached, skipping ${coin}`
            );
            scanResults.results.push({
              coin,
              status: "max_positions_reached",
              signal_found: true,
            });
          }
        } else {
          scanResults.results.push({
            coin,
            status: "no_signal",
            confidence: entrySignal?.confidence || 0,
          });
        }
      } catch (coinError) {
        console.error(`[MULTI-COIN-SCAN] Error scanning ${coin}:`, coinError);
        scanResults.results.push({
          coin,
          status: "error",
          error: coinError instanceof Error ? coinError.message : "Unknown error",
        });
      }
    }

    console.log(
      `[MULTI-COIN-SCAN] ✓ Scan complete. Found ${scanResults.signals_found} signals, executed ${scanResults.trades_executed} trades`
    );

    return sendSuccess(res, scanResults, 200, req);
  } catch (error) {
    console.error("[MULTI-COIN-SCAN] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to scan coins",
      500,
      req
    );
  }
});
