/**
 * GET /api/dashboard/strategies-summary
 * Per-strategy PnL, trade counts, and recent activity for the dashboard.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  try {
    const db = getDB();
    const strategies = await db.listStrategies({ include_archived: false });
    const allTrades = await db.listAllPaperTrades({ limit: 500 });

    const summary = await Promise.all(
      strategies.map(async (s) => {
        const strategyTrades = allTrades.filter(
          (t: { strategy_id?: string }) => t.strategy_id === s.id
        );
        const sessions = await db.listTradingSessions({
          strategy_id: s.id,
        });

        let realizedPnl = 0;
        let openTrades = 0;
        for (const t of strategyTrades) {
          const pnl = Number((t as { pnl?: number }).pnl) || 0;
          if ((t as { status?: string }).status === "open") {
            openTrades += 1;
          } else {
            realizedPnl += pnl;
          }
        }

        const sessionPnl = sessions.reduce(
          (sum: number, sess: { total_pnl?: number }) =>
            sum + (Number(sess.total_pnl) || 0),
          0
        );

        const latestSession = sessions[0];
        const winRate =
          s.win_rate != null
            ? Number(s.win_rate)
            : (s.winning_trades || 0) + (s.losing_trades || 0) > 0
              ? ((s.winning_trades || 0) /
                  ((s.winning_trades || 0) + (s.losing_trades || 0))) *
                100
              : 0;

        return {
          id: s.id,
          name: s.name,
          symbol: s.symbol,
          timeframe: s.timeframe,
          market_type: s.market_type,
          status: s.status,
          current_sharpe: s.current_sharpe,
          win_rate: winRate,
          total_return: s.total_return,
          max_drawdown: s.max_drawdown,
          trade_count: strategyTrades.length,
          open_trades: openTrades,
          realized_pnl: realizedPnl,
          session_pnl: sessionPnl,
          total_pnl: sessionPnl || realizedPnl,
          active_sessions: sessions.filter(
            (sess: { status?: string }) => sess.status === "active"
          ).length,
          latest_session_id: latestSession?.id,
          deployed_to_bitiq: s.deployed_to_bitiq,
          updated_at: s.updated_at,
        };
      })
    );

    const totals = {
      strategies: summary.length,
      total_trades: allTrades.length,
      total_pnl: summary.reduce((s, row) => s + row.total_pnl, 0),
      active_sessions: summary.reduce((s, row) => s + row.active_sessions, 0),
    };

    return sendSuccess(
      res,
      {
        totals,
        strategies: summary.sort((a, b) => b.total_pnl - a.total_pnl),
        recent_trades: allTrades.slice(0, 30).map((t: Record<string, unknown>) => ({
          id: t.id,
          strategy_id: t.strategy_id,
          symbol: t.symbol,
          side: t.side,
          entry_price: t.entry_price,
          quantity: t.quantity,
          pnl: t.pnl,
          entry_time: t.entry_time,
          status: t.status,
        })),
      },
      200,
      req
    );
  } catch (error) {
    console.error("[STRATEGIES-SUMMARY]", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to build summary",
      500,
      req
    );
  }
});
