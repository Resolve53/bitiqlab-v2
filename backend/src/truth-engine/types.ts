/**
 * Phase 1 Truth Engine — shared types
 *
 * Execution model:
 * - Indicators/rules evaluate on CLOSED candle N only (no future bars).
 * - Entry/exit strategy signals confirmed at close of N execute at OPEN of N+1.
 * - After entry fill at open of N+1, that same bar's OHLC is checked for SL/TP.
 * - Same-bar SL+TP → adverse first (intrabarConflict=true).
 * - Gap through SL/TP → fill at worse executable open (+ slippage), not the
 *   unattainable stop/target level.
 * - Direction is NEVER inferred from indicators; each entry setup is explicit.
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

/** One directional entry setup with an explicit boolean condition tree. */
export interface DirectionalEntrySetup {
  direction: TradeDirection;
  condition: Rule;
}

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
  /** Explicit directional entry setups — no direction guessing. */
  entries: DirectionalEntrySetup[];
  /** Optional strategy-exit boolean tree (applies while in a position). */
  exitCondition: Rule | null;
  risk: StrategyRiskConfig;
  fees?: StrategyFeesConfig;
  /** Futures leverage; spot must be 1. */
  leverage: number;
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
  /** Configured risk before capital capping */
  requestedRiskUsd: number;
  /** Risk after capital/margin cap */
  actualRiskUsd: number;
  /** Alias of actualRiskUsd (compat) */
  initialRiskUsd: number;
  capitalCapped: boolean;
  realizedR: number;
  mfe: number;
  mae: number;
  exitReason: ExitReason;
  entryConditions: ConditionSnapshot;
  exitConditions: ConditionSnapshot;
  leverage: number;
  marginUsed: number;
  intrabarConflict: boolean;
  gapFill: boolean;
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
  leverage?: number;
  bars?: OHLCVBar[];
}
