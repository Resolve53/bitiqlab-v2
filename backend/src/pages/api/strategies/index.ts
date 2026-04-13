/**
 * GET /api/strategies - List all strategies
 * POST /api/strategies - Create new strategy
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { Strategy } from "../../../core";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface ListQuery {
  status?: string;
  symbol?: string;
  created_by?: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
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
      leverage,
      entry_rules,
      exit_rules,
      position_sizing,
      created_by,
    } = req.body;

    // Validate required fields
    if (!name || !symbol || !timeframe || !entry_rules || !exit_rules) {
      return sendError(
        res,
        "Missing required fields: name, symbol, timeframe, entry_rules, exit_rules",
        400
      );
    }

    if (!["spot", "futures"].includes(market_type)) {
      return sendError(res, "Invalid market_type. Must be 'spot' or 'futures'", 400);
    }

    const strategy = await db.createStrategy({
      name,
      description: description || "",
      symbol,
      timeframe,
      market_type: market_type || "spot",
      leverage: leverage || (market_type === "spot" ? 1 : 3),
      entry_rules,
      exit_rules,
      position_sizing: position_sizing || {
        risk_per_trade: 2,
        max_concurrent_positions: 5,
      },
      status: "draft",
      version: 1,
      backtest_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: created_by || "system",
    });

    // Log audit
    await db.createAuditLog({
      action: "CREATE",
      entity_type: "strategy",
      entity_id: strategy.id,
      user_id: created_by,
      new_values: strategy,
      description: `Created strategy: ${name}`,
    });

    sendSuccess(res, strategy, 201);
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    sendError(res, "Method not allowed", 405);
  }
});
