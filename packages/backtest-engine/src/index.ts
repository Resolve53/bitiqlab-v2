/**
 * Backtest Engine
 * Complete backtesting solution with metrics calculation and validation
 */

export { BacktestExecutor } from "./engine/backtest-executor";
export type {
  OHLCVBar,
  StrategySignal,
  BacktestConfig,
} from "./engine/backtest-executor";

export { WalkForwardValidator, OutOfSampleValidator } from "./validators/walk-forward-validator";
export type { WalkForwardConfig } from "./validators/walk-forward-validator";
