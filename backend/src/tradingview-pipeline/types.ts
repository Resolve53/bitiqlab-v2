import type { CandidateDirection, CandidateStatus } from "./constants";
import type { StrategyDefinition } from "@/truth-engine/types";

export interface FrozenVersionAuthority {
  strategyId: string;
  strategyVersionId: string;
  versionNumber: number;
  snapshotHash: string;
  snapshot: Record<string, unknown>;
  strategy: StrategyDefinition;
  symbol: string;
  timeframe: string;
}

export interface PineGenerateRequest {
  strategy_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  /** Optional override from the allowed symbol universe (not BTC-hardcoded). */
  symbol?: string;
  timeframe?: string;
}

export interface PineGenerateResult {
  pine_script: string;
  strategy_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  symbol: string;
  timeframe: string;
  pine_version: string;
  engine: string;
  webhook_url: string;
  directions: CandidateDirection[];
}

export interface CandidateSignalPayload {
  candidate_id?: string;
  strategy_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  symbol: string;
  timeframe: string;
  direction: CandidateDirection;
  signal_candle_ts: string;
  entry: number;
  stop_loss: number;
  take_profits: number[];
  pine_version: string;
  source: "TRADINGVIEW";
  webhook_token?: string;
}

export interface TradingViewCandidateRow {
  id: string;
  candidate_id: string;
  strategy_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  symbol: string;
  timeframe: string;
  direction: CandidateDirection;
  signal_candle_ts: string;
  received_at: string;
  entry: number | null;
  stop_loss: number | null;
  take_profits: unknown;
  pine_version: string | null;
  source: string;
  raw_payload: unknown;
  status: CandidateStatus;
  created_at: string;
}

export interface CandidateIngestResult {
  duplicate: boolean;
  candidate: TradingViewCandidateRow;
}

export interface McpToolResult {
  success?: boolean;
  error?: string;
  message?: string;
  has_errors?: boolean;
  errors?: unknown[];
  [key: string]: unknown;
}

export interface McpDeployTools {
  chart_set_symbol: (args: { symbol: string }) => Promise<McpToolResult>;
  chart_set_timeframe?: (args: { timeframe: string }) => Promise<McpToolResult>;
  pine_set_source: (args: { source: string }) => Promise<McpToolResult>;
  pine_smart_compile: () => Promise<McpToolResult>;
  pine_get_source?: () => Promise<McpToolResult & { source?: string }>;
  chart_get_state?: () => Promise<McpToolResult>;
}

export interface McpDeployInput {
  strategy_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  symbol: string;
  timeframe: string;
  pine_script: string;
}

export type AlertSetupStatus =
  | "CREATED"
  | "VERIFIED"
  | "ALERT_SETUP_REQUIRED"
  | "CREATE_FAILED";

export interface McpDeployResult {
  /** Never true unless compile succeeded AND provenance/symbol/timeframe verified. */
  compiled: boolean;
  verified: boolean;
  /** Never true based on compile alone. Requires verified compile + real alert. */
  monitoring_complete: boolean;
  status:
    | "compile_failed"
    | "verification_failed"
    | "symbol_failed"
    | "source_failed"
    | "compiled_verified"
    | "deployed";
  symbol_set: boolean;
  timeframe_set: boolean;
  source_set: boolean;
  compile_succeeded: boolean;
  provenance_verified: boolean;
  expected_strategy_version_match: boolean;
  expected_hash_match: boolean;
  steps: Record<string, McpToolResult | undefined>;
  failure?: string;
  alert: {
    status: AlertSetupStatus;
    instructions: string[];
    webhook_url: string;
    verified: boolean;
    detail?: string;
  };
}

export interface AlertSetupResult {
  status: AlertSetupStatus;
  verified: boolean;
  instructions: string[];
  webhook_url: string;
  detail?: string;
  raw?: unknown;
}

export interface TradingViewDeploymentRow {
  id: string;
  strategy_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  symbol: string;
  timeframe: string;
  pine_version: string;
  compile_status: string;
  alert_status: string;
  alert_instructions: string | null;
  webhook_url: string | null;
  verification: unknown;
  created_at: string;
}
