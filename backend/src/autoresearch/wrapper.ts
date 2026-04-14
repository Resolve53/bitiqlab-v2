/**
 * Re-export wrapper from parent directory
 * This file allows TypeScript to find the autoresearch wrapper module
 * The actual implementation is in JavaScript, so we provide type definitions here
 */

export type { GeneratedStrategy, GenerateConfig } from "../autoresearch.d";

// Mock implementations to allow compilation
// The actual JavaScript module will be used at runtime via dynamic imports
export class StrategyGenerator {
  constructor(apiKey?: string) {}
  async generate(config: any) {
    return {} as any;
  }
  async suggestImprovements(strategy: any, backtestResult: any) {
    return {} as any;
  }
}

export class AutoresearchOptimizer {
  async optimize(strategy: any, backtestData: any) {
    return {} as any;
  }
}
