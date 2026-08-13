/**
 * GET /api/strategies - List all strategies
 * POST /api/strategies - Create new strategy
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { isExecutableStrategyRules } from "@/lib/claude-strategy-schema";
import { sendSuccess, sendError, asyncHandler, handleCORSPreflight } from "@/lib/utils";

interface ListQuery {
  status?: string;
  symbol?: string;
  created_by?: string;
}

function hasExecutablePayload(entry_rules: unknown, exit_rules: unknown): boolean {
  if (entry_rules == null && exit_rules == null) return false;
  if (
    entry_rules &&
    typeof entry_rules === "object" &&
    Object.keys(entry_rules as object).length === 0 &&
    (!exit_rules ||
      (typeof exit_rules === "object" &&
        Object.keys(exit_rules as object).length === 0))
  ) {
    return false;
  }
  return true;
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

    const includeArchived =
      req.query.include_archived === "true" ||
      req.query.include_archived === "1";
    const strategies = await db.listStrategies({
      ...filters,
      include_archived: includeArchived,
    });

    const enriched = strategies.map((s) => {
      const executable = isExecutableStrategyRules(s);
      return {
        ...s,
        executable,
        executability: executable
          ? "executable"
          : "legacy_or_draft_requires_regeneration",
      };
    });

    sendSuccess(res, {
      strategies: enriched,
      count: enriched.length,
    }, 200, req);
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
      force_draft,
    } = req.body;

    // Validate required fields
    if (!name || !symbol || !timeframe) {
      return sendError(
        res,
        "Missing required fields: name, symbol, timeframe",
        400,
        req
      );
    }

    // Validate market_type if provided
    if (market_type && !["spot", "futures"].includes(market_type)) {
      return sendError(res, "Invalid market_type. Must be 'spot' or 'futures'", 400, req);
    }

    const validTimeframes = ["15m", "1h", "4h", "1d", "1w"];
    if (!validTimeframes.includes(timeframe)) {
      return sendError(
        res,
        `Invalid timeframe. Must be one of: ${validTimeframes.join(", ")}`,
        400,
        req
      );
    }

    const payloadPresent = hasExecutablePayload(entry_rules, exit_rules);
    const executable =
      payloadPresent &&
      isExecutableStrategyRules({
        name,
        symbol,
        timeframe,
        market_type: market_type || "spot",
        entry_rules,
        exit_rules,
      });

    // Empty {} / null rules are draft-only — not Truth Engine ready
    if (!executable && !force_draft && !payloadPresent) {
      return sendError(
        res,
        "Manual create without executable entry/exit rules is draft-only. Pass force_draft=true to save a non-backtestable draft, or use AI generate for Truth Engine strategies.",
        400,
        req
      );
    }

    if (payloadPresent && !executable) {
      return sendError(
        res,
        "Provided entry/exit rules are not Truth Engine executable (missing direction, structured conditions, or stop loss). Fix rules or save with force_draft=true as non-executable draft.",
        400,
        req
      );
    }

    try {
      const strategy = await db.createStrategy({
        name,
        description,
        symbol,
        timeframe,
        market_type: market_type || "spot",
        entry_rules: executable ? entry_rules : entry_rules ?? {},
        exit_rules: executable ? exit_rules : exit_rules ?? {},
        created_by,
        ai_enhancement: {
          executable,
          schema_version: executable ? "truth_engine_v1" : "draft",
          note: executable
            ? "Executable Truth Engine strategy"
            : "Draft / non-executable — not ready for Truth Engine backtest",
        },
      });

      // Log audit
      await db.createStrategyAuditLog({
        strategy_id: strategy.id,
        action: "CREATE",
        new_values: strategy,
        changed_by: created_by || "system",
      });

      sendSuccess(
        res,
        {
          ...strategy,
          executable,
          executability: executable
            ? "executable"
            : "legacy_or_draft_requires_regeneration",
        },
        201,
        req
      );
    } catch (error) {
      console.error("Failed to create strategy:", error);
      sendError(res, `Failed to create strategy: ${error instanceof Error ? error.message : "Unknown error"}`, 500, req);
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    sendError(res, "Method not allowed", 405, req);
  }
});
