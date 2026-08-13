-- Phase 4A: Paper Forward Safety Foundation
-- Extends canonical trading_sessions with immutable provenance + lifecycle.
-- Additive only. Do NOT apply automatically from the agent; apply in Supabase manually.

ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS strategy_version_id UUID REFERENCES strategy_versions(id),
  ADD COLUMN IF NOT EXISTS strategy_version INTEGER,
  ADD COLUMN IF NOT EXISTS snapshot_hash TEXT,
  ADD COLUMN IF NOT EXISTS strategy_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS research_run_id UUID REFERENCES strategy_research_runs(id),
  ADD COLUMN IF NOT EXISTS validation_id UUID REFERENCES strategy_validations(id),
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS aborted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS abort_reason TEXT,
  ADD COLUMN IF NOT EXISTS engine_version TEXT,
  ADD COLUMN IF NOT EXISTS symbol TEXT,
  ADD COLUMN IF NOT EXISTS timeframe TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS conditional_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eligibility_evidence JSONB;

-- Phase 4A sessions use lifecycle_status; legacy rows may leave it NULL.
COMMENT ON COLUMN trading_sessions.lifecycle_status IS
  'Phase 4A lifecycle: CREATED | RUNNING | PAUSED | COMPLETED | FAILED | ABORTED';

COMMENT ON COLUMN trading_sessions.strategy_snapshot IS
  'Immutable strategy snapshot frozen at session create. Never re-read strategies.entry_rules for execution.';

COMMENT ON COLUMN trading_sessions.engine_version IS
  'Paper-forward engine version (e.g. paper_forward_v1_phase4a).';

CREATE INDEX IF NOT EXISTS idx_trading_sessions_lifecycle
  ON trading_sessions(lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_trading_sessions_strategy_version_id
  ON trading_sessions(strategy_version_id);

CREATE INDEX IF NOT EXISTS idx_trading_sessions_validation_id
  ON trading_sessions(validation_id);
