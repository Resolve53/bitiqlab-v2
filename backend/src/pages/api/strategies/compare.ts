/**
 * GET /api/strategies/compare
 * Compare multiple strategies side-by-side
 *
 * Query Parameters:
 * - ids: Comma-separated list of strategy UUIDs (e.g., "uuid1,uuid2,uuid3")
 *
 * Example: GET /api/strategies/compare?ids=uuid1,uuid2,uuid3
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface ComparisonStrategy {
  strategy_id: string;
  name: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  metrics: {
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_return: number;
  };
}

interface ComparisonResponse {
  strategies: ComparisonStrategy[];
  comparison_metadata: {
    best_sharpe: string;
    best_return: string;
    lowest_drawdown: string;
    best_win_rate: string;
  };
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  try {
    const { ids } = req.query;

    if (!ids || typeof ids !== "string") {
      return sendError(res, "ids parameter is required (comma-separated list)", 400, req);
    }

    const idList = ids
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (idList.length === 0) {
      return sendError(res, "At least one strategy ID is required", 400, req);
    }

    if (idList.length > 10) {
      return sendError(res, "Maximum 10 strategies can be compared at once", 400, req);
    }

    const db = getDB();

    // Fetch all strategies
    const strategies: ComparisonStrategy[] = [];

    for (const id of idList) {
      try {
        const strategy = await db.getStrategy(id);

        if (strategy) {
          strategies.push({
            strategy_id: strategy.id,
            name: strategy.name,
            symbol: strategy.symbol,
            timeframe: strategy.timeframe,
            market_type: strategy.market_type,
            metrics: {
              sharpe_ratio: strategy.current_sharpe || 0,
              max_drawdown: (strategy.max_drawdown || 0) * 100,
              win_rate: (strategy.win_rate || 0) * 100,
              profit_factor: 1.0,
              total_return: (strategy.total_return || 0) * 100,
            },
          });
        }
      } catch (error) {
        console.error(`Failed to fetch strategy ${id}:`, error);
        // Continue with other strategies
      }
    }

    if (strategies.length === 0) {
      return sendError(res, "No valid strategies found", 404, req);
    }

    // Calculate comparison metadata
    const metadata = {
      best_sharpe: strategies.reduce((best, curr) =>
        curr.metrics.sharpe_ratio > best.metrics.sharpe_ratio ? curr : best
      ).strategy_id,
      best_return: strategies.reduce((best, curr) =>
        curr.metrics.total_return > best.metrics.total_return ? curr : best
      ).strategy_id,
      lowest_drawdown: strategies.reduce((best, curr) =>
        curr.metrics.max_drawdown < best.metrics.max_drawdown ? curr : best
      ).strategy_id,
      best_win_rate: strategies.reduce((best, curr) =>
        curr.metrics.win_rate > best.metrics.win_rate ? curr : best
      ).strategy_id,
    };

    const response: ComparisonResponse = {
      strategies,
      comparison_metadata: metadata,
    };

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");

    return sendSuccess(res, response, 200, req);
  } catch (error) {
    console.error("Error in compare endpoint:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to compare strategies",
      500,
      req
    );
  }
});
