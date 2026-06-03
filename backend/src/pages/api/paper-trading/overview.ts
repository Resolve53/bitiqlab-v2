/**
 * GET /api/paper-trading/overview
 * Real aggregate view for the Paper Trading page (no mock data).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  try {
    const db = getDB();
    const client = getTradingClient(true);
    const sessions = await db.listTradingSessions();
    const rows = await db.listAllPaperTrades({ limit: 300 });

    const openTrades: Array<Record<string, unknown>> = [];
    const closedTrades: Array<Record<string, unknown>> = [];

    for (const t of rows) {
      const entry = Number((t as { entry_price?: number }).entry_price) || 0;
      const exit =
        (t as { exit_price?: number }).exit_price != null
          ? Number((t as { exit_price?: number }).exit_price)
          : null;
      const qty = Number((t as { quantity?: number }).quantity) || 0;
      const status = String((t as { status?: string }).status || "open");
      const symbol = String((t as { symbol?: string }).symbol || "");

      let currentPrice = exit ?? entry;
      if (status === "open" && symbol) {
        try {
          currentPrice = await client.getPrice(symbol);
        } catch {
          currentPrice = entry;
        }
      }

      let pnl = (t as { pnl?: number }).pnl != null ? Number((t as { pnl?: number }).pnl) : 0;
      if (status === "open" && qty > 0) {
        pnl = (currentPrice - entry) * qty;
      } else if (!pnl && exit != null && (t as { side?: string }).side === "SELL") {
        pnl = (exit - entry) * qty;
      }

      const pnlPercent = entry > 0 ? (pnl / (entry * qty)) * 100 : 0;
      const row = {
        id: (t as { id: string }).id,
        session_id: (t as { session_id?: string }).session_id,
        strategy_id: (t as { strategy_id?: string }).strategy_id,
        symbol,
        side: (t as { side?: string }).side,
        quantity: qty,
        entry_price: entry,
        exit_price: exit,
        current_price: currentPrice,
        pnl: Math.round(pnl * 100) / 100,
        pnl_percent: Math.round(pnlPercent * 100) / 100,
        status,
        entry_time: (t as { entry_time?: string }).entry_time,
        exit_time: (t as { exit_time?: string }).exit_time,
      };

      if (status === "open") {
        openTrades.push(row);
      } else {
        closedTrades.push(row);
      }
    }

    const openPnl = openTrades.reduce(
      (s, t) => s + (Number(t.pnl) || 0),
      0
    );
    const closedPnl = closedTrades.reduce(
      (s, t) => s + (Number(t.pnl) || 0),
      0
    );
    const totalPnl = openPnl + closedPnl;
    const activeSessions = sessions.filter(
      (s: { status?: string }) => s.status === "active"
    ).length;

    const recentSessions = sessions.slice(0, 20).map((s: Record<string, unknown>) => ({
      session_id: s.id,
      strategy_id: s.strategy_id,
      session_name: s.session_name,
      initial_balance: s.initial_balance,
      current_balance: s.current_balance,
      total_pnl: s.total_pnl,
      status: s.status,
      is_testnet: s.is_testnet,
      start_time: s.start_time || s.created_at,
    }));

    return sendSuccess(
      res,
      {
        totals: {
          active_positions: openTrades.length,
          open_pnl: Math.round(openPnl * 100) / 100,
          closed_trades: closedTrades.length,
          closed_pnl: Math.round(closedPnl * 100) / 100,
          total_pnl: Math.round(totalPnl * 100) / 100,
          active_sessions: activeSessions,
          total_sessions: sessions.length,
        },
        open_trades: openTrades,
        closed_trades: closedTrades.slice(0, 50),
        sessions: recentSessions,
      },
      200,
      req
    );
  } catch (error) {
    console.error("[PAPER-OVERVIEW]", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to load overview",
      500,
      req
    );
  }
});
