-- Phase 3: immutable strategy version snapshots (additive).
-- Does not overwrite strategies.entry_rules; activation remains a separate human action.

CREATE TABLE IF NOT EXISTS strategy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  parent_version INTEGER,
  source TEXT NOT NULL CHECK (
    source IN (
      'initial',
      'claude_generate',
      'manual',
      'phase3_keep',
      'phase3_reject_audit',
      'research_baseline'
    )
  ),
  strategy_snapshot JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (strategy_id, version)
);

CREATE INDEX IF NOT EXISTS idx_strategy_versions_strategy_id
  ON strategy_versions(strategy_id);

CREATE INDEX IF NOT EXISTS idx_strategy_versions_hash
  ON strategy_versions(snapshot_hash);

COMMENT ON TABLE strategy_versions IS
  'Immutable strategy snapshots for Phase 3 research lineage. KEEP candidates are stored here but do not auto-activate.';
