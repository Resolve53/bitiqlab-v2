-- Phase 2 Validation Engine: persist anti-overfitting validation reports
-- Additive only; does not overwrite historical backtests.

CREATE TABLE IF NOT EXISTS strategy_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  strategy_version INTEGER,
  strategy_snapshot JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'conditional', 'fail')),
  gate JSONB NOT NULL,
  report JSONB NOT NULL,
  dataset_provenance JSONB,
  symbol TEXT,
  timeframe TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_validations_strategy_id
  ON strategy_validations(strategy_id);

CREATE INDEX IF NOT EXISTS idx_strategy_validations_created_at
  ON strategy_validations(created_at DESC);

COMMENT ON TABLE strategy_validations IS
  'Phase 2 Truth Engine validation reports (chronological split, walk-forward, sensitivity, cost stress, regimes, gate). Append-only.';
