/**
 * Phase 3 Controlled Autoresearch — shared types.
 */

import type { MetricsSummary } from "@/validation-engine";
import type { ResearchConfig } from "./config";

export type MutationType =
  | "indicator_period"
  | "indicator_threshold"
  | "stop_loss_percent"
  | "take_profit_percent"
  | "risk_percent"
  | "group_op"
  | "add_condition"
  | "remove_condition";

export interface StructuredMutation {
  mutation_type: MutationType;
  path: string;
  old_value: unknown;
  new_value: unknown;
  hypothesis: string;
  /** For add_condition: the IndicatorRule / group node to insert */
  condition?: unknown;
}

export interface StrategySnapshot {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  entry_rules: unknown;
  exit_rules: unknown;
  version: number;
}

export interface DatasetProvenance {
  symbol: string;
  timeframe: string;
  provider: string;
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
  testStart: string;
  testEnd: string;
  trainBars: number;
  validationBars: number;
  testBars: number;
  totalBars: number;
  splitPolicyVersion: string;
  trainHash: string;
  validationHash: string;
  testHash: string;
  /** Full series hash — TEST content frozen but never used in loop */
  seriesHash: string;
}

export interface TrainDiagnostics {
  metrics: MetricsSummary;
  tradeCount: number;
  barCount: number;
  /** Explicit label so callers cannot confuse with TEST */
  segment: "train";
}

export interface SegmentEvaluation {
  segment: "train" | "validation";
  metrics: MetricsSummary;
  tradeCount: number;
  barCount: number;
  resultSource: "REAL_BACKTEST";
}

export interface RobustnessMetrics {
  costStress15: {
    commissionMultiplier: number;
    slippageMultiplier: number;
    metrics: MetricsSummary;
    positiveExpectancy: boolean;
  };
}

export type SelectionDecision = "KEEP" | "REJECT";

export interface SelectionCheck {
  id: string;
  passed: boolean;
  detail: string;
  value?: unknown;
}

export interface SelectionResult {
  decision: SelectionDecision;
  reasons: string[];
  checks: Record<string, SelectionCheck>;
}

export interface ExperimentRecord {
  experimentId: string;
  researchRunId: string;
  generation: number;
  parentStrategyId: string;
  parentVersion: number;
  parentSnapshotHash: string;
  candidateSnapshot: StrategySnapshot;
  candidateSnapshotHash: string;
  mutation: StructuredMutation | null;
  hypothesis: string | null;
  claudeProposalRaw: unknown;
  trainMetrics: MetricsSummary | null;
  validationMetrics: MetricsSummary | null;
  robustnessMetrics: RobustnessMetrics | null;
  decision: SelectionDecision;
  rejectionReasons: string[];
  selectionChecks: Record<string, SelectionCheck>;
  duplicateOf: string | null;
  modelId: string | null;
  evaluatorVersion: string;
  provenance: Record<string, unknown>;
  createdAt: string;
}

export interface ResearchBaseline {
  version: number;
  snapshot: StrategySnapshot;
  snapshotHash: string;
  train: SegmentEvaluation;
  validation: SegmentEvaluation;
}

export interface ResearchRunResult {
  schemaVersion: "research_engine_v1";
  researchRunId: string;
  strategyId: string;
  startingVersion: number;
  status: string;
  config: ResearchConfig;
  dataset: DatasetProvenance;
  baseline: ResearchBaseline;
  experiments: ExperimentRecord[];
  champion: {
    version: number | null;
    snapshot: StrategySnapshot | null;
    snapshotHash: string | null;
    fromExperimentId: string | null;
  };
  finalValidation: {
    validationId: string | null;
    status: "pass" | "conditional" | "fail" | null;
    reasons: string[];
    score: number | null;
    /** Present only after loop — first time TEST metrics appear in Phase 3 */
    chronologicalTestMetrics: MetricsSummary | null;
  } | null;
  outcome: string;
  outcomeReasons: string[];
  modelId: string | null;
  evaluatorVersion: string;
  startedAt: string;
  completedAt: string;
  resultSource: "REAL_RESEARCH";
  activation: {
    autoActivated: false;
    autoPaperTrading: false;
    note: string;
  };
}

export interface ResearchRunRequest {
  strategyId: string;
  symbol?: string;
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  window?: string;
  initialCapital?: number;
  commissionPct?: number;
  slippagePct?: number;
  config?: Partial<ResearchConfig>;
  /** Unit tests: inject bars (skips network). */
  bars?: import("@/truth-engine").OHLCVBar[];
  /** Unit tests: inject mutation proposer (skips Anthropic). */
  proposeMutation?: MutationProposer;
  /** Unit tests: skip DB persistence. */
  skipPersistence?: boolean;
  /** Unit tests: skip final Phase 2 validation network/DB. */
  runFinalValidation?: (
    champion: StrategySnapshot,
    bars: import("@/truth-engine").OHLCVBar[]
  ) => Promise<{
    validationId: string | null;
    status: "pass" | "conditional" | "fail";
    reasons: string[];
    score: number | null;
    chronologicalTestMetrics: MetricsSummary | null;
  }>;
}

export type MutationProposer = (ctx: {
  parent: StrategySnapshot;
  trainDiagnostics: TrainDiagnostics;
  previousExperiments: Array<{
    mutation: StructuredMutation | null;
    decision: SelectionDecision;
    rejectionReasons: string[];
    hypothesis: string | null;
  }>;
  allowedMutationTypes: MutationType[];
}) => Promise<{
  mutation: StructuredMutation;
  raw: unknown;
  modelId: string;
}>;
