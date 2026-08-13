-- Phase 3: append-only research runs and experiments.
-- Do NOT use ai_research_logs as source of truth.

CREATE TABLE IF NOT EXISTS strategy_research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  starting_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'running',
      'completed',
      'failed',
      'cancelled',
      'validated_pass',
      'validated_conditional',
      'validated_fail'
    )
  ),
  config JSONB NOT NULL,
  dataset_provenance JSONB NOT NULL,
  final_candidate_version INTEGER,
  final_candidate_snapshot JSONB,
  final_candidate_snapshot_hash TEXT,
  final_validation_id UUID,
  outcome TEXT,
  outcome_reasons JSONB,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  model_id TEXT,
  evaluator_version TEXT NOT NULL DEFAULT 'research_engine_v1'
);

CREATE INDEX IF NOT EXISTS idx_strategy_research_runs_strategy_id
  ON strategy_research_runs(strategy_id);

CREATE INDEX IF NOT EXISTS idx_strategy_research_runs_started_at
  ON strategy_research_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS strategy_research_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id TEXT NOT NULL,
  research_run_id UUID NOT NULL REFERENCES strategy_research_runs(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  parent_strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  parent_version INTEGER NOT NULL,
  parent_snapshot_hash TEXT NOT NULL,
  candidate_snapshot JSONB NOT NULL,
  candidate_snapshot_hash TEXT NOT NULL,
  mutation_type TEXT,
  changed_field TEXT,
  old_value JSONB,
  new_value JSONB,
  hypothesis TEXT,
  claude_proposal_raw JSONB,
  train_metrics JSONB,
  validation_metrics JSONB,
  robustness_metrics JSONB,
  decision TEXT NOT NULL CHECK (decision IN ('KEEP', 'REJECT')),
  rejection_reasons JSONB,
  selection_checks JSONB,
  duplicate_of TEXT,
  model_id TEXT,
  evaluator_version TEXT NOT NULL DEFAULT 'research_engine_v1',
  provenance JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (research_run_id, experiment_id)
);

CREATE INDEX IF NOT EXISTS idx_strategy_research_experiments_run_id
  ON strategy_research_experiments(research_run_id);

CREATE INDEX IF NOT EXISTS idx_strategy_research_experiments_parent
  ON strategy_research_experiments(parent_strategy_id);

COMMENT ON TABLE strategy_research_runs IS
  'Phase 3 controlled autoresearch runs. Append-oriented; final Phase 2 validation linked once.';

COMMENT ON TABLE strategy_research_experiments IS
  'Phase 3 per-candidate experiments. TRAIN/VALIDATION only during loop; TEST never stored here as selection input.';
