/**
 * Phase 2 Validation Engine — shared types.
 */

import type { BacktestMetrics, OHLCVBar, StrategyDefinition } from "@/truth-engine";
import type { ValidationConfig } from "./config";

export type GateStatus = "pass" | "conditional" | "fail";

export interface MetricsSummary {
  totalTrades: number;
  winRate: number;
  expectancy: number | null;
  profitFactor: number | null;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  netProfit: number;
}

export interface SplitSegment {
  name: "train" | "validation" | "test";
  start: string;
  end: string;
  barCount: number;
  tradeCount: number;
  metrics: MetricsSummary;
  resultSource: "REAL_BACKTEST";
}

export interface ChronologicalSplitResult {
  train: SplitSegment;
  validation: SplitSegment;
  test: SplitSegment;
  degradation: DegradationReport;
}

export interface DegradationReport {
  expectancyRetention: number | null;
  profitFactorRetention: number | null;
  totalReturnDelta: number | null;
  maxDrawdownDelta: number | null;
  sharpeRetention: number | null;
  winRateDelta: number | null;
}

export interface WalkForwardWindowResult {
  windowIndex: number;
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
  trainBars: number;
  validationBars: number;
  trainMetrics: MetricsSummary;
  validationMetrics: MetricsSummary;
  degradation: DegradationReport;
  pass: boolean;
}

export interface WalkForwardResult {
  windows: WalkForwardWindowResult[];
  windowCount: number;
  profitableWindowPct: number;
  aggregate: {
    avgTrainExpectancy: number | null;
    avgValidationExpectancy: number | null;
    avgProfitFactorRetention: number | null;
  };
}

export interface SensitivityVariantResult {
  parameterPath: string;
  originalValue: number;
  testedValue: number;
  metrics: MetricsSummary;
  expectancyDelta: number | null;
  positiveExpectancy: boolean;
}

export interface SensitivityResult {
  variants: SensitivityVariantResult[];
  positiveExpectancyPct: number;
  originalUnchanged: true;
}

export interface CostStressCase {
  name: string;
  commissionMultiplier: number;
  slippageMultiplier: number;
  commissionPct: number;
  slippagePct: number;
  metrics: MetricsSummary;
  positiveExpectancy: boolean;
}

export interface CostStressResult {
  base: { commissionPct: number; slippagePct: number };
  cases: CostStressCase[];
}

export type TrendRegime = "trending_up" | "trending_down" | "sideways";
export type VolRegime = "high_volatility" | "low_volatility";

export interface RegimeBucketResult {
  regime: string;
  bars: number;
  trades: number;
  winRate: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  totalReturn: number | null;
  maxDrawdown: number | null;
}

export interface RegimeAnalysisResult {
  definitions: {
    trend: string;
    volatility: string;
  };
  trend: RegimeBucketResult[];
  volatility: RegimeBucketResult[];
  worksIn: string[];
  failsIn: string[];
}

export interface CrossAssetAssetResult {
  symbol: string;
  metrics: MetricsSummary | null;
  tradeCount: number;
  pass: boolean;
  error?: string;
}

export interface CrossAssetResult {
  mandatory: boolean;
  assets: CrossAssetAssetResult[];
  summary: string;
}

export interface SampleIntegrityFlags {
  insufficientTotalTrades: boolean;
  insufficientValidationTrades: boolean;
  insufficientTestTrades: boolean;
  insufficientWalkForwardWindows: boolean;
  flags: string[];
}

export interface GateCheck {
  id: string;
  passed: boolean;
  severity: "hard" | "soft";
  detail: string;
  value?: unknown;
}

export interface GateDecision {
  status: GateStatus;
  reasons: string[];
  checks: Record<string, GateCheck>;
  score: number | null;
}

export interface ValidationReport {
  schemaVersion: "validation_engine_v1";
  strategyId: string;
  strategyVersion: number;
  strategyDefinitionSnapshot: StrategyDefinition;
  config: ValidationConfig;
  dataset: {
    symbol: string;
    timeframe: string;
    start: string;
    end: string;
    bars: number;
    provider: string;
  };
  chronological: ChronologicalSplitResult;
  walkForward: WalkForwardResult;
  sensitivity: SensitivityResult;
  costStress: CostStressResult;
  regimes: RegimeAnalysisResult;
  crossAsset: CrossAssetResult;
  sampleIntegrity: SampleIntegrityFlags;
  gate: GateDecision;
  resultSource: "REAL_VALIDATION";
  timestamp: string;
}

export interface ValidationRunRequest {
  strategyId: string;
  symbol?: string;
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  window?: string;
  initialCapital?: number;
  commissionPct?: number;
  slippagePct?: number;
  config?: Partial<ValidationConfig>;
  /** Unit tests: inject bars (skips network). */
  bars?: OHLCVBar[];
  /** Unit tests: skip live cross-asset fetches. */
  crossAssetBars?: Record<string, OHLCVBar[]>;
}

export function summarizeMetrics(m: BacktestMetrics): MetricsSummary {
  return {
    totalTrades: m.totalTrades,
    winRate: m.winRate,
    expectancy: m.expectancy,
    profitFactor: m.profitFactor,
    totalReturn: m.totalReturn,
    maxDrawdown: m.maxDrawdown,
    sharpeRatio: m.sharpeRatio,
    netProfit: m.netProfit,
  };
}
