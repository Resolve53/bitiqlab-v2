-- Bitiq Lab Database Schema - Initial Setup
-- Created for Supabase PostgreSQL

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE market_type AS ENUM ('spot', 'futures');
CREATE TYPE strategy_status AS ENUM (
  'draft',
  'backtested',
  'optimized',
  'paper_trading',
  'approved',
  'disabled'
);
CREATE TYPE trade_direction AS ENUM ('long', 'short');
CREATE TYPE exit_reason AS ENUM (
  'stop_loss',
  'take_profit',
  'manual',
  'timeout'
);
CREATE TYPE paper_trading_status AS ENUM (
  'active',
  'completed',
  'failed',
  'paused'
);
CREATE TYPE validation_status AS ENUM ('pending', 'passed', 'failed');
CREATE TYPE optimization_method AS ENUM ('grid_search', 'bayesian', 'genetic');

-- Strategies Table
CREATE TABLE strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Market parameters
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  market_type market_type NOT NULL DEFAULT 'spot',
  leverage DECIMAL(4, 2) DEFAULT 1,

  -- Strategy rules (stored as JSONB for flexibility)
  entry_rules JSONB NOT NULL,
  exit_rules JSONB NOT NULL,
  position_sizing JSONB NOT NULL,

  -- Lifecycle
  status strategy_status DEFAULT 'draft',
  version INTEGER DEFAULT 1,

  -- Performance metrics
  current_sharpe DECIMAL(10, 4),
  current_max_drawdown DECIMAL(5, 4),
  backtest_count INTEGER DEFAULT 0,
  last_backtest_date TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  git_commit_hash VARCHAR(40),

  -- Indexing for fast queries
  CONSTRAINT valid_leverage CHECK (leverage >= 1 AND leverage <= 10),
  CONSTRAINT valid_sharpe CHECK (current_sharpe IS NULL OR current_sharpe > -10),
  CONSTRAINT valid_drawdown CHECK (current_max_drawdown IS NULL OR (current_max_drawdown >= 0 AND current_max_drawdown <= 1))
);

CREATE INDEX idx_strategies_status ON strategies(status);
CREATE INDEX idx_strategies_symbol_timeframe ON strategies(symbol, timeframe);
CREATE INDEX idx_strategies_created_by ON strategies(created_by);
CREATE INDEX idx_strategies_updated_at ON strategies(updated_at);

-- Strategy Versions Table
CREATE TABLE strategy_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Rules snapshot
  entry_rules JSONB NOT NULL,
  exit_rules JSONB NOT NULL,
  position_sizing JSONB NOT NULL,

  -- Git tracking
  git_commit_hash VARCHAR(40),

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(strategy_id, version)
);

CREATE INDEX idx_strategy_versions_strategy_id ON strategy_versions(strategy_id);
CREATE INDEX idx_strategy_versions_git_commit ON strategy_versions(git_commit_hash);

-- Backtest Runs Table
CREATE TABLE backtest_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Test period
  window VARCHAR(10),  -- '12m', '6m', '3m'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Performance metrics
  total_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 4),
  profit_factor DECIMAL(10, 4),
  sharpe_ratio DECIMAL(10, 4),
  sortino_ratio DECIMAL(10, 4),
  max_drawdown DECIMAL(5, 4),
  avg_r_r DECIMAL(10, 4),  -- Risk/Reward ratio
  total_return DECIMAL(5, 4),

  -- Quality metrics
  out_of_sample_sharpe DECIMAL(10, 4),
  overfitting_score DECIMAL(10, 4),

  -- Analysis
  data_points INTEGER,
  test_duration_minutes INTEGER,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_metrics CHECK (
    total_trades >= 0 AND
    (win_rate IS NULL OR (win_rate >= 0 AND win_rate <= 1)) AND
    (max_drawdown IS NULL OR (max_drawdown >= 0 AND max_drawdown <= 1))
  )
);

CREATE INDEX idx_backtest_runs_strategy_id ON backtest_runs(strategy_id, version);
CREATE INDEX idx_backtest_runs_created_at ON backtest_runs(created_at);
CREATE INDEX idx_backtest_runs_sharpe ON backtest_runs(sharpe_ratio DESC);

-- Trades Table (for both backtest and paper trading)
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,  -- Backtest run ID or paper trading session ID

  -- Symbol & market
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  market_type market_type NOT NULL,
  leverage DECIMAL(4, 2) DEFAULT 1,

  -- Entry
  direction trade_direction NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  entry_time TIMESTAMP NOT NULL,
  entry_conditions JSONB,

  -- Levels
  stop_loss DECIMAL(20, 8) NOT NULL,
  take_profit DECIMAL(20, 8) NOT NULL,

  -- Exit
  exit_price DECIMAL(20, 8) NOT NULL,
  exit_time TIMESTAMP NOT NULL,
  exit_reason exit_reason NOT NULL,

  -- Results
  pnl_percent DECIMAL(10, 4) NOT NULL,
  pnl_absolute DECIMAL(20, 8),
  r_r_actual DECIMAL(10, 4),
  max_favorable_excursion DECIMAL(10, 4),
  max_adverse_excursion DECIMAL(10, 4),
  duration_minutes INTEGER,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_prices CHECK (
    entry_price > 0 AND
    stop_loss > 0 AND
    take_profit > 0 AND
    exit_price > 0
  ),
  CONSTRAINT valid_duration CHECK (duration_minutes IS NULL OR duration_minutes >= 0)
);

CREATE INDEX idx_trades_strategy_id ON trades(strategy_id);
CREATE INDEX idx_trades_session_id ON trades(session_id);
CREATE INDEX idx_trades_entry_time ON trades(entry_time);
CREATE INDEX idx_trades_pnl ON trades(pnl_percent);

-- Walk-Forward Results Table
CREATE TABLE walk_forward_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Overall metrics
  avg_sharpe DECIMAL(10, 4),
  avg_max_drawdown DECIMAL(5, 4),
  consistency_score DECIMAL(5, 4),

  -- Overfitting detection
  is_overfit BOOLEAN DEFAULT FALSE,
  overfitting_ratio DECIMAL(10, 4),

  -- Detailed windows stored as JSONB
  windows JSONB NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_walk_forward_strategy_id ON walk_forward_results(strategy_id, version);

-- Optimization Runs Table
CREATE TABLE optimization_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

  -- Optimization details
  parameters_tested INTEGER,
  best_parameters JSONB NOT NULL,
  best_sharpe DECIMAL(10, 4),
  improvement_vs_baseline DECIMAL(5, 4),

  -- Method
  method optimization_method,

  -- Results
  improvements JSONB,  -- Array of improvements

  duration_minutes INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_optimization_runs_strategy_id ON optimization_runs(strategy_id);
