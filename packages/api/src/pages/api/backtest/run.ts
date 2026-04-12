/**
 * POST /api/backtest/run - Run backtest on a strategy
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { BacktestExecutor } from "@bitiqlab/backtest-engine";
import { TradingViewDataFetcher, SignalGenerator } from "@bitiqlab/tradingview-mcp";
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
        leverage: strategy.leverage,
      },
      fetcher
    );

    const signals = await signalGenerator.generateSignals(startDate, endDate);

    // Run backtest
    const executor = new BacktestExecutor(
      {
        strategy_id: strategy.id,
        version: version || strategy.version,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        market_type: strategy.market_type,
        leverage: strategy.leverage,
      },
      10000 // Initial capital
    );

    const result = await executor.execute(bars, signals);

    // Save backtest run to database
    const backtestRun = await db.createBacktestRun({
      strategy_id: strategy.id,
      version: version || strategy.version,
      window: (window || "12m") as "12m" | "6m" | "3m",
      start_date: startDate,
      end_date: endDate,
      total_trades: result.total_trades,
      win_rate: result.win_rate,
      profit_factor: result.profit_factor,
      sharpe_ratio: result.sharpe_ratio,
      sortino_ratio: result.sortino_ratio,
      max_drawdown: result.max_drawdown,
      avg_r_r: result.avg_r_r,
      total_return: result.total_return,
      trades: result.trades,
      daily_returns: result.daily_returns,
      equity_curve: result.equity_curve,
      data_points: result.data_points,
      test_duration_minutes: result.test_duration_minutes,
    });

    // Save trades to database
    for (const trade of result.trades) {
      await db.createTrade(trade);
    }

    // Update strategy metrics
    await db.updateStrategy(strategy.id, {
      current_sharpe: result.sharpe_ratio,
      current_max_drawdown: result.max_drawdown,
      backtest_count: (strategy.backtest_count || 0) + 1,
      last_backtest_date: new Date(),
    });

    // Log audit
    await db.createAuditLog({
      action: "BACKTEST",
      entity_type: "strategy",
      entity_id: strategy.id,
      description: `Ran backtest for ${strategy.symbol}/${strategy.timeframe}, Sharpe: ${result.sharpe_ratio.toFixed(2)}`,
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
