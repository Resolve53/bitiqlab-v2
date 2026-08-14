-- Stage 2: candidate intelligence snapshots (additive).
-- Do NOT apply automatically from the agent; apply in Supabase manually.
-- Detector enrichment only. ZERO execution columns.

ALTER TABLE tradingview_candidates
  DROP CONSTRAINT IF EXISTS tradingview_candidates_status_check;

ALTER TABLE tradingview_candidates
  ADD CONSTRAINT tradingview_candidates_status_check
  CHECK (status IN (
    'RECEIVED',
    'INVALID',
    'READY_FOR_ENRICHMENT',
    'ENRICHING',
    'READY_FOR_AI_REVIEW',
    'ENRICHMENT_PARTIAL',
    'ENRICHMENT_FAILED'
  ));

CREATE TABLE IF NOT EXISTS candidate_intelligence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  candidate_row_id UUID,
  strategy_id UUID NOT NULL,
  strategy_version_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL,
  enrichment_version INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  market_type TEXT NOT NULL CHECK (market_type IN ('spot', 'futures')),
  market_data JSONB,
  derivatives_data JSONB,
  microstructure_data JSONB,
  sentiment_data JSONB,
  macro_data JSONB,
  freshness JSONB,
  provider_status JSONB,
  score_breakdown JSONB,
  quality_score TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'ENRICHING',
    'READY_FOR_AI_REVIEW',
    'ENRICHMENT_PARTIAL',
    'ENRICHMENT_FAILED'
  )),
  observability JSONB,
  intelligence JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (candidate_id, enrichment_version)
);

CREATE INDEX IF NOT EXISTS idx_intel_snapshots_candidate
  ON candidate_intelligence_snapshots (candidate_id, enrichment_version DESC);

CREATE INDEX IF NOT EXISTS idx_intel_snapshots_status
  ON candidate_intelligence_snapshots (status, created_at DESC);

COMMENT ON TABLE candidate_intelligence_snapshots IS
  'Stage 2 append-only pre-trade intelligence. Deterministic score only. No AI decision, no execution.';
