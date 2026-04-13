/**
 * Backtest Types
 * Defines structures for backtesting and performance metrics
 */

export type BacktestWindow = "12m" | "6m" | "3m";
export type OptimizationMethod = "grid_search" | "bayesian" | "genetic";

/**
 * Backtest Run - Results from a single backtest execution
 */
export interface BacktestRun {
  id: string;  // UUID
  strategy_id: string;
  version: number;

  // Test Period
  window: BacktestWindow;
  start_date: Date;
  end_date: Date;

  // Performance Metrics
  total_trades: number;
  win_rate: number;  // 0-1 (0.52 = 52%)
  profit_factor: number;  // gross_profit / gross_loss
  sharpe_ratio: number;
  sortino_ratio: number;  // Sharpe but only considering downside volatility
  max_drawdown: number;  // 0-1 (0.15 = 15%)
  avg_r_r: number;  // Average risk/reward ratio
  total_return: number;  // 0-1 (0.25 = 25% return)

  // Quality Metrics
  out_of_sample_sharpe?: number;  // For walk-forward validation
  overfitting_score?: number;  // in_sample_sharpe / out_of_sample_sharpe

  // Detailed Results
  trades: Trade[];
  daily_returns?: number[];  // For Sharpe calculation
  equity_curve?: EquityPoint[];

  // Metadata
  created_at: Date;
  test_duration_minutes: number;
  data_points: number;  // Number of bars tested
}

/**
 * Walk-Forward Validation Results
 * Tests strategy on multiple rolling windows to avoid overfitting
 */
export interface WalkForwardResult {
  strategy_id: string;
  version: number;

  // Overall metrics across all windows
  avg_sharpe: number;
  avg_max_drawdown: number;
  consistency_score: number;  // How stable is performance across windows

  // Per-window breakdown
  windows: WalkForwardWindow[];

  // Overfitting detection
  is_overfit: boolean;
  overfitting_ratio: number;  // in_sample / out_of_sample Sharpe

  created_at: Date;
}

/**
 * Single window in walk-forward analysis
 */
export interface WalkForwardWindow {
  window_number: number;
  train_start: Date;
  train_end: Date;
  test_start: Date;
  test_end: Date;

  // In-sample (training) results
  train_sharpe: number;
  train_trades: number;

  // Out-of-sample (testing) results
  test_sharpe: number;
  test_trades: number;
  test_max_drawdown: number;
}

/**
 * Trade - Represents a single trade execution
 * Used by both backtest and paper trading
 */
export interface Trade {
  id: string;  // UUID
  strategy_id: string;
  session_id: string;  // Backtest run ID or paper trading session ID

  // Symbol & Market
  symbol: string;  // BTCUSDT
  timeframe: string;
  market_type: "spot" | "futures";
  leverage: number;

  // Entry
  direction: "long" | "short";
  entry_price: number;
  entry_time: Date;
  entry_conditions: Record<string, any>;  // Snapshot of indicators at entry

  // Levels
  stop_loss: number;
  take_profit: number;

  // Exit
  exit_price: number;
  exit_time: Date;
  exit_reason: "stop_loss" | "take_profit" | "manual" | "timeout";

  // Results
  pnl_percent: number;  // -0.02 = -2%, 0.05 = +5%
  pnl_absolute: number;  // USD amount
  r_r_actual: number;  // Actual risk/reward achieved
  max_favorable_excursion: number;  // Best possible exit price
  max_adverse_excursion: number;  // Worst adverse price move
  duration_minutes: number;

  // Metadata
  created_at: Date;
}

/**
 * Equity Curve Point - for visualization
 */
export interface EquityPoint {
  timestamp: Date;
  equity: number;  // Account value at this time
  cumulative_return: number;
}

/**
 * Strategy Optimization Run
 * Results from parameter tuning (grid search, Bayesian, etc)
 */
export interface StrategyOptimizationRun {
  id: string;  // UUID
  strategy_id: string;

  // Optimization details
  parameters_tested: number;
  best_parameters: Record<string, any>;
  best_sharpe: number;
  improvement_vs_baseline: number;  // percent

  // Method used
  method: OptimizationMethod;

  // Detailed improvements
  improvements: ParameterImprovement[];

  // Metadata
  created_at: Date;
  duration_minutes: number;
}

/**
 * Individual parameter improvement found during optimization
 */
export interface ParameterImprovement {
  parameter_name: string;
  old_value: any;
  new_value: any;
  sharpe_change: number;  // +0.15 means Sharpe improved by 0.15
  trades_impact?: number;  // Change in number of trades
}

/**
 * Backtest Configuration Request
 */
export interface BacktestRequest {
  strategy_id: string;
  version: number;
  window?: BacktestWindow;
  start_date?: Date;
  end_date?: Date;
  use_walk_forward?: boolean;  // Run walk-forward validation
  use_out_of_sample?: boolean;  // Holdout last 3 months for validation
}

/**
 * Walk-Forward Validation Request
 */
export interface WalkForwardValidationRequest {
  strategy_id: string;
  version: number;
  window_size_months: number;  // e.g., 3 months per window
  data_period_months: number;  // Total data to analyze, e.g., 12
}
