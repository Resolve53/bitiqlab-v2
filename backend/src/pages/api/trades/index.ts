/**
 * GET /api/trades — List paper trades (all strategies or filter by strategy_id)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const strategyId = req.query.strategy_id as string | undefined;
  const limit = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 500);

  try {
    const db = getDB();
    const rows = await db.listAllPaperTrades({
      strategy_id: strategyId,
      limit,
    });

    const trades = rows.map((t: Record<string, unknown>) => {
      const entry = Number(t.entry_price) || 0;
      const exit = t.exit_price != null ? Number(t.exit_price) : null;
      const qty = Number(t.quantity) || 0;
      let pnl = t.pnl != null ? Number(t.pnl) : 0;
      if (!pnl && exit != null && t.side === "SELL") {
        pnl = (exit - entry) * qty;
      }

      return {
        id: t.id,
        session_id: t.session_id,
        strategy_id: t.strategy_id,
        symbol: t.symbol,
        coin: t.symbol,
        side: t.side,
        direction: String(t.side).toUpperCase() === "BUY" ? "long" : "short",
        entry_price: entry,
        exit_price: exit,
        current_price: exit ?? entry,
        quantity: qty,
        pnl,
        pnl_percent: t.pnl_percent,
        status: t.status || "closed",
        entry_time: t.entry_time,
        exit_time: t.exit_time,
        reason_entry: t.reason_entry,
        unrealized_pnl_usd: pnl,
        unrealized_pnl_percent: Number(t.pnl_percent) || 0,
      };
    });

    return sendSuccess(res, { trades, count: trades.length }, 200, req);
  } catch (error) {
    console.error("[TRADES]", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to list trades",
      500,
      req
    );
  }
});
