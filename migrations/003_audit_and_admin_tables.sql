-- Audit and Admin Tables
-- Tracking changes, decisions, and user actions

-- Audit Log Table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,  -- 'strategy', 'backtest', 'paper_trading', etc.
  entity_id UUID,

  -- User action
  user_id UUID,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Change details
  old_values JSONB,
  new_values JSONB,

  -- Additional context
  description TEXT,
  metadata JSONB
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- Strategy Status Change History
CREATE TABLE strategy_status_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  old_status strategy_status,
  new_status strategy_status NOT NULL,

  reason TEXT,
  admin_notes TEXT,

  changed_by UUID,
  changed_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(strategy_id, changed_at)
);

CREATE INDEX idx_status_changes_strategy_id ON strategy_status_changes(strategy_id);
CREATE INDEX idx_status_changes_changed_at ON strategy_status_changes(changed_at DESC);

-- Promotion Records (when strategy is promoted to live trading)
CREATE TABLE promotion_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Source of promotion decision
  paper_trading_session_id UUID REFERENCES paper_trading_sessions(id),
  evaluation_id UUID REFERENCES paper_trading_evaluations(id),

  -- Promotion details
  promoted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  promoted_by UUID,

  -- Promotion conditions at time of promotion
  final_sharpe DECIMAL(10, 4),
  final_win_rate DECIMAL(5, 4),
  final_max_drawdown DECIMAL(5, 4),
  trades_during_paper_trading INTEGER,
  days_of_paper_trading INTEGER,

  -- Promotion notes
  promotion_notes TEXT,

  -- Performance after promotion (filled in later)
  live_start_date TIMESTAMP,
  live_sharpe DECIMAL(10, 4),
  live_status VARCHAR(50),  -- 'active', 'suspended', 'stopped'

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_promotions_strategy_id ON promotion_records(strategy_id);
CREATE INDEX idx_promotions_promoted_at ON promotion_records(promoted_at DESC);
CREATE INDEX idx_promotions_live_status ON promotion_records(live_status);

-- Research Session Log
-- Tracks LLM research iterations for a strategy
CREATE TABLE research_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

  -- Research campaign details
  campaign_name VARCHAR(255),
  status VARCHAR(50),  -- 'active', 'paused', 'completed'

  start_time TIMESTAMP NOT NULL DEFAULT NOW(),
  end_time TIMESTAMP,

  -- Research parameters
  target_metric VARCHAR(50),  -- 'sharpe_ratio', 'profit_factor', etc.
  max_iterations INTEGER,
  current_iteration INTEGER DEFAULT 0,

  -- Results
  baseline_metric DECIMAL(10, 4),
  best_metric DECIMAL(10, 4),
  improvements_made INTEGER DEFAULT 0,

  -- Details
  research_notes TEXT,
  improvements_log JSONB,  -- Array of improvements applied

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_research_sessions_strategy_id ON research_sessions(strategy_id);
CREATE INDEX idx_research_sessions_status ON research_sessions(status);

-- Research Iteration Log
-- Individual iterations within a research session
CREATE TABLE research_iterations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  research_session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

  iteration_number INTEGER NOT NULL,

  -- Changes applied
  changes_made JSONB,  -- Parameters modified

  -- Before metrics
  metric_before DECIMAL(10, 4),

  -- Backtest run
  backtest_run_id UUID REFERENCES backtest_runs(id),

  -- After metrics
  metric_after DECIMAL(10, 4),
  improvement DECIMAL(10, 4),  -- metric_after - metric_before

  -- Decision
  kept BOOLEAN,  -- true if improvement was kept (committed)
  reason TEXT,

  git_commit_hash VARCHAR(40),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(research_session_id, iteration_number)
);

CREATE INDEX idx_research_iterations_session_id ON research_iterations(research_session_id);
CREATE INDEX idx_research_iterations_strategy_id ON research_iterations(strategy_id);
CREATE INDEX idx_research_iterations_kept ON research_iterations(kept);

-- Dashboard Metrics Cache
-- For quick dashboard queries
CREATE TABLE dashboard_metrics_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  metric_type VARCHAR(100),  -- 'total_strategies', 'active_paper_trading', etc.
  metric_value DECIMAL(20, 4),
  metric_count INTEGER,

  -- Breakdown
  details JSONB,

  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_metrics_cache_type ON dashboard_metrics_cache(metric_type);
CREATE INDEX idx_metrics_cache_expires ON dashboard_metrics_cache(expires_at);
