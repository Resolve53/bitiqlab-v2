-- Phase 4B: Paper-forward simulated execution engine
-- Additive only. Do NOT apply automatically from the agent; apply in Supabase manually.
-- Simulated paper fills only. ZERO real exchange orders.

-- Execution cursor + paper metrics on canonical sessions (Phase 4A rows).
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS last_processed_candle_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_state JSONB,
  ADD COLUMN IF NOT EXISTS paper_metrics JSONB,
  ADD COLUMN IF NOT EXISTS realized_pnl DECIMAL(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fees_paid DECIMAL(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_drawdown DECIMAL(10, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_equity DECIMAL(20, 8);

COMMENT ON COLUMN trading_sessions.last_processed_candle_ts IS
  'Open-time of the last CLOSED candle processed by the Phase 4B paper engine. Resume cursor.';
COMMENT ON COLUMN trading_sessions.execution_state IS
  'Deterministic paper engine state (pending entry, open position extras). Not live orders.';
COMMENT ON COLUMN trading_sessions.paper_metrics IS
  'Paper/simulated forward metrics computed from paper_forward_trades only (not historical backtests).';

-- Append-only paper events (signals, fills, candle processed).
CREATE TABLE IF NOT EXISTS paper_forward_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  candle_timestamp TIMESTAMPTZ NOT NULL,
  signal JSONB,
  fill_price DECIMAL(20, 8),
  fee DECIMAL(20, 8),
  slippage DECIMAL(20, 8),
  quantity DECIMAL(20, 8),
  realized_pnl DECIMAL(20, 8),
  reason TEXT,
  engine_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_forward_events_session_type_candle
  ON paper_forward_events (session_id, event_type, candle_timestamp);

CREATE INDEX IF NOT EXISTS idx_paper_forward_events_session_id
  ON paper_forward_events (session_id, created_at DESC);

COMMENT ON TABLE paper_forward_events IS
  'Append-only Phase 4B paper-forward provenance. Simulated only. Unique (session, event_type, candle) for idempotency.';

-- Closed (and still-open) simulated trades.
CREATE TABLE IF NOT EXISTS paper_forward_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_candle_ts TIMESTAMPTZ NOT NULL,
  exit_candle_ts TIMESTAMPTZ,
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8),
  quantity DECIMAL(20, 8) NOT NULL,
  fee DECIMAL(20, 8) NOT NULL DEFAULT 0,
  slippage_entry DECIMAL(20, 8),
  slippage_exit DECIMAL(20, 8),
  realized_pnl DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 8),
  reason TEXT,
  signal JSONB,
  engine_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, entry_candle_ts)
);

CREATE INDEX IF NOT EXISTS idx_paper_forward_trades_session_id
  ON paper_forward_trades (session_id, entry_candle_ts);

COMMENT ON TABLE paper_forward_trades IS
  'Simulated paper-forward trades. One entry per session+entry candle. Not exchange fills.';

-- At most one open simulated position per session.
CREATE TABLE IF NOT EXISTS paper_forward_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_candle_ts TIMESTAMPTZ NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  stop_loss DECIMAL(20, 8) NOT NULL,
  take_profit DECIMAL(20, 8),
  leverage DECIMAL(10, 4) NOT NULL DEFAULT 1,
  fee DECIMAL(20, 8) NOT NULL DEFAULT 0,
  slippage DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
  mark_price DECIMAL(20, 8),
  mark_candle_ts TIMESTAMPTZ,
  reason TEXT,
  engine_version TEXT NOT NULL,
  position_state JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id)
);

COMMENT ON TABLE paper_forward_positions IS
  'Current simulated open position for a paper-forward session (max one). Not a live exchange position.';
