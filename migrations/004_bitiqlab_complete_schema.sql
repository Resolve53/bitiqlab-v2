-- BitiqLab Database Schema
-- Comprehensive tables for strategy building, paper trading, and AI learning

-- 1. STRATEGIES TABLE
CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  market_type TEXT DEFAULT 'spot', -- spot, futures
  entry_rules JSONB,
  exit_rules JSONB,
  status TEXT DEFAULT 'draft', -- draft, testing, approved, failed
  current_sharpe DECIMAL(10,4) DEFAULT 0,
  backtest_count INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  total_return DECIMAL(10,4) DEFAULT 0,
  max_drawdown DECIMAL(10,4) DEFAULT 0,
  win_rate DECIMAL(5,2) DEFAULT 0,
  confidence_score DECIMAL(5,2) DEFAULT 0,
  ai_enhancement JSONB,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deployed_to_bitiq BOOLEAN DEFAULT FALSE,
  deployed_at TIMESTAMP
);

-- 2. STRATEGY COINS TABLE (Many-to-Many)
CREATE TABLE IF NOT EXISTS strategy_coins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  added_at TIMESTAMP DEFAULT NOW()
);

-- 3. PAPER TRADING SESSIONS TABLE
CREATE TABLE IF NOT EXISTS trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  session_name TEXT,
  start_time TIMESTAMP DEFAULT NOW(),
  end_time TIMESTAMP,
  status TEXT DEFAULT 'active', -- active, completed, paused
  initial_balance DECIMAL(15,2),
  current_balance DECIMAL(15,2),
  total_pnl DECIMAL(15,4),
  total_return DECIMAL(10,4),
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2),
  exchange TEXT DEFAULT 'binance',
  is_testnet BOOLEAN DEFAULT TRUE
);

-- 4. PAPER TRADES TABLE
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id),
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- buy, sell
  entry_price DECIMAL(15,8) NOT NULL,
  exit_price DECIMAL(15,8),
  quantity DECIMAL(15,8) NOT NULL,
  entry_time TIMESTAMP DEFAULT NOW(),
  exit_time TIMESTAMP,
  status TEXT DEFAULT 'open', -- open, closed, cancelled
  pnl DECIMAL(15,4),
  pnl_percent DECIMAL(10,4),
  reason_entry TEXT,
  reason_exit TEXT,
  confidence_score DECIMAL(5,2),
  chart_analysis JSONB,
  on_chain_signal JSONB,
  macro_event TEXT
);

-- 5. TRADE SIGNALS TABLE
CREATE TABLE IF NOT EXISTS trade_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL, -- buy, sell
  signal_strength DECIMAL(5,2),
  confidence_score DECIMAL(5,2),
  reasoning TEXT,
  chart_pattern JSONB,
  technical_indicators JSONB,
  on_chain_data JSONB,
  macro_context TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  signal_accuracy DECIMAL(5,2) -- updated after trade executes
);

-- 6. BACKTESTS TABLE
CREATE TABLE IF NOT EXISTS backtests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  symbol TEXT NOT NULL,
  timeframe TEXT,
  start_date DATE,
  end_date DATE,
  initial_balance DECIMAL(15,2),
  final_balance DECIMAL(15,2),
  total_trades INTEGER,
  winning_trades INTEGER,
  losing_trades INTEGER,
  win_rate DECIMAL(5,2),
  profit_factor DECIMAL(10,4),
  sharpe_ratio DECIMAL(10,4),
  max_drawdown DECIMAL(10,4),
  total_return DECIMAL(10,4),
  monthly_returns JSONB,
  trade_list JSONB,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. STRATEGY PERFORMANCE TABLE
CREATE TABLE IF NOT EXISTS strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  period_start DATE,
  period_end DATE,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2),
  average_win DECIMAL(15,4),
  average_loss DECIMAL(15,4),
  profit_factor DECIMAL(10,4),
  total_return DECIMAL(10,4),
  sharpe_ratio DECIMAL(10,4),
  sortino_ratio DECIMAL(10,4),
  max_drawdown DECIMAL(10,4),
  consecutive_wins INTEGER,
  consecutive_losses INTEGER,
  best_trade DECIMAL(15,4),
  worst_trade DECIMAL(15,4),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. AI RESEARCH LOGS TABLE
