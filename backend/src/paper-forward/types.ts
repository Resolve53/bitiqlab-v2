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
  last_processed_candle_ts?: string | null;
  execution_state?: PaperExecutionState | null;
  paper_metrics?: PaperSessionMetrics | null;
  realized_pnl?: number | null;
  unrealized_pnl?: number | null;
  fees_paid?: number | null;
  max_drawdown?: number | null;
  peak_equity?: number | null;
  /** Phase 4C scheduler lease. */
  tick_lock_token?: string | null;
  tick_lock_until?: string | null;
  last_tick_at?: string | null;
  last_tick_error?: string | null;
  tick_error_count?: number | null;
  stale_detected_at?: string | null;
  candles_processed?: number | null;
  readiness_status?: "NOT_READY" | "READY_FOR_REVIEW" | "REJECT" | null;
  readiness_reasons?: unknown;
  last_evaluated_at?: string | null;
}

export type PaperReviewDecision =
  | "APPROVE_FUTURE_LIVE_ELIGIBLE"
  | "REJECT_REVIEW";

export type PaperEventType =
  | "candle_processed"
  | "signal_entry"
  | "signal_exit"
  | "fill_entry"
  | "fill_exit"
  | "session_failed";

export interface PaperPendingEntry {
  signalCandleTs: string;
  direction: "long" | "short";
  conditions: Record<string, number | boolean | string | null>;
  passedRules: string[];
}

export interface PaperOpenPositionState {
  direction: "long" | "short";
  entryPrice: number;
  entryTime: string;
  entryCandleTs: string;
  barsHeld: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number | null;
  requestedRiskUsd: number;
  actualRiskUsd: number;
  capitalCapped: boolean;
  positionNotional: number;
  leverage: number;
  marginUsed: number;
  entryConditions: Record<string, number | boolean | string | null>;
  entryCommission: number;
  highestPrice: number;
  lowestPrice: number;
  pendingStrategyExit: {
    signalCandleTs: string;
    conditions: Record<string, number | boolean | string | null>;
  } | null;
}

export interface PaperExecutionState {
  pendingEntry: PaperPendingEntry | null;
  position: PaperOpenPositionState | null;
  equity: number;
  peakEquity: number;
  maxDrawdown: number;
  feesPaid: number;
  realizedPnl: number;
  wins: number;
  losses: number;
  totalTrades: number;
  commissionPct: number;
  slippagePct: number;
}

export interface PaperSessionMetrics {
  startingCapital: number;
  currentEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  maxDrawdown: number;
  feesPaid: number;
  lastProcessedCandleTs: string | null;
  source: "paper_forward_simulated";
}

export interface PaperForwardEventRow {
  id: string;
  session_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  event_type: PaperEventType;
  candle_timestamp: string;
  signal?: unknown;
  fill_price?: number | null;
  fee?: number | null;
  slippage?: number | null;
  quantity?: number | null;
  realized_pnl?: number | null;
  reason?: string | null;
  engine_version: string;
  idempotency_key: string;
  created_at?: string;
}

export interface PaperForwardTradeRow {
  id: string;
  session_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  direction: "long" | "short";
  entry_candle_ts: string;
  exit_candle_ts?: string | null;
  entry_price: number;
  exit_price?: number | null;
  quantity: number;
  fee: number;
  slippage_entry?: number | null;
  slippage_exit?: number | null;
  realized_pnl?: number | null;
  unrealized_pnl?: number | null;
  reason?: string | null;
  signal?: unknown;
  engine_version: string;
  status: "open" | "closed";
  created_at?: string;
}

export interface PaperForwardPositionRow {
  id: string;
  session_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  direction: "long" | "short";
  entry_candle_ts: string;
  entry_price: number;
  quantity: number;
  stop_loss: number;
  take_profit?: number | null;
  leverage: number;
  fee: number;
  slippage?: number | null;
  unrealized_pnl: number;
  mark_price?: number | null;
  mark_candle_ts?: string | null;
  reason?: string | null;
  engine_version: string;
  position_state?: unknown;
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
