/**
 * Bitiq Lab Truth Engine — Phase 1
 * Deterministic strategy evaluation + real OHLCV backtesting.
 */

export * from "./types";
export {
  buildStrategyDefinition,
  parseConditionText,
  strategyDefinitionSchema,
  StrategyValidationError,
  assertSupportedMarket,
  SUPPORTED_SYMBOLS,
  SUPPORTED_TIMEFRAMES,
} from "./strategy-schema";
export {
  buildIndicatorSeries,
  calcRSI,
  calcSMA,
  calcEMA,
  calcMACD,
  calcBollinger,
} from "./indicators";
export {
  evaluateRules,
  generateSignals,
  shouldExitAtBar,
} from "./rule-evaluator";
export {
  fetchHistoricalOHLCV,
  normalizeBars,
  detectMissingBars,
  MarketDataError,
} from "./market-data";
export { applySlippage, entrySide, exitSide } from "./slippage";
export { TruthBacktestExecutor } from "./executor";
export { calculateMetrics, calcMaxDrawdown } from "./metrics";
export { runTruthBacktest, windowToDateRange } from "./orchestrator";
