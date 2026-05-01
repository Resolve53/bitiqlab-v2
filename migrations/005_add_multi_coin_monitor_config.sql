-- Add multi-coin monitor configuration storage
-- This table persists multi-coin monitor settings so they can be retrieved when viewing the live dashboard

CREATE TABLE multi_coin_monitor_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  coin_count INTEGER NOT NULL,
  custom_coins TEXT[] NOT NULL,
  scan_frequency INTEGER NOT NULL,
  position_size_per_coin DECIMAL(18,8) NOT NULL,
  max_concurrent_positions INTEGER NOT NULL,
  stop_loss_percent DECIMAL(5,2) NOT NULL,
  take_profit_percent DECIMAL(5,2) NOT NULL,
  trading_type VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_multi_coin_session ON multi_coin_monitor_configs(session_id);
CREATE INDEX idx_multi_coin_strategy ON multi_coin_monitor_configs(strategy_id);
