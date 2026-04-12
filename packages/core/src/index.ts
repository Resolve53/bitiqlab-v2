/**
 * Core Types and Utilities Export
 * Main entry point for @bitiqlab/core
 */

// Strategy types
export type {
  Strategy,
  StrategyStatus,
  MarketType,
  Timeframe,
  TradeDirection,
  ExitReason,
  EntryRules,
  ExitRules,
  PositionSizing,
  UpdateStrategyRequest,
  StrategyVersion,
} from "./types/strategy";

// Backtest types
export type {
  BacktestRun,
  BacktestWindow,
  BacktestRequest,
  Trade,
  EquityPoint,
  WalkForwardResult,
  WalkForwardWindow,
  WalkForwardValidationRequest,
  StrategyOptimizationRun,
  ParameterImprovement,
  OptimizationMethod,
} from "./types/backtest";

// Paper trading types
export type {
  PaperTradingSession,
  PaperTradingSessionStatus,
  StartPaperTradingRequest,
  PaperTradingSignal,
  PaperTradingPerformanceSummary,
  PaperTradingEvaluation,
  BinancePaperTradingConfig,
} from "./types/paper-trading";

// Constants
export const TRADING_CONSTANTS = {
  MIN_PAPER_TRADING_DAYS: 14,
  MIN_PAPER_TRADING_TRADES: 30,
  ACCEPTABLE_MAX_DRAWDOWN: 0.2,  // 20%
  ACCEPTABLE_SHARPE_RATIO: 0.5,
  MINIMUM_BACKTEST_DATA_POINTS: 50,
  OVERFITTING_THRESHOLD: 1.3,  // In-sample Sharpe / Out-of-sample Sharpe
};

// Utility functions
export function isValidTimeframe(tf: string): boolean {
  const validTimeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
  return validTimeframes.includes(tf);
}

export function calculateRiskReward(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  direction: "long" | "short"
): number {
  if (direction === "long") {
    const risk = entryPrice - stopLoss;
    const reward = takeProfit - entryPrice;
    return risk > 0 ? reward / risk : 0;
  } else {
    const risk = stopLoss - entryPrice;
    const reward = entryPrice - takeProfit;
    return risk > 0 ? reward / risk : 0;
  }
}

export function calculateWinRate(
  wins: number,
  losses: number
): number {
  const total = wins + losses;
  return total > 0 ? wins / total : 0;
}

export function calculateProfitFactor(
  grossProfit: number,
  grossLoss: number
): number {
  return grossLoss !== 0 ? grossProfit / Math.abs(grossLoss) : 0;
}

export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0.02
): number {
  if (returns.length < 2) return 0;

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) /
    returns.length;
  const stdDev = Math.sqrt(variance);

  return stdDev !== 0 ? (meanReturn - riskFreeRate / 252) / stdDev : 0;
}

export function calculateMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;

  let maxDrawdown = 0;
  let peak = equityCurve[0];

  for (const value of equityCurve) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}
