/**
 * LLM Research Layer
 * Autonomous strategy discovery and optimization using Claude API
 */

export { StrategyGenerator } from "./strategy-generator";
export type {
  GenerateStrategyRequest,
  GeneratedStrategy,
} from "./strategy-generator";

export { AutoresearchLoop } from "./autoresearch-loop";
export type { AutoresearchConfig, AutoresearchResult } from "./autoresearch-loop";
