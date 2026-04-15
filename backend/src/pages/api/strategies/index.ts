/**
 * GET /api/strategies - List all strategies
 * POST /api/strategies - Create new strategy
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler, handleCORSPreflight } from "@/lib/utils";

interface ListQuery {
  status?: string;
  symbol?: string;
  created_by?: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  // Handle CORS preflight
  if (handleCORSPreflight(req, res)) {
    return;
  }

  const db = getDB();

  if (req.method === "GET") {
    // List strategies
    const filters: ListQuery = {
      status: req.query.status as string,
      symbol: req.query.symbol as string,
      created_by: req.query.created_by as string,
    };

    // Remove undefined filters
    Object.keys(filters).forEach(
      (key) => filters[key as keyof ListQuery] === undefined && delete filters[key as keyof ListQuery]
    );

    const strategies = await db.listStrategies(filters);

    sendSuccess(res, {
      strategies,
      count: strategies.length,
    });
  } else if (req.method === "POST") {
    // Create strategy
    const {
      name,
      description,
      symbol,
      timeframe,
      market_type,
      entry_rules,
      exit_rules,
      created_by,
    } = req.body;

    // Validate required fields
    if (!name || !symbol || !timeframe) {
      return sendError(
        res,
        "Missing required fields: name, symbol, timeframe",
        400
      );
    }

    // Validate market_type if provided
    if (market_type && !["spot", "futures"].includes(market_type)) {
      return sendError(res, "Invalid market_type. Must be 'spot' or 'futures'", 400);
    }

    // Validate timeframe if needed (1h, 4h, 1d, 1w)
    const validTimeframes = ["1h", "4h", "1d", "1w"];
    if (!validTimeframes.includes(timeframe)) {
      return sendError(
        res,
        `Invalid timeframe. Must be one of: ${validTimeframes.join(", ")}`,
        400
      );
    }

    try {
      const strategy = await db.createStrategy({
        name,
        description,
        symbol,
        timeframe,
        market_type: market_type || "spot",
        entry_rules,
        exit_rules,
        created_by,
      });

      // Log audit
      await db.createStrategyAuditLog({
        strategy_id: strategy.id,
        action: "CREATE",
        new_values: strategy,
        changed_by: created_by || "system",
      });

      sendSuccess(res, strategy, 201);
    } catch (error) {
      console.error("Failed to create strategy:", error);
      sendError(res, `Failed to create strategy: ${error instanceof Error ? error.message : "Unknown error"}`, 500);
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    sendError(res, "Method not allowed", 405);
  }
});
