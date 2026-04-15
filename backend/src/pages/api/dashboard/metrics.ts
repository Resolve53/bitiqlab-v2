/**
 * GET /api/dashboard/metrics - Get dashboard metrics
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405);
  }

  try {
    const db = getDB();
    const metrics = await db.getDashboardMetrics();

    // Get some additional stats
    const strategies = await db.listStrategies();
    const approvedStrategies = strategies.filter((s) => s.status === "approved");
    const avgSharpe =
      strategies.length > 0
        ? strategies.reduce((sum, s) => sum + (s.current_sharpe || 0), 0) /
          strategies.length
        : 0;

    sendSuccess(res, {
      total_strategies: metrics.total_strategies,
      active_trading: metrics.active_trading,
      approved_strategies: metrics.approved_strategies,
      average_sharpe: avgSharpe,
      total_backtests: strategies.reduce((sum, s) => sum + (s.backtest_count || 0), 0),
      timestamp: metrics.timestamp,
    });
  } catch (error) {
    console.error("Dashboard metrics error:", error);
    sendError(
      res,
      error instanceof Error ? error.message : "Failed to fetch metrics",
      500
    );
  }
});
