/**
 * Phase 2 — Validation & Anti-Overfitting Engine
 */

export {
  DEFAULT_VALIDATION_CONFIG,
  mergeValidationConfig,
  type ValidationConfig,
} from "./config";
export { runValidation, type StrategyRow } from "./orchestrator";
export {
  chronologicalSplitIndices,
  assertNoSplitOverlap,
  sliceBars,
} from "./splits";
export { buildWalkForwardWindows } from "./walk-forward";
export { computeDegradation } from "./degradation";
export {
  buildSensitivityVariants,
  assertOriginalUnchanged,
} from "./sensitivity";
export {
  classifyTrendRegimes,
  classifyVolRegimes,
  REGIME_DEFINITIONS,
} from "./regimes";
export { DEFAULT_COST_STRESS_CASES } from "./cost-stress";
export { evaluateSampleIntegrity } from "./sample-integrity";
export { evaluateGate } from "./gate";
export { summarizeMetrics } from "./types";
export type * from "./types";
