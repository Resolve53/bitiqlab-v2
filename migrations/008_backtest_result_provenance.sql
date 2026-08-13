-- Phase 1 Truth Engine: mark real vs legacy simulated backtests
-- Safe additive migration — does not delete existing rows.

ALTER TABLE backtests
  ADD COLUMN IF NOT EXISTS result_source TEXT;

ALTER TABLE backtests
  ADD COLUMN IF NOT EXISTS provenance JSONB;

COMMENT ON COLUMN backtests.result_source IS
  'REAL_BACKTEST for Truth Engine runs; SIMULATED_LEGACY / NULL for older unverified rows';

COMMENT ON COLUMN backtests.provenance IS
  'Reproducibility metadata: strategy snapshot, market-data provider, fees, execution model';

UPDATE backtests
SET result_source = 'SIMULATED_LEGACY'
WHERE result_source IS NULL;
