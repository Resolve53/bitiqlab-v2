/**
 * Phase 1 Truth Engine — shared types
 *
 * Execution model (documented):
 * - Indicators and rules evaluate on CLOSED candle N only (no future bars).
 * - Entry/exit strategy signals confirmed at close of N execute at OPEN of N+1.
 * - Stop-loss / take-profit are checked intrabar on each candle after entry
 *   using OHLC. If both SL and TP are touched in the same candle, the adverse
 *   event is assumed first (conservative). Recorded as intrabar_conflict=true.
 */

export type MarketType = "spot" | "futures";
export type TradeDirection = "long" | "short";
export type ResultSource = "REAL_BACKTEST" | "SIMULATED_LEGACY";

export type IndicatorKind =
  | "rsi"
  | "sma"
  | "ema"
  | "macd"
  | "bollinger"
  | "volume"
  | "price";

export type RuleOperator =
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "cross_above"
  | "cross_below";

export type MacdField = "line" | "signal" | "histogram";
export type BollingerField = "upper" | "middle" | "lower";
export type PriceField = "open" | "high" | "low" | "close";

export interface CompareToIndicator {
  indicator: IndicatorKind;
  period?: number;
  field?: string;
}

export interface IndicatorRule {
  type: "indicator";
  indicator: IndicatorKind;
  timeframe?: string;
  period?: number;
  field?: string;
  operator: RuleOperator;
  value: number | CompareToIndicator;
}

export interface GroupRule {
  type: "group";
  op: "and" | "or";
  rules: Rule[];
}

export type Rule = IndicatorRule | GroupRule;

export interface StrategyRiskConfig {
  riskPerTradePct: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  minimumRR?: number;
  maxConcurrentPositions?: number;
  maxHoldBars?: number;
}

export interface StrategyFeesConfig {
  commissionPct?: number;
  slippagePct?: number;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  version: number;
  marketType: MarketType;
  symbol: string;
  biasTimeframe?: string;
  confirmationTimeframe?: string;
  entryTimeframe: string;
  allowedDirections: TradeDirection[];
  entryRules: Rule[];
  exitRules: Rule[];
  risk: StrategyRiskConfig;
  fees?: StrategyFeesConfig;
}

export interface OHLCVBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataMeta {
  provider: string;
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
  bars: number;
}

export interface ConditionSnapshot {
  [key: string]: number | boolean | string | null;
}

export interface EvaluatedSignal {
  barIndex: number;
  timestamp: Date;
  action: "entry" | "exit";
  direction?: TradeDirection;
  conditions: ConditionSnapshot;
  passedRules: string[];
}

export type ExitReason =
  | "take_profit"
  | "stop_loss"
  | "strategy_exit"
  | "timeout"
  | "end_of_test";

export interface BacktestTradeRecord {
  entryTime: string;
  exitTime: string;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  positionNotional: number;
  stopLoss: number;
  takeProfit: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  pnlPctOnPosition: number;
  pnlPctOnEquity: number;
  initialRiskUsd: number;
  realizedR: number;
  mfe: number;
  mae: number;
  exitReason: ExitReason;
  entryConditions: ConditionSnapshot;
  exitConditions: ConditionSnapshot;
  leverage: number;
  marginUsed: number;
  intrabarConflict: boolean;
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  cumulativeReturn: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  totalReturn: number;
  profitFactor: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  expectancy: number | null;
  averageRealizedR: number | null;
  maxDrawdown: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageTradeDurationMs: number | null;
  exposureTime: number;
  finalEquity: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  equityCurve: EquityPoint[];
}

export interface BacktestProvenance {
  strategyId: string;
  strategyVersion: number;
  strategyDefinitionSnapshot: StrategyDefinition;
  marketData: MarketDataMeta;
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
  bars: number;
  initialCapital: number;
  commissionPct: number;
  slippagePct: number;
  executionModel: "signal_close_n_execute_open_n1";
  timestamp: string;
  resultSource: ResultSource;
}

export interface BacktestRunResult {
  resultSource: ResultSource;
  metrics: BacktestMetrics;
  trades: BacktestTradeRecord[];
  provenance: BacktestProvenance;
  signals: EvaluatedSignal[];
}

export interface BacktestRunRequest {
  strategyId: string;
  symbol?: string;
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  window?: string;
  initialCapital?: number;
  commissionPct?: number;
  slippagePct?: number;
  /** Injected OHLCV for tests — never used for silent production fallback */
  bars?: OHLCVBar[];
}
