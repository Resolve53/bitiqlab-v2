/**
 * Type declarations for autoresearch wrapper
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

export interface GeneratedStrategy {
  name: string;
  description: string;
  symbol: string;
  timeframe: string;
  market_type: "spot" | "futures";
  leverage: number;
  entry_rules: Record<string, any>;
  exit_rules: Record<string, any>;
  position_sizing: Record<string, any>;
  status: string;
  created_at: Date;
  version: number;
  backtest_count: number;
}

export function trainModel(config?: TrainingConfig): Promise<TrainingResult>;
export function prepareData(config?: any): Promise<TrainingResult>;
export function runAnalysis(): Promise<any>;
export function checkEnvironment(): Promise<EnvironmentStatus>;
export function getMetadata(): Promise<Metadata>;

export class StrategyGenerator {
  constructor(apiKey: string);
  generate(config: GenerateConfig): Promise<GeneratedStrategy>;
  suggestImprovements(strategy: any, backtestResult: any): Promise<any>;
}

export class AutoresearchOptimizer {
  optimize(strategy: any, backtestData: any): Promise<any>;
}

export default {
  trainModel,
  prepareData,
  runAnalysis,
  checkEnvironment,
  getMetadata,
  StrategyGenerator,
  AutoresearchOptimizer,
};
