/**
 * POST /api/backtest/run
 * Phase 1 Truth Engine — real OHLCV, deterministic rules, real metrics.
 * Never falls back to simulated/random results.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import {
  runTruthBacktest,
  StrategyValidationError,
  MarketDataError,
} from "@/truth-engine";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  try {
    const body = req.body || {};
    const strategyId =
      body.strategyId || body.strategy_id;

    if (!strategyId || typeof strategyId !== "string") {
      return sendError(
        res,
        "Missing required field: strategyId",
        400,
        req
      );
    }

    const db = getDB();
    const strategy = await db.getStrategy(strategyId);
    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    const result = await runTruthBacktest({
      strategy,
      request: {
        strategyId,
        symbol: body.symbol,
        timeframe: body.timeframe,
        startDate: body.startDate || body.start_date,
        endDate: body.endDate || body.end_date,
        window: body.window,
        initialCapital: body.initialCapital ?? body.initial_capital,
        commissionPct: body.commissionPct ?? body.commission_pct,
        slippagePct: body.slippagePct ?? body.slippage_pct,
      },
    });

    const m = result.metrics;

    const backtestRun = await db.createBacktest({
      strategy_id: strategy.id,
      symbol: result.provenance.symbol,
      timeframe: result.provenance.timeframe,
      start_date: new Date(result.provenance.start),
      end_date: new Date(result.provenance.end),
      initial_balance: result.provenance.initialCapital,
      final_balance: m.finalEquity,
      total_trades: m.totalTrades,
      winning_trades: m.winningTrades,
      losing_trades: m.losingTrades,
      win_rate: m.winRate,
      profit_factor: m.profitFactor ?? undefined,
      sharpe_ratio: m.sharpeRatio ?? undefined,
      max_drawdown: m.maxDrawdown,
      total_return: m.totalReturn,
      result_source: "REAL_BACKTEST",
      provenance: result.provenance,
      monthly_returns: {
        result_source: "REAL_BACKTEST",
        provenance: result.provenance,
        equity_curve: m.equityCurve,
        metrics: m,
      },
      trade_list: result.trades,
    });

    await db.updateStrategy(strategy.id, {
      current_sharpe: m.sharpeRatio ?? strategy.current_sharpe ?? 0,
      max_drawdown: m.maxDrawdown,
      backtest_count: (strategy.backtest_count || 0) + 1,
      total_return: m.totalReturn,
      win_rate: m.winRate,
      winning_trades: m.winningTrades,
      losing_trades: m.losingTrades,
    });

    await db.createStrategyAuditLog({
      strategy_id: strategy.id,
      action: "BACKTEST",
      new_values: {
        backtest_id: backtestRun?.id,
        result_source: "REAL_BACKTEST",
        total_trades: m.totalTrades,
        total_return: m.totalReturn,
      },
      changed_by: "system",
    });

    return sendSuccess(
      res,
      {
        result_source: "REAL_BACKTEST",
        label: "Real Historical Backtest",
        backtest_id: backtestRun?.id,
        sharpe_ratio: m.sharpeRatio,
        sortino_ratio: m.sortinoRatio,
        max_drawdown: m.maxDrawdown,
        win_rate: m.winRate,
        profit_factor: m.profitFactor,
        total_return: m.totalReturn,
        total_trades: m.totalTrades,
        winning_trades: m.winningTrades,
        losing_trades: m.losingTrades,
        net_profit: m.netProfit,
        final_equity: m.finalEquity,
        expectancy: m.expectancy,
        average_realized_r: m.averageRealizedR,
        max_consecutive_wins: m.maxConsecutiveWins,
        max_consecutive_losses: m.maxConsecutiveLosses,
        average_trade_duration_ms: m.averageTradeDurationMs,
        exposure_time: m.exposureTime,
        equity_curve: m.equityCurve,
        trades: result.trades,
        provenance: result.provenance,
        signals_count: result.signals.length,
      },
      200,
      req
    );
  } catch (error) {
    console.error("Backtest error:", error);
    if (
      error instanceof StrategyValidationError ||
      error instanceof MarketDataError
    ) {
      return sendError(res, error.message, 400, req);
    }
    return sendError(
      res,
      error instanceof Error ? error.message : "Backtest failed",
      500,
      req
    );
  }
});
