-- Phase 4C: Paper-forward operations, evaluation, readiness, human review
-- Additive only. Apply manually in Supabase. Simulated paper only — ZERO exchange orders.

-- Scheduler / lock / stale tracking on Phase 4 sessions
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS tick_lock_token TEXT,
  ADD COLUMN IF NOT EXISTS tick_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_tick_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_tick_error TEXT,
  ADD COLUMN IF NOT EXISTS tick_error_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stale_detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS candles_processed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS readiness_status TEXT,
  ADD COLUMN IF NOT EXISTS readiness_reasons JSONB,
  ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ;

COMMENT ON COLUMN trading_sessions.tick_lock_token IS
  'Lease lock for Phase 4C scheduler. Compare-and-set; expired leases are stealable.';
COMMENT ON COLUMN trading_sessions.readiness_status IS
  'Latest paper-forward readiness: NOT_READY | READY_FOR_REVIEW | REJECT. Not a live-trading flag.';

-- Immutable version may be marked eligible for a FUTURE live phase. Does not place orders.
ALTER TABLE strategy_versions
  ADD COLUMN IF NOT EXISTS live_phase_eligible BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS live_phase_eligible_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS live_phase_eligible_by TEXT,
  ADD COLUMN IF NOT EXISTS live_phase_review_notes TEXT;

COMMENT ON COLUMN strategy_versions.live_phase_eligible IS
  'Human-reviewed future-live eligibility. Phase 4C does not enable live trading or exchange orders.';

CREATE TABLE IF NOT EXISTS paper_forward_ops_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES trading_sessions(id) ON DELETE CASCADE,
  strategy_id UUID,
  strategy_version_id UUID,
  snapshot_hash TEXT,
  event_type TEXT NOT NULL,
  payload JSONB,
  actor TEXT,
  engine_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_forward_ops_events_session
  ON paper_forward_ops_events (session_id, created_at DESC);

COMMENT ON TABLE paper_forward_ops_events IS
  'Append-only Phase 4C operations audit (lifecycle, scheduler, stale, locks).';

CREATE TABLE IF NOT EXISTS paper_forward_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  evaluation JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_forward_evaluations_session
  ON paper_forward_evaluations (session_id, created_at DESC);

COMMENT ON TABLE paper_forward_evaluations IS
  'Append-only paper-forward metric snapshots computed from simulated trades only.';

CREATE TABLE IF NOT EXISTS paper_forward_readiness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  validation_id UUID,
  status TEXT NOT NULL CHECK (status IN ('NOT_READY', 'READY_FOR_REVIEW', 'REJECT')),
  reasons JSONB NOT NULL,
  checks JSONB NOT NULL,
  config JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_forward_readiness_session
  ON paper_forward_readiness (session_id, created_at DESC);

COMMENT ON TABLE paper_forward_readiness IS
  'Append-only deterministic paper-forward readiness decisions. No Claude. No auto-live.';

CREATE TABLE IF NOT EXISTS paper_forward_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE_FUTURE_LIVE_ELIGIBLE', 'REJECT_REVIEW')),
  notes TEXT,
  actor TEXT NOT NULL,
  readiness_status TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_forward_reviews_session
  ON paper_forward_reviews (session_id, created_at DESC);

COMMENT ON TABLE paper_forward_reviews IS
  'Human review of READY_FOR_REVIEW paper sessions. Approval marks version for a future live phase only.';
