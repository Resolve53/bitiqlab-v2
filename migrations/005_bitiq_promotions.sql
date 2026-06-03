-- Bitiq live promotion tracking (Lab → external Bitiq pipeline)

CREATE TABLE IF NOT EXISTS bitiq_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  trading_session_id UUID REFERENCES trading_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bitiq_strategy_id TEXT,
  webhook_response JSONB,
  readiness JSONB,
  promotion_notes TEXT,
  promoted_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bitiq_promotions_strategy_id
  ON bitiq_promotions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_bitiq_promotions_status
  ON bitiq_promotions(status);
