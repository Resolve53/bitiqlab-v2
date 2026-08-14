-- Stage 1: TradingView candidate pipeline (detector only).
-- Additive. ZERO execution columns. Do not apply automatically from the agent;
-- apply in Supabase manually like 012/013.

CREATE TABLE IF NOT EXISTS tradingview_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  strategy_id UUID NOT NULL,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  signal_candle_ts TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entry DECIMAL(20, 8),
  stop_loss DECIMAL(20, 8),
  take_profits JSONB NOT NULL DEFAULT '[]'::jsonb,
  pine_version TEXT,
  source TEXT NOT NULL DEFAULT 'TRADINGVIEW',
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'INVALID', 'READY_FOR_ENRICHMENT')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (candidate_id),
  UNIQUE (strategy_version_id, symbol, timeframe, direction, signal_candle_ts)
);

CREATE INDEX IF NOT EXISTS idx_tv_candidates_strategy_version
  ON tradingview_candidates (strategy_version_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_tv_candidates_symbol_tf
  ON tradingview_candidates (symbol, timeframe, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_tv_candidates_status
  ON tradingview_candidates (status, received_at DESC);

COMMENT ON TABLE tradingview_candidates IS
  'Stage 1 TradingView detector candidates. Persist-only. No exchange execution.';

CREATE TABLE IF NOT EXISTS tradingview_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  pine_script TEXT NOT NULL,
  pine_version TEXT NOT NULL,
  compile_status TEXT NOT NULL,
  alert_status TEXT NOT NULL,
  alert_instructions TEXT,
  webhook_url TEXT,
  verification JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tv_deployments_version
  ON tradingview_deployments (strategy_version_id, created_at DESC);

COMMENT ON TABLE tradingview_deployments IS
  'Stage 1 MCP Pine deploy attempts and alert-setup state. compiled != monitoring complete.';
