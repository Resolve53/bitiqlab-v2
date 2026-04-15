/**
 * Core Strategy Types
 * Defines the data structures for trading strategies in Bitiq Lab
 * Aligned with 004_bitiqlab_complete_schema.sql
 */

import type { BacktestRun } from './backtest';

export type StrategyStatus = "draft" | "testing" | "approved" | "failed";
export type MarketType = "spot" | "futures";
export type Timeframe = "1h" | "4h" | "1d" | "1w";
export type TradeDirection = "long" | "short";

/**
 * Entry and exit rule definitions
 * Stored as JSONB in database for flexibility
 */
export interface EntryRules {
  [key: string]: any;
}

export interface ExitRules {
  [key: string]: any;
}

export interface AIEnhancement {
  [key: string]: any;
}

/**
 * Main Strategy Model
 * Matches strategies table in migration
 */
export interface Strategy {
  id: string;  // UUID
  name: string;
  description?: string;

  // Market Parameters
  symbol: string;  // BTCUSDT, ETHUSDT, etc.
  timeframe: string;  // 1h, 4h, 1d, etc.
  market_type: string;  // spot, futures

  // Strategy Rules (from LLM)
  entry_rules?: EntryRules;
  exit_rules?: ExitRules;

  // Lifecycle
  status: StrategyStatus;
  current_sharpe: number;
  backtest_count: number;
  winning_trades: number;
  losing_trades: number;
  total_return: number;
  max_drawdown: number;
  win_rate: number;
  confidence_score: number;

  // AI Enhancement tracking
  ai_enhancement?: AIEnhancement;

  // Metadata
  created_by?: string;
  created_at: Date;
  updated_at: Date;

  // Deployment
  deployed_to_bitiq: boolean;
  deployed_at?: Date;
}

/**
 * Strategy creation request
 */
export interface CreateStrategyRequest {
  name: string;
  description?: string;
  symbol: string;
  timeframe: string;
  market_type?: string;
  entry_rules?: EntryRules;
  exit_rules?: ExitRules;
  created_by?: string;
}

/**
 * Strategy Update Request
 */
export interface UpdateStrategyRequest {
  name?: string;
  description?: string;
  entry_rules?: EntryRules;
  exit_rules?: ExitRules;
  status?: StrategyStatus;
  ai_enhancement?: AIEnhancement;
}
