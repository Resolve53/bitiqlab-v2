-- Stage 2B: enrichment worker ops (additive).
-- DB-backed claim/lock + heartbeat. ZERO execution columns.
-- Apply in Supabase manually after 014 and 015.

ALTER TABLE tradingview_candidates
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_message_safe TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tv_candidates_enrichment_claim
  ON tradingview_candidates (status, next_retry_at, received_at);

CREATE INDEX IF NOT EXISTS idx_tv_candidates_claimed_at
  ON tradingview_candidates (status, claimed_at);

CREATE TABLE IF NOT EXISTS enrichment_worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  worker_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  last_heartbeat TIMESTAMPTZ NOT NULL,
  last_tick_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  currently_processing TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE enrichment_worker_heartbeats IS
  'Stage 2B durable enrichment-worker heartbeat. No AI decision, no execution.';

CREATE OR REPLACE FUNCTION claim_enrichment_candidates(
  p_worker_id TEXT,
  p_limit INTEGER,
  p_stale_ms INTEGER,
  p_max_attempts INTEGER,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS SETOF tradingview_candidates
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT c.id
    FROM tradingview_candidates c
    WHERE COALESCE(c.attempt_count, 0) < GREATEST(p_max_attempts, 1)
      AND (
        c.status = 'READY_FOR_ENRICHMENT'
        OR (
          c.status IN ('ENRICHMENT_PARTIAL', 'ENRICHMENT_FAILED')
          AND c.next_retry_at IS NOT NULL
          AND c.next_retry_at <= p_now
        )
        OR (
          c.status = 'ENRICHING'
          AND c.claimed_at IS NOT NULL
          AND c.claimed_at <= p_now - (GREATEST(p_stale_ms, 0) * INTERVAL '1 millisecond')
        )
      )
    ORDER BY c.received_at ASC NULLS LAST, c.created_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE tradingview_candidates t
  SET
    status = 'ENRICHING',
    claimed_at = p_now,
    claimed_by = p_worker_id,
    last_attempt_at = p_now,
    attempt_count = COALESCE(t.attempt_count, 0) + 1
  FROM picked
  WHERE t.id = picked.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_enrichment_candidates(TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_enrichment_candidates(TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ) TO service_role;
