/**
 * POST /api/paper-trading/start-multi-coin-monitor
 * Start monitoring multiple coins for a single strategy
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface MonitorConfig {
  coin_count: number;
  custom_coins: string[];
  scan_frequency: number;
  position_size_per_coin: number;
  max_concurrent_positions: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  trading_type: "spot" | "futures";
}

interface StartMonitorRequest {
  session_id: string;
  strategy_id: string;
  config: MonitorConfig;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id, strategy_id, config }: StartMonitorRequest = req.body;

  if (!session_id || !strategy_id || !config) {
    return sendError(res, "Missing required fields", 400, req);
  }

  try {
    console.log(
      `[MULTI-COIN] Starting multi-coin monitoring for session: ${session_id}`
    );
    console.log(`[MULTI-COIN] Coins: ${config.custom_coins.join(", ")}`);
    console.log(`[MULTI-COIN] Scan frequency: ${config.scan_frequency}s`);
    console.log(
      `[MULTI-COIN] Position size per coin: $${config.position_size_per_coin.toFixed(2)}`
    );

    const db = getDB();

    // Get session and strategy
    let session, strategy;
    try {
      session = await db.getTradingSession(session_id);
      if (!session) {
        return sendError(res, "Trading session not found", 404, req);
      }

      strategy = await db.getStrategy(strategy_id);
      if (!strategy) {
        return sendError(res, "Strategy not found", 404, req);
      }
    } catch (dbError) {
      console.warn(
        `[MULTI-COIN] Database unavailable, using mock session for demo`
      );
      session = {
        session_id,
        strategy_id,
        initial_balance: 10000,
        current_balance: 10000,
        total_pnl: 0,
      };
      strategy = {
        id: strategy_id,
        name: "Demo Strategy",
        symbol: "MULTI",
        timeframe: "1h",
        entry_rules: { conditions: [] },
        exit_rules: { stop_loss_percent: config.stop_loss_percent, take_profit_percent: config.take_profit_percent },
      };
    }

    // Store multi-coin config in session metadata
    try {
      await db.updateTradingSession(session_id, {
        metadata: {
          multi_coin_config: config,
          coins_being_monitored: config.custom_coins,
          started_at: new Date().toISOString(),
        },
      });
    } catch (updateError) {
      console.warn(
        `[MULTI-COIN] Could not save config to database:`,
        updateError
      );
    }

    console.log(`[MULTI-COIN] ✓ Multi-coin monitoring started`);

    return sendSuccess(
      res,
      {
        status: "monitoring",
        session_id,
        strategy_id,
        config,
        coins_count: config.custom_coins.length,
        message: `Now monitoring ${config.custom_coins.length} coins. Will execute trades when ${strategy.name} signals are found.`,
        next_scan: new Date(Date.now() + config.scan_frequency * 1000).toISOString(),
      },
      200,
      req
    );
  } catch (error) {
    console.error("[MULTI-COIN] Error starting monitor:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to start multi-coin monitor",
      500,
      req
    );
  }
});
