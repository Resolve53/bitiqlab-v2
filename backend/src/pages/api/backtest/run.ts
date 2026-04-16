/**
 * POST /api/backtest/run - Run backtest on a strategy
 * Returns simulated backtest results for now
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler, handleCORSPreflight } from "@/lib/utils";

interface BacktestRequest {
  strategy_id: string;
  window?: string;
  start_date?: string;
  end_date?: string;
}

interface BacktestResults {
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_return: number;
  profit_factor: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  // Handle CORS preflight
  if (handleCORSPreflight(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405);
  }

  try {
    const { strategy_id, window = "12m", start_date, end_date }: BacktestRequest = req.body;

    // Validate required fields
    if (!strategy_id) {
      return sendError(res, "Missing required field: strategy_id", 400);
    }

    const db = getDB();
    const strategy = await db.getStrategy(strategy_id);

    if (!strategy) {
      return sendError(res, "Strategy not found", 404);
    }

    // Parse dates
    const [startDate, endDate] = getDateFromWindow(window);

    // Generate simulated backtest results
    const results = generateSimulatedBacktestResults(strategy, window);

    // Save backtest run to database
    const backtestRun = await db.createBacktest({
      strategy_id: strategy.id,
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      start_date: startDate,
      end_date: endDate,
      initial_balance: 10000,
      final_balance: 10000 * (1 + results.total_return),
      total_trades: results.total_trades,
      winning_trades: results.winning_trades,
      losing_trades: results.losing_trades,
      win_rate: results.win_rate,
      profit_factor: results.profit_factor,
      sharpe_ratio: results.sharpe_ratio,
      max_drawdown: results.max_drawdown,
      total_return: results.total_return,
    });

    // Update strategy metrics
    await db.updateStrategy(strategy.id, {
      current_sharpe: results.sharpe_ratio,
      max_drawdown: results.max_drawdown,
      backtest_count: (strategy.backtest_count || 0) + 1,
      total_return: results.total_return,
      win_rate: results.win_rate,
      winning_trades: results.winning_trades,
      losing_trades: results.losing_trades,
    });

    // Log audit
    await db.createStrategyAuditLog({
      strategy_id: strategy.id,
      action: "BACKTEST",
      new_values: backtestRun,
      changed_by: "system",
    });

    sendSuccess(res, {
      sharpe_ratio: results.sharpe_ratio,
      max_drawdown: results.max_drawdown,
      win_rate: results.win_rate,
      profit_factor: results.profit_factor,
      total_return: results.total_return,
      total_trades: results.total_trades,
      winning_trades: results.winning_trades,
      losing_trades: results.losing_trades,
    });
  } catch (error) {
    console.error("Backtest error:", error);
    sendError(res, error instanceof Error ? error.message : "Backtest failed", 500);
  }
});

/**
 * Generate simulated backtest results
 */
function generateSimulatedBacktestResults(strategy: any, window: string): BacktestResults {
  // Generate realistic but varied results based on the strategy
  const baseReturn = strategy.total_return || 0.05; // Default 5%
  const variance = (Math.random() - 0.5) * 0.1; // ±5% variance
  const totalReturn = Math.max(-0.5, baseReturn + variance); // Min -50%

  const winRate = Math.min(0.95, Math.max(0.2, (strategy.win_rate || 0.5)));
  const totalTrades = Math.floor(20 + Math.random() * 80); // 20-100 trades
  const winningTrades = Math.floor(totalTrades * winRate);
  const losingTrades = totalTrades - winningTrades;

  // Calculate profit factor
  const avgWin = totalReturn / Math.max(1, winningTrades);
  const avgLoss = Math.abs(totalReturn) / Math.max(1, losingTrades);
  const profitFactor = avgWin > 0 && avgLoss > 0 ? avgWin / avgLoss : 1.0;

  // Generate Sharpe ratio (typically 0.5 - 2.0 for good strategies)
  const sharpeRatio = Math.max(0.2, (strategy.current_sharpe || 0.8) + (Math.random() - 0.5) * 0.3);

  // Generate max drawdown (typically 10-30% for good strategies)
  const baseDrawdown = strategy.max_drawdown || 0.15;
  const maxDrawdown = Math.min(0.5, Math.max(0.05, baseDrawdown + (Math.random() - 0.5) * 0.1));

  return {
    sharpe_ratio: Math.round(sharpeRatio * 100) / 100,
    max_drawdown: Math.round(maxDrawdown * 1000) / 1000,
    win_rate: Math.round(winRate * 10000) / 10000,
    total_return: Math.round(totalReturn * 10000) / 10000,
    profit_factor: Math.round(profitFactor * 100) / 100,
    total_trades: totalTrades,
    winning_trades: winningTrades,
    losing_trades: losingTrades,
  };
}

/**
 * Convert window string to date range
 */
function getDateFromWindow(window: string): [Date, Date] {
  const endDate = new Date();
  const startDate = new Date();

  switch (window) {
    case "1m":
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "3m":
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "6m":
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case "12m":
    case "1y":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case "all":
      startDate.setFullYear(2020); // Default to 2020
      break;
    default:
      startDate.setMonth(startDate.getMonth() - 12);
  }

  return [startDate, endDate];
}
