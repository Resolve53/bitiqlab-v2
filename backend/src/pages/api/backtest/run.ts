/**
 * POST /api/backtest/run - Run backtest on a strategy
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { BacktestExecutor } from "@/backtest-engine/engine/backtest-executor";
import { TradingViewDataFetcher, SignalGenerator } from "@/tradingview-mcp/adapter";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface BacktestRequest {
  strategy_id: string;
  version?: number;
  window?: "12m" | "6m" | "3m";
  start_date?: string;
  end_date?: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405);
  }

  const { strategy_id, version, window, start_date, end_date }: BacktestRequest = req.body;

  // Validate required fields
  if (!strategy_id) {
    return sendError(res, "Missing required field: strategy_id", 400);
  }

  const db = getDB();
  const strategy = await db.getStrategy(strategy_id);

  // Parse dates
  const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 12 months ago
  const endDate = end_date ? new Date(end_date) : new Date();

  try {
    // Fetch data from TradingView
    const tvConfig = {
      base_url: process.env.TRADINGVIEW_MCP_URL || "http://localhost:8000",
      api_key: process.env.TRADINGVIEW_MCP_API_KEY,
    };

    const fetcher = new TradingViewDataFetcher(tvConfig);
    const bars = await fetcher.getOHLCV(
      strategy.symbol,
      strategy.timeframe,
      startDate,
      endDate
    );

    if (bars.length === 0) {
      return sendError(res, "No OHLCV data available for the given period", 400);
    }

    // Generate signals
    const signalGenerator = new SignalGenerator(
      {
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        entry_rules: strategy.entry_rules,
        exit_rules: strategy.exit_rules,
        market_type: strategy.market_type,
      },
      fetcher
    );

    const signals = await signalGenerator.generateSignals(startDate, endDate);

    // Run backtest
    const executor = new BacktestExecutor(
      {
        strategy_id: strategy.id,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe as any,
        market_type: strategy.market_type as "spot" | "futures",
        version: 1,
        leverage: strategy.market_type === "futures" ? 3 : 1,
      },
      10000 // Initial capital
    );

    const result = await executor.execute(bars, signals);

    // Calculate trade statistics
    const totalTrades = result.trades?.length || 0;
    const winningTrades = result.trades?.filter((t: any) => (t.pnl || 0) > 0).length || 0;
    const losingTrades = totalTrades - winningTrades;

    // Save backtest run to database
    const backtestRun = await db.createBacktest({
      strategy_id: strategy.id,
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      start_date: startDate,
      end_date: endDate,
      initial_balance: 10000,
      final_balance: (result as any).final_balance || 10000,
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: (result as any).win_rate || 0,
      profit_factor: (result as any).profit_factor || 0,
      sharpe_ratio: (result as any).sharpe_ratio || 0,
      max_drawdown: (result as any).max_drawdown || 0,
      total_return: (result as any).total_return || 0,
      monthly_returns: (result as any).monthly_returns,
      trade_list: result.trades,
    });

    // Update strategy metrics
    await db.updateStrategy(strategy.id, {
      current_sharpe: result.sharpe_ratio,
      max_drawdown: result.max_drawdown,
      backtest_count: (strategy.backtest_count || 0) + 1,
      total_return: result.total_return,
      win_rate: result.win_rate,
    });

    // Log audit
    await db.createStrategyAuditLog({
      strategy_id: strategy.id,
      action: "BACKTEST",
      new_values: backtestRun,
      changed_by: "system",
    });

    sendSuccess(
      res,
      {
        backtest_id: backtestRun.id,
        summary: {
          sharpe_ratio: result.sharpe_ratio,
          max_drawdown: result.max_drawdown,
          win_rate: result.win_rate,
          profit_factor: result.profit_factor,
          total_trades: result.total_trades,
          total_return: result.total_return,
        },
        trades_count: result.trades.length,
      },
      200
    );
  } catch (error) {
    console.error("Backtest error:", error);
    sendError(res, error instanceof Error ? error.message : "Backtest failed", 500);
  }
});
