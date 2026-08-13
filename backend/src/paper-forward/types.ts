export type PaperLifecycleStatus =
  | "CREATED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "ABORTED";

export type ValidationGateStatus = "pass" | "conditional" | "fail";

export interface PaperEligibilityRequest {
  strategyId: string;
  strategyVersionId: string;
  validationId: string;
  researchRunId?: string | null;
  acknowledgeConditional?: boolean;
}

export interface PaperEligibilityResult {
  eligible: boolean;
  reasons: string[];
  validationStatus: ValidationGateStatus | null;
  requiresConditionalAcknowledgement: boolean;
  evidence: {
    strategyId: string;
    strategyVersionId: string;
    strategyVersion: number | null;
    snapshotHash: string | null;
    validationId: string;
    researchRunId: string | null;
    symbol: string | null;
    timeframe: string | null;
    validationStatus: ValidationGateStatus | null;
  };
}

export interface CreatePaperSessionInput {
  strategyId: string;
  strategyVersionId: string;
  validationId: string;
  researchRunId?: string | null;
  initialCapital?: number;
  acknowledgeConditional?: boolean;
  createdBy?: string;
}

export interface PaperForwardSession {
  id: string;
  strategy_id: string;
  strategy_version_id: string;
  strategy_version: number;
  snapshot_hash: string;
  strategy_snapshot: unknown;
  research_run_id: string | null;
  validation_id: string;
  lifecycle_status: PaperLifecycleStatus;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  current_balance: number;
  engine_version: string;
  created_by: string | null;
  conditional_acknowledged: boolean;
  eligibility_evidence: unknown;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  aborted_at: string | null;
  failure_reason: string | null;
  abort_reason: string | null;
  created_at?: string;
  start_time?: string;
}

export interface StrategyVersionRow {
  id: string;
  strategy_id: string;
  version: number;
  strategy_snapshot: unknown;
  snapshot_hash: string;
  source?: string;
}

export interface StrategyValidationRow {
  id: string;
  strategy_id: string;
  strategy_version?: number | null;
  strategy_snapshot: unknown;
  status: string;
  gate: unknown;
  report: unknown;
  symbol?: string | null;
  timeframe?: string | null;
}

export interface ResearchRunRow {
  id: string;
  strategy_id: string;
  final_candidate_version?: number | null;
  final_champion_version?: number | null; // alias tolerated
  final_validation_id?: string | null;
  status?: string | null;
}
