/**
 * GET /api/strategies/[id]/analysis
 * Returns detailed strategy analysis with metrics and equity curve
 *
 * Query Parameters:
 * - id: Strategy UUID
 *
 * Example: GET /api/strategies/uuid/analysis
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface AnalysisResponse {
  strategy_id: string;
  name: string;
  description: string;
  symbol: string;
  timeframe: string;
  market_type: string;

  current_metrics: {
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_return: number;
  };

  risk_metrics: {
    sortino_ratio: number;
    calmar_ratio: number;
    recovery_factor: number;
    var_95: number;
  };

  recent_backtests: Array<{
    id: string;
    timestamp: string;
    duration_days: number;
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
  }>;

  equity_curve: Array<{
    timestamp: string;
    value: number;
  }>;
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

    // Fetch strategy
    const strategy = await db.getStrategy(id);

    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    // Generate synthetic equity curve based on metrics
    // In production, this would come from actual backtest results
    const equityCurve = generateEquityCurve(
      10000, // Initial capital
      strategy.total_return || 0,
      strategy.max_drawdown || 0,
      30 // Last 30 days
    );

    // Fetch recent backtests
    const backtests = await db.listBacktests(id);
    const recentBacktests = backtests?.slice(0, 5) || [];

    // Calculate additional risk metrics
    const riskMetrics = calculateRiskMetrics(
      strategy.total_return || 0,
      strategy.current_sharpe || 0,
      strategy.max_drawdown || 0,
      strategy.win_rate || 0
    );

    const response: AnalysisResponse = {
      strategy_id: strategy.id,
      name: strategy.name,
      description: strategy.description || "",
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      market_type: strategy.market_type,

      current_metrics: {
        sharpe_ratio: strategy.current_sharpe || 0,
        max_drawdown: (strategy.max_drawdown || 0) * 100,
        win_rate: (strategy.win_rate || 0) * 100,
        profit_factor: 1.0,
        total_return: (strategy.total_return || 0) * 100,
      },

      risk_metrics: riskMetrics,

      recent_backtests: recentBacktests.map((bt: any) => ({
        id: bt.id,
        timestamp: new Date(bt.created_at).toISOString(),
        duration_days: calculateDays(bt.start_date, bt.end_date),
        total_return: (bt.total_return || 0) * 100,
        sharpe_ratio: bt.sharpe_ratio || 0,
        max_drawdown: (bt.max_drawdown || 0) * 100,
        win_rate: (bt.win_rate || 0) * 100,
      })),

      equity_curve: equityCurve,
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

/**
 * Generate synthetic equity curve based on strategy metrics
 */
function generateEquityCurve(
  initialCapital: number,
  totalReturn: number,
  maxDrawdown: number,
  days: number
): Array<{ timestamp: string; value: number }> {
  const curve: Array<{ timestamp: string; value: number }> = [];
  let currentValue = initialCapital;
  const dailyReturn = totalReturn / days;

  for (let i = 0; i <= days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i));

    // Add some realistic volatility
    const volatility = (Math.random() - 0.5) * 0.02;
    const dayReturn = dailyReturn + volatility;
    currentValue = currentValue * (1 + dayReturn);

    // Apply drawdown constraint
    const minValue = initialCapital * (1 - Math.abs(maxDrawdown));
    currentValue = Math.max(currentValue, minValue);

    curve.push({
      timestamp: date.toISOString().split("T")[0],
      value: Math.round(currentValue * 100) / 100,
    });
  }

  return curve;
}

/**
 * Calculate derived risk metrics
 */
function calculateRiskMetrics(
  totalReturn: number,
  sharpeRatio: number,
  maxDrawdown: number,
  winRate: number
) {
  return {
    sortino_ratio: sharpeRatio * 1.2, // Sortino is typically higher than Sharpe
    calmar_ratio: totalReturn > 0 ? totalReturn / Math.max(maxDrawdown, 0.01) : 0,
    recovery_factor: totalReturn > 0 ? totalReturn / Math.max(maxDrawdown, 0.01) : 0,
    var_95: -maxDrawdown, // 95% VaR is approximately the max drawdown
  };
}

/**
 * Calculate days between two dates
 */
function calculateDays(startDate: string | Date, endDate: string | Date): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
