/**
 * Paper Trading Types
 * Defines structures for paper (demo account) trading simulation
 */

import { Trade } from "./backtest";

export type PaperTradingSessionStatus =
  | "active"
  | "completed"
  | "failed"
  | "paused";

/**
 * Paper Trading Session
 * Tracks a continuous paper trading experiment with a specific strategy
 */
export interface PaperTradingSession {
  id: string;  // UUID
  strategy_id: string;
  version: number;

  // Duration
  start_date: Date;
  end_date?: Date;  // null if still active
  status: PaperTradingSessionStatus;

  // Account
  paper_account_id: string;  // Reference to Binance testnet account
  initial_balance: number;  // Starting capital in USD
  current_balance: number;

  // Trade Results
  trades: Trade[];
  total_trades: number;
  win_rate: number;
  loss_rate: number;
  total_pnl: number;  // Cumulative P&L in USD
  total_pnl_percent: number;

  // Risk Metrics
  max_drawdown: number;
  max_concurrent_positions: number;
  average_winning_trade: number;
  average_losing_trade: number;
  profit_factor: number;

  // Performance Metrics
  sharpe_ratio?: number;
  sortino_ratio?: number;
  daily_returns?: number[];

  // Validation Status
  meets_min_trades: boolean;  // >= 30 trades
  meets_min_duration: boolean;  // >= 14 days
  passes_stability_checks: boolean;
  validation_status: "pending" | "passed" | "failed";

  // Metadata
  created_at: Date;
  updated_at: Date;
  notes?: string;

  // Binance integration
  binance_api_key?: string;
  binance_secret?: string;
  use_testnet: boolean;
}

/**
 * Paper Trading Start Request
 */
export interface StartPaperTradingRequest {
  strategy_id: string;
  version?: number;
  paper_account_id?: string;
  initial_balance?: number;  // Default: 10000 USD
  use_testnet: boolean;
}

/**
 * Paper Trading Signal - Real-time signal execution
 */
export interface PaperTradingSignal {
  id: string;  // UUID
  session_id: string;
  timestamp: Date;

  // Signal details
  symbol: string;
  direction: "long" | "short";
  entry_price: number;
  stop_loss: number;
  take_profit: number;

  // Position sizing
  quantity: number;
  position_size_usd: number;
  risk_amount: number;

  // Trigger
  indicators: Record<string, any>;  // Values of indicators that triggered signal
  timeframe: string;

  // Status
  status: "pending" | "executed" | "rejected" | "failed";
  execution_price?: number;
  execution_time?: Date;
  error_message?: string;

  // Linked trade
  trade_id?: string;  // Reference to Trade once executed
}

/**
 * Paper Trading Performance Summary
 */
export interface PaperTradingPerformanceSummary {
  session_id: string;
  total_days_trading: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;

  gross_profit: number;
  gross_loss: number;
  net_profit: number;
  profit_factor: number;

  largest_win: number;
  largest_loss: number;
  average_win: number;
  average_loss: number;
  avg_r_r: number;  // Average risk/reward ratio

  max_drawdown: number;
  recovery_factor: number;  // net_profit / max_drawdown
  sharpe_ratio: number;

  // Comparisons
  backtest_vs_paper_correlation: number;  // How well does it match backtest?
  backtest_sharpe: number;
  paper_sharpe: number;
  degradation_percent: number;  // How much worse than backtest?
}

/**
 * Paper Trading Evaluation Result
 * Used when deciding whether to promote to live trading
 */
export interface PaperTradingEvaluation {
  session_id: string;
  evaluation_date: Date;

  // Validation checks
  has_minimum_trades: boolean;  // 30+ trades
  has_minimum_duration: boolean;  // 14+ days
  has_positive_pnl: boolean;
  sharpe_ratio_acceptable: boolean;  // Sharpe > 0.5
  drawdown_acceptable: boolean;  // Max drawdown < 20%
  stability_check_passed: boolean;  // Consistent performance

  // Overall decision
  ready_for_promotion: boolean;
  confidence_score: number;  // 0-100%

  // Reasons & recommendations
  issues: string[];  // List of problems if any
  recommendations: string[];  // Suggestions for improvement
  next_steps: "approve" | "extend_testing" | "reoptimize" | "disable";
}

/**
 * Binance Paper Trading Configuration
 */
export interface BinancePaperTradingConfig {
  api_key: string;
  api_secret: string;
  use_testnet: boolean;
  testnet_url?: string;
  rate_limit_ms: number;  // Milliseconds between API calls
  commission_percent: number;  // Binance commission: 0.1% default
}
