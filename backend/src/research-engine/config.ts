/**
 * Phase 3 Controlled Autoresearch — config defaults.
 */

import { DEFAULT_VALIDATION_CONFIG } from "@/validation-engine";

export const RESEARCH_ENGINE_VERSION = "research_engine_v1";
export const SPLIT_POLICY_VERSION = "chronological_v1_60_20_20";

export const DEFAULT_RESEARCH_CONFIG = {
  trainPct: DEFAULT_VALIDATION_CONFIG.trainPct,
  validationPct: DEFAULT_VALIDATION_CONFIG.validationPct,
  testPct: DEFAULT_VALIDATION_CONFIG.testPct,

  // Loop limits
  maxGenerations: 5,
  maxCandidates: 5,
  maxClaudeCalls: 5,
  maxConsecutiveNoImprovement: 3,
  timeoutMs: 10 * 60 * 1000,

  // Selection (reuse Phase 2 thresholds)
  minimumValidationTrades: DEFAULT_VALIDATION_CONFIG.minimumValidationTrades,
  minValidationExpectancy: DEFAULT_VALIDATION_CONFIG.minValidationExpectancy,
  minValidationProfitFactor: DEFAULT_VALIDATION_CONFIG.minValidationProfitFactor,
  maxDrawdown: DEFAULT_VALIDATION_CONFIG.maxDrawdown,

  // Relative to baseline
  maxDrawdownIncreaseAbs: 0.05, // reject if DD worsens by >5pp
  minExpectancyImprovement: 0, // must be >= baseline expectancy
  requireCostStress15Positive: true,

  // Cost stress
  costStressCommissionMultiplier: 1.5,
  costStressSlippageMultiplier: 1.5,
};

export type ResearchConfig = {
  [K in keyof typeof DEFAULT_RESEARCH_CONFIG]: (typeof DEFAULT_RESEARCH_CONFIG)[K];
};

export function mergeResearchConfig(
  partial?: Partial<ResearchConfig>
): ResearchConfig {
  return { ...DEFAULT_RESEARCH_CONFIG, ...partial };
}