CREATE TABLE IF NOT EXISTS ai_research_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  iteration INTEGER,
  improvement_type TEXT, -- parameter_optimization, feature_engineering, signal_enhancement
  old_config JSONB,
  new_config JSONB,
  change_description TEXT,
  performance_before JSONB,
  performance_after JSONB,
  improvement_percent DECIMAL(10,4),
  model_used TEXT, -- claude-opus, claude-sonnet, etc
  research_notes TEXT,
  recommended_action TEXT, -- keep, revert, iterate
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. ON-CHAIN DATA TABLE
CREATE TABLE IF NOT EXISTS on_chain_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  metric_type TEXT, -- whale_transactions, funding_rate, open_interest, etc
  value DECIMAL(20,8),
  change_percent DECIMAL(10,4),
  interpretation TEXT,
  signal_strength DECIMAL(5,2),
  source TEXT -- glassnode, santiment, binance, etc
);

-- 10. ECONOMIC CALENDAR TABLE
CREATE TABLE IF NOT EXISTS economic_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  country TEXT,
  event_date TIMESTAMP NOT NULL,
  importance TEXT, -- low, medium, high
  forecast_value TEXT,
  actual_value TEXT,
  previous_value TEXT,
  market_impact TEXT,
  sentiment TEXT, -- positive, negative, neutral
  affected_symbols TEXT[], -- array of symbols affected
  created_at TIMESTAMP DEFAULT NOW()
);

-- 11. STRATEGY AUDIT LOG
CREATE TABLE IF NOT EXISTS strategy_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  action TEXT,
  old_values JSONB,
  new_values JSONB,
  changed_by TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_strategies_status ON strategies(status);
CREATE INDEX idx_strategies_symbol ON strategies(symbol);
CREATE INDEX idx_strategy_coins_strategy_id ON strategy_coins(strategy_id);
CREATE INDEX idx_paper_trades_session_id ON paper_trades(session_id);
CREATE INDEX idx_paper_trades_strategy_id ON paper_trades(strategy_id);
CREATE INDEX idx_paper_trades_symbol ON paper_trades(symbol);
CREATE INDEX idx_trade_signals_strategy_id ON trade_signals(strategy_id);
CREATE INDEX idx_trade_signals_symbol ON trade_signals(symbol);
CREATE INDEX idx_backtests_strategy_id ON backtests(strategy_id);
CREATE INDEX idx_strategy_performance_strategy_id ON strategy_performance(strategy_id);
CREATE INDEX idx_ai_research_strategy_id ON ai_research_logs(strategy_id);
CREATE INDEX idx_on_chain_data_symbol ON on_chain_data(symbol);
CREATE INDEX idx_on_chain_data_timestamp ON on_chain_data(timestamp);
CREATE INDEX idx_economic_calendar_date ON economic_calendar(event_date);
CREATE INDEX idx_trading_sessions_strategy_id ON trading_sessions(strategy_id);
CREATE INDEX idx_trading_sessions_status ON trading_sessions(status);

-- Enable Row Level Security
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtests ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_research_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE on_chain_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE economic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;

-- Create simple RLS policies (allow all for now, can be tightened later)
CREATE POLICY "Allow all operations on strategies" ON strategies
  FOR ALL USING (TRUE);
CREATE POLICY "Allow all operations on paper_trades" ON paper_trades
  FOR ALL USING (TRUE);
CREATE POLICY "Allow all operations on trade_signals" ON trade_signals
  FOR ALL USING (TRUE);
CREATE POLICY "Allow all operations on backtests" ON backtests
  FOR ALL USING (TRUE);
CREATE POLICY "Allow all operations on strategy_performance" ON strategy_performance
  FOR ALL USING (TRUE);
CREATE POLICY "Allow all operations on ai_research_logs" ON ai_research_logs
  FOR ALL USING (TRUE);
CREATE POLICY "Allow all operations on on_chain_data" ON on_chain_data
  FOR ALL USING (TRUE);
CREATE POLICY "Allow all operations on economic_calendar" ON economic_calendar
  FOR ALL USING (TRUE);
CREATE POLICY "Allow all operations on trading_sessions" ON trading_sessions
  FOR ALL USING (TRUE);
