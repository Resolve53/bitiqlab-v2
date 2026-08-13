/**
 * Phase 3 — Controlled Autoresearch Engine
 */

export {
  RESEARCH_ENGINE_VERSION,
  SPLIT_POLICY_VERSION,
  DEFAULT_RESEARCH_CONFIG,
  mergeResearchConfig,
  type ResearchConfig,
} from "./config";
export { runControlledResearch, TestLeakageError, type StrategyRow } from "./orchestrator";
export type { ResearchPersistence } from "./orchestrator";
export {
  applyMutation,
  assertParentUnchanged,
  getAtPath,
  parsePath,
} from "./mutation-applier";
export {
  ALLOWED_MUTATION_TYPES,
  SUBMIT_STRATEGY_MUTATION_TOOL,
  parseStructuredMutation,
} from "./mutation-schema";
export { createClaudeMutationProposer } from "./mutation-proposer";
export { evaluateSelection } from "./selection-gate";
export {
  hashStrategyRules,
  hashBars,
  buildExperimentId,
  stableStringify,
} from "./experiment-id";
export {
  assertNoTestPayload,
  assertTrainDiagnosticsOnly,
  assertSelectionMetricsHaveNoTest,
} from "./isolation";
export {
  Phase3PersistenceError,
  PHASE3_PERSISTENCE_UNAVAILABLE,
  isMissingPhase3RelationError,
  throwIfMissingPhase3Relation,
} from "./persistence-errors";
export type * from "./types";
