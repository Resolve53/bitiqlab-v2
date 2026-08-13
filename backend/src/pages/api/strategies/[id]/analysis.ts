/**
 * GET /api/strategies/[id]/analysis
 * Returns strategy analysis. Equity curve comes only from REAL_BACKTEST runs.
 * Synthetic/random equity curves have been removed.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

function resolveResultSource(bt: any): "REAL_BACKTEST" | "SIMULATED_LEGACY" {
  if (bt.result_source === "REAL_BACKTEST") return "REAL_BACKTEST";
  if (bt.monthly_returns?.result_source === "REAL_BACKTEST") {
    return "REAL_BACKTEST";
  }
  if (bt.provenance || bt.monthly_returns?.provenance) {
    return "REAL_BACKTEST";
  }
  return "SIMULATED_LEGACY";
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405);
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return sendError(res, "Strategy ID is required", 400, req);
    }

    const db = getDB();
    const strategy = await db.getStrategy(id);

    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    const backtests = await db.listBacktests(id);
    const recentBacktests = (backtests || []).slice(0, 10).map((bt: any) => {
      const source = resolveResultSource(bt);
      return {
        id: bt.id,
        timestamp: new Date(bt.created_at).toISOString(),
        duration_days: calculateDays(bt.start_date, bt.end_date),
        total_return: (bt.total_return || 0) * 100,
        sharpe_ratio: bt.sharpe_ratio,
        max_drawdown: (bt.max_drawdown || 0) * 100,
        win_rate: (bt.win_rate || 0) * 100,
        result_source: source,
        label:
          source === "REAL_BACKTEST"
            ? "Real Historical Backtest"
            : "Legacy / Unverified",
      };
    });

    const latestReal = (backtests || []).find(
      (bt: any) => resolveResultSource(bt) === "REAL_BACKTEST"
    );

    const equityCurve =
      latestReal?.monthly_returns?.equity_curve?.map((p: any) => ({
        timestamp: p.timestamp,
        value: p.equity,
      })) || [];

    const riskMetrics = {
      sortino_ratio:
        latestReal?.monthly_returns?.metrics?.sortinoRatio ?? null,
      calmar_ratio: null as number | null,
      recovery_factor: null as number | null,
      var_95: null as number | null,
    };

    if (
      latestReal?.monthly_returns?.metrics?.totalReturn != null &&
      latestReal?.max_drawdown
    ) {
      const tr = latestReal.monthly_returns.metrics.totalReturn;
      const dd = latestReal.max_drawdown;
      if (dd > 0 && tr > 0) {
        riskMetrics.calmar_ratio = tr / dd;
        riskMetrics.recovery_factor = tr / dd;
      }
    }

    const response = {
      strategy_id: strategy.id,
      name: strategy.name,
      description: strategy.description || "",
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      market_type: strategy.market_type,

      current_metrics: {
        sharpe_ratio: strategy.current_sharpe || null,
        max_drawdown: (strategy.max_drawdown || 0) * 100,
        win_rate: (strategy.win_rate || 0) * 100,
        profit_factor:
          latestReal?.profit_factor ??
          latestReal?.monthly_returns?.metrics?.profitFactor ??
          null,
        total_return: (strategy.total_return || 0) * 100,
        result_source: latestReal
          ? "REAL_BACKTEST"
          : recentBacktests[0]?.result_source || "SIMULATED_LEGACY",
      },

      risk_metrics: riskMetrics,
      recent_backtests: recentBacktests,
      equity_curve: equityCurve,
      equity_curve_note:
        equityCurve.length === 0
          ? "No Real Historical Backtest equity curve available. Legacy/unverified runs do not synthesize curves."
          : "From latest Real Historical Backtest",
    };

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return sendSuccess(res, response, 200, req);
  } catch (error) {
    console.error("Error in strategy analysis endpoint:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to fetch analysis",
      500
    );
  }
});

function calculateDays(
  startDate: string | Date,
  endDate: string | Date
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
}
