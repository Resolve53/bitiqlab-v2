/**
 * POST /api/paper-trading/start-monitoring
 * Starts continuous monitoring of multiple coins with 5-second polling
 *
 * Request body:
 * {
 *   session_id: string;
 *   strategy_id: string;
 *   coins: string[];                    // e.g., ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
 *   timeframe?: string;                 // default: "1h"
 *   auto_trade?: boolean;               // default: false
 *   poll_interval_ms?: number;          // default: 5000
 * }
 *
 * Response:
 * {
 *   status: "success" | "error";
 *   job_id: string;
 *   message: string;
 *   coins_monitored: string[];
 * }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getDB } from "@/lib/db";
import { createMonitoringJob } from "@/lib/coin-monitor";

interface StartMonitoringRequest {
  session_id: string;
  strategy_id: string;
  coins: string[];
  timeframe?: string;
  auto_trade?: boolean;
  poll_interval_ms?: number;
}

interface StartMonitoringResponse {
  status: string;
  job_id: string;
  message: string;
  coins_monitored: string[];
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const {
    session_id,
    strategy_id,
    coins,
    timeframe = "1h",
    auto_trade = false,
    poll_interval_ms = 5000,
  }: StartMonitoringRequest = req.body;

  // Validate required fields
  if (!session_id) {
    return sendError(res, "Missing session_id", 400, req);
  }

  if (!strategy_id) {
    return sendError(res, "Missing strategy_id", 400, req);
  }

  if (!coins || !Array.isArray(coins) || coins.length === 0) {
    return sendError(res, "coins must be a non-empty array", 400, req);
  }

  try {
    const db = getDB();

    // Verify session exists
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Verify strategy exists
    const strategy = await db.getStrategy(strategy_id);
    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    console.log(
      `[START-MONITORING] Starting monitor for session ${session_id}, coins: ${coins.join(", ")}`
    );

    // Create monitoring job
    const job = createMonitoringJob({
      session_id,
      strategy_id,
      coins,
      symbol: strategy.symbol,
      timeframe,
      entry_rules: strategy.entry_rules,
      exit_rules: strategy.exit_rules,
      auto_trade,
      poll_interval_ms,
    });

    // Start the job
    await job.start();

    const response: StartMonitoringResponse = {
      status: "success",
      job_id: job.getJobId(),
      message: `Monitoring started for ${coins.length} coins`,
      coins_monitored: coins,
    };

    console.log(`[START-MONITORING] Job created: ${job.getJobId()}`);
    return sendSuccess(res, response, 200, req);
  } catch (error) {
    console.error("[START-MONITORING] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to start monitoring",
      500,
      req
    );
  }
});
