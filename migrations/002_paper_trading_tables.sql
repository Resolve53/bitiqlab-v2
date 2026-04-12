-- Paper Trading Tables
-- Created for Bitiq Lab

-- Paper Trading Sessions Table
CREATE TABLE paper_trading_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Duration
  start_date TIMESTAMP NOT NULL DEFAULT NOW(),
  end_date TIMESTAMP,
  status paper_trading_status DEFAULT 'active',

  -- Account details
  paper_account_id VARCHAR(255),
  initial_balance DECIMAL(20, 2) NOT NULL DEFAULT 10000,
  current_balance DECIMAL(20, 2) NOT NULL DEFAULT 10000,

  -- Trade results
  total_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 4),
  loss_rate DECIMAL(5, 4),
  total_pnl DECIMAL(20, 2) DEFAULT 0,
  total_pnl_percent DECIMAL(5, 4) DEFAULT 0,

  -- Risk metrics
  max_drawdown DECIMAL(5, 4),
  max_concurrent_positions INTEGER,
  average_winning_trade DECIMAL(20, 2),
  average_losing_trade DECIMAL(20, 2),
  profit_factor DECIMAL(10, 4),

  -- Performance metrics
  sharpe_ratio DECIMAL(10, 4),
  sortino_ratio DECIMAL(10, 4),
  daily_returns JSONB,  -- Array of daily returns

  -- Validation status
  meets_min_trades BOOLEAN DEFAULT FALSE,
  meets_min_duration BOOLEAN DEFAULT FALSE,
  passes_stability_checks BOOLEAN DEFAULT FALSE,
  validation_status validation_status DEFAULT 'pending',

  -- Binance integration
  use_testnet BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  notes TEXT,

  CONSTRAINT valid_balance CHECK (current_balance >= 0),
  CONSTRAINT valid_metrics CHECK (
    (win_rate IS NULL OR (win_rate >= 0 AND win_rate <= 1)) AND
    (max_drawdown IS NULL OR (max_drawdown >= 0 AND max_drawdown <= 1))
  )
);

CREATE INDEX idx_paper_trading_sessions_strategy_id ON paper_trading_sessions(strategy_id);
CREATE INDEX idx_paper_trading_sessions_status ON paper_trading_sessions(status);
CREATE INDEX idx_paper_trading_sessions_start_date ON paper_trading_sessions(start_date);
CREATE INDEX idx_paper_trading_sessions_validation ON paper_trading_sessions(validation_status);

-- Paper Trading Signals Table
CREATE TABLE paper_trading_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES paper_trading_sessions(id) ON DELETE CASCADE,

  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Signal details
  symbol VARCHAR(20) NOT NULL,
  direction trade_direction NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  stop_loss DECIMAL(20, 8) NOT NULL,
  take_profit DECIMAL(20, 8) NOT NULL,

  -- Position sizing
  quantity DECIMAL(20, 8) NOT NULL,
  position_size_usd DECIMAL(20, 2) NOT NULL,
  risk_amount DECIMAL(20, 2) NOT NULL,

  -- Trigger info
  indicators JSONB,  -- Indicator values that triggered signal
  timeframe VARCHAR(10),

  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, executed, rejected, failed
  execution_price DECIMAL(20, 8),
  execution_time TIMESTAMP,
  error_message TEXT,

  -- Linked trade
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_signal_prices CHECK (
    entry_price > 0 AND stop_loss > 0 AND take_profit > 0 AND quantity > 0
  )
);

CREATE INDEX idx_signals_session_id ON paper_trading_signals(session_id);
CREATE INDEX idx_signals_status ON paper_trading_signals(status);
CREATE INDEX idx_signals_timestamp ON paper_trading_signals(timestamp);
CREATE INDEX idx_signals_trade_id ON paper_trading_signals(trade_id);

-- Paper Trading Performance Summary (Cached)
-- Updated periodically for dashboard performance
CREATE TABLE paper_trading_performance_cache (
  session_id UUID PRIMARY KEY REFERENCES paper_trading_sessions(id) ON DELETE CASCADE,

  total_days_trading INTEGER,
  total_trades INTEGER,
  winning_trades INTEGER,
  losing_trades INTEGER,
  win_rate DECIMAL(5, 4),

  gross_profit DECIMAL(20, 2),
  gross_loss DECIMAL(20, 2),
  net_profit DECIMAL(20, 2),
  profit_factor DECIMAL(10, 4),

  largest_win DECIMAL(20, 2),
  largest_loss DECIMAL(20, 2),
  average_win DECIMAL(20, 2),
  average_loss DECIMAL(20, 2),
  avg_r_r DECIMAL(10, 4),

  max_drawdown DECIMAL(5, 4),
  recovery_factor DECIMAL(10, 4),
  sharpe_ratio DECIMAL(10, 4),

  backtest_vs_paper_correlation DECIMAL(5, 4),
  backtest_sharpe DECIMAL(10, 4),
  paper_sharpe DECIMAL(10, 4),
  degradation_percent DECIMAL(5, 4),

  updated_at TIMESTAMP DEFAULT NOW()
);

-- Paper Trading Evaluation Results
CREATE TABLE paper_trading_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES paper_trading_sessions(id) ON DELETE CASCADE,

  evaluation_date TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Validation checks
  has_minimum_trades BOOLEAN,
  has_minimum_duration BOOLEAN,
  has_positive_pnl BOOLEAN,
  sharpe_ratio_acceptable BOOLEAN,
  drawdown_acceptable BOOLEAN,
  stability_check_passed BOOLEAN,

  -- Overall decision
  ready_for_promotion BOOLEAN DEFAULT FALSE,
  confidence_score DECIMAL(3, 0),  -- 0-100

  -- Details
  issues TEXT[],  -- Array of issue descriptions
  recommendations TEXT[],  -- Array of recommendations
  next_steps VARCHAR(50),  -- 'approve', 'extend_testing', 'reoptimize', 'disable'

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

CREATE INDEX idx_evaluations_session_id ON paper_trading_evaluations(session_id);
CREATE INDEX idx_evaluations_ready_for_promotion ON paper_trading_evaluations(ready_for_promotion);
CREATE INDEX idx_evaluations_created_at ON paper_trading_evaluations(created_at DESC);
