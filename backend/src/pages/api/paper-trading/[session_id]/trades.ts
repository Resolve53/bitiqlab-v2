/**
 * GET /api/paper-trading/[session_id]/trades
 * List all trades for a session with filtering and sorting
 *
 * Query parameters:
 * - symbol?: string (filter by symbol)
 * - side?: "BUY" | "SELL" (filter by side)
 * - start_date?: ISO8601 (filter by date range start)
 * - end_date?: ISO8601 (filter by date range end)
 * - profitable_only?: boolean (filter to profitable trades only)
 * - loss_only?: boolean (filter to losing trades only)
 * - sort_by?: "entry_time" | "pnl" | "duration" (default: entry_time)
 * - sort_order?: "asc" | "desc" (default: desc)
 * - limit?: number (default: 100)
 * - offset?: number (default: 0)
 *
 * Response:
 * {
 *   status: "success";
 *   session_id: string;
 *   trades: Trade[];
 *   total_count: number;
 *   pagination: { limit, offset, total };
 * }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getDB } from "@/lib/db";

interface TradeFilters {
  symbol?: string;
  side?: "BUY" | "SELL";
  start_date?: string;
  end_date?: string;
  profitable_only?: boolean;
  loss_only?: boolean;
}

interface SortOptions {
  sort_by: "entry_time" | "pnl" | "duration";
  sort_order: "asc" | "desc";
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id } = req.query;
  const {
    symbol,
    side,
    start_date,
    end_date,
    profitable_only = false,
    loss_only = false,
    sort_by = "entry_time",
    sort_order = "desc",
    limit = 100,
    offset = 0,
  } = req.query;

  if (!session_id || typeof session_id !== "string") {
    return sendError(res, "Invalid session_id", 400, req);
  }

  try {
    const db = getDB();

    // Verify session exists
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Get all trades for session
    const allTrades = await db.listPaperTrades(session_id);

    // Apply filters
    let filteredTrades = allTrades;

    if (symbol) {
      filteredTrades = filteredTrades.filter((t) => t.symbol === symbol);
    }

    if (side) {
      filteredTrades = filteredTrades.filter((t) => t.side === side);
    }

    if (start_date) {
      const startTime = new Date(String(start_date)).getTime();
      filteredTrades = filteredTrades.filter(
        (t) => new Date(t.created_at).getTime() >= startTime
      );
    }

    if (end_date) {
      const endTime = new Date(String(end_date)).getTime();
      filteredTrades = filteredTrades.filter(
        (t) => new Date(t.created_at).getTime() <= endTime
      );
    }

    // Filter by profitability
    if (profitable_only === "true") {
      filteredTrades = filteredTrades.filter((t) => t.pnl_percent >= 0);
    }

    if (loss_only === "true") {
      filteredTrades = filteredTrades.filter((t) => t.pnl_percent < 0);
    }

    // Calculate trade durations and P&L for sorting
    const tradesWithCalcs = filteredTrades.map((trade) => {
      const duration_minutes =
        (new Date(trade.exit_time).getTime() - new Date(trade.entry_time).getTime()) /
        (1000 * 60);
      return {
        ...trade,
        duration_minutes,
      };
    });

    // Apply sorting
    const sortByValue = String(sort_by);
    const sortOrderValue = String(sort_order);

    tradesWithCalcs.sort((a, b) => {
      let compareValue = 0;

      if (sortByValue === "entry_time") {
        compareValue = new Date(a.entry_time).getTime() - new Date(b.entry_time).getTime();
      } else if (sortByValue === "pnl") {
        compareValue = (a.pnl_percent || 0) - (b.pnl_percent || 0);
      } else if (sortByValue === "duration") {
        compareValue = a.duration_minutes - b.duration_minutes;
      }

      return sortOrderValue === "desc" ? -compareValue : compareValue;
    });

    // Apply pagination
    const limitNum = Math.min(parseInt(String(limit)) || 100, 500);
    const offsetNum = parseInt(String(offset)) || 0;

    const paginatedTrades = tradesWithCalcs.slice(offsetNum, offsetNum + limitNum);

    return sendSuccess(
      res,
      {
        status: "success",
        session_id,
        trades: paginatedTrades,
        total_count: filteredTrades.length,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: filteredTrades.length,
        },
      },
      200,
      req
    );
  } catch (error) {
    console.error("[TRADES] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to list trades",
      500,
      req
    );
  }
});
