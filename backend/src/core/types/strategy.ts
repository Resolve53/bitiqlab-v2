/**
 * Core Strategy Types
 * Defines the data structures for trading strategies in Bitiq Lab
 */

export type StrategyStatus =
  | "draft"
  | "backtested"
  | "optimized"
  | "paper_trading"
  | "approved"
  | "disabled";

export type MarketType = "spot" | "futures";
export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
export type TradeDirection = "long" | "short";
export type ExitReason = "stop_loss" | "take_profit" | "manual" | "timeout";

/**
 * Entry and exit rule definitions
 * Can be expressed as JSON logic or indicator conditions
 */
export interface EntryRules {
  [key: string]: any;
  // Example:
  // conditions: "RSI < 30 AND MACD_histogram > 0"
  // indicators: ["RSI", "MACD"]
  // confirmation_timeframe?: "1h"
}

export interface ExitRules {
  [key: string]: any;
  // Example:
  // stop_loss_percent?: -2
  // take_profit_percent?: 5
  // time_based_exit?: "4h"
  // trailing_stop?: true
}

export interface PositionSizing {
  [key: string]: any;
  // Example:
  // risk_per_trade: 2,  // percent
  // max_concurrent_positions: 5
  // position_size: "fixed" | "kelly" | "volatility_adjusted"
  // max_leverage?: 3
}

/**
 * Main Strategy Model
 */
export interface Strategy {
  id: string;  // UUID
  name: string;
  description: string;

  // Market Parameters
  symbol: string;  // BTCUSDT, ETHUSDT, etc.
  timeframe: Timeframe;
  market_type: MarketType;
  leverage: number;  // 1 for spot, 1-5 for futures

  // Strategy Rules (from LLM)
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  position_sizing: PositionSizing;

  // Lifecycle
  status: StrategyStatus;
  version: number;

  // Metadata
  created_at: Date;
  updated_at: Date;
  created_by: string;  // User/admin ID
  git_commit_hash?: string;  // Track strategy version control

  // Performance tracking
  current_sharpe?: number;
  current_max_drawdown?: number;
  backtest_count: number;
  last_backtest_date?: Date;
}

/**
 * Strategy Update Request
 */
export interface UpdateStrategyRequest {
  name?: string;
  description?: string;
  entry_rules?: EntryRules;
  exit_rules?: ExitRules;
  position_sizing?: PositionSizing;
  status?: StrategyStatus;
}

/**
 * Strategy Version History
 */
export interface StrategyVersion {
  version: number;
  strategy_id: string;
  git_commit_hash: string;
  created_at: Date;
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  position_sizing: PositionSizing;
  backtest_results?: BacktestRun;
}
