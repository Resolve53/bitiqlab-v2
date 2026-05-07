-- Add monitoring jobs table for persisting job status
-- This allows monitoring jobs to survive process restarts

CREATE TABLE IF NOT EXISTS monitoring_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT UNIQUE NOT NULL,
  session_id UUID NOT NULL,
  strategy_id UUID NOT NULL,
  coins TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  last_evaluation TIMESTAMP WITH TIME ZONE,
  signals_generated INTEGER DEFAULT 0,
  trades_executed INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  FOREIGN KEY (session_id) REFERENCES trading_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

-- Add index for fast lookups by job_id
CREATE INDEX IF NOT EXISTS idx_monitoring_jobs_job_id ON monitoring_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_jobs_session ON monitoring_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_jobs_status ON monitoring_jobs(status);
