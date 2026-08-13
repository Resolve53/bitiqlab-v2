/**
 * Type declarations for autoresearch wrapper (legacy .d.ts)
 * Production implementation: src/autoresearch/wrapper.ts
 */

export interface TrainingConfig {
  [key: string]: any;
}

export interface TrainingResult {
  success: boolean;
  output: string;
  message: string;
}

export interface EnvironmentStatus {
  success: boolean;
  pythonAvailable: boolean;
  torchAvailable: boolean;
  output?: string;
  error?: string;
  message?: string;
}

export interface Metadata {
  success: boolean;
  name?: string;
  version?: string;
  description?: string;
  readme?: string;
  program?: string;
  error?: string;
}

export interface GenerateConfig {
  prompt: string;
  symbol: string;
  timeframe: string;
  market_type: "spot" | "futures";
  leverage?: number;
}

/** Truth Engine–compatible generated strategy (structured entries). */
export interface GeneratedStrategy {
  name: string;
  description: string;
  symbol: string;
  timeframe: string;
  market_type: "spot" | "futures";
  leverage: number;
  entries: Array<{
    direction: "long" | "short";
    condition: Record<string, unknown>;
  }>;
  exit_condition?: Record<string, unknown> | null;
  stop_loss_percent: number;
  take_profit_percent?: number;
  risk_per_trade_pct: number;
  status: string;
  created_at: Date;
  version: number;
}

export function trainModel(config?: TrainingConfig): Promise<TrainingResult>;
export function prepareData(config?: any): Promise<TrainingResult>;
export function runAnalysis(): Promise<any>;
export function checkEnvironment(): Promise<EnvironmentStatus>;
export function getMetadata(): Promise<Metadata>;

export class StrategyGenerator {
  constructor(apiKey: string, options?: { client?: unknown; model?: string });
  generate(config: GenerateConfig): Promise<GeneratedStrategy>;
  generateCorrected(
    config: GenerateConfig,
    previous: unknown,
    validationError: string
  ): Promise<GeneratedStrategy>;
  suggestImprovements(strategy: any, backtestResult: any): Promise<any>;
}

export class AutoresearchOptimizer {
  optimize(strategy: any, backtestData: any): Promise<any>;
}

export default {
  StrategyGenerator,
  AutoresearchOptimizer,
};
