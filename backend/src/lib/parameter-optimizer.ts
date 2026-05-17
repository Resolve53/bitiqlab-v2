export interface StrategyParameters {
  rsiPeriod?: number; // typically 14
  rsiOverbought?: number; // typically 70
  rsiOversold?: number; // typically 30
  macdFastPeriod?: number; // typically 12
  macdSlowPeriod?: number; // typically 26
  macdSignalPeriod?: number; // typically 9
  bollBandsPeriod?: number; // typically 20
  bollBandsDeviation?: number; // typically 2
  smaShortPeriod?: number; // typically 20
  smaLongPeriod?: number; // typically 50
}

export interface OptimizationResult {
  parameters: StrategyParameters;
  sharpeRatio: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalReturn: number;
}

const PARAMETER_RANGES: { [key in keyof StrategyParameters]: [number, number, number] } = {
  rsiPeriod: [10, 20, 2],
  rsiOverbought: [65, 75, 2],
  rsiOversold: [25, 35, 2],
  macdFastPeriod: [10, 15, 1],
  macdSlowPeriod: [24, 28, 1],
  macdSignalPeriod: [8, 10, 1],
  bollBandsPeriod: [18, 22, 1],
  bollBandsDeviation: [1.5, 2.5, 0.25],
  smaShortPeriod: [15, 25, 2],
  smaLongPeriod: [45, 55, 2],
};

export class ParameterOptimizer {
  private maxIterations: number;
  private baselineMetrics: OptimizationResult | null = null;
  private results: OptimizationResult[] = [];

  constructor(maxIterations: number = 50) {
    this.maxIterations = Math.min(maxIterations, 100); // Cap at 100
  }

  async optimizeParameters(
    baselineParams: StrategyParameters,
    evaluationFunction: (params: StrategyParameters) => Promise<Omit<OptimizationResult, 'parameters'>>
  ): Promise<{
    bestResult: OptimizationResult;
    improvements: number;
    iterations: number;
    allResults: OptimizationResult[];
  }> {
    // Evaluate baseline
    const baselineMetrics = await evaluationFunction(baselineParams);
    this.baselineMetrics = { parameters: baselineParams, ...baselineMetrics };
    this.results.push(this.baselineMetrics);

    let bestResult = this.baselineMetrics;
    let iterations = 0;

    // Grid search over parameter ranges
    const paramKeys = Object.keys(baselineParams) as (keyof StrategyParameters)[];

    for (const paramKey of paramKeys) {
      if (iterations >= this.maxIterations) break;

      const [min, max, step] = PARAMETER_RANGES[paramKey] || [0, 100, 10];

      for (let value = min; value <= max; value += step) {
        if (iterations >= this.maxIterations) break;

        const testParams = { ...baselineParams, [paramKey]: value };
        const metrics = await evaluationFunction(testParams);
        const result: OptimizationResult = { parameters: testParams, ...metrics };

        this.results.push(result);
        iterations++;

        // Update best result
        if (this.isBetter(result, bestResult)) {
          bestResult = result;
        }
      }
    }

    const improvement =
      ((bestResult.sharpeRatio - this.baselineMetrics.sharpeRatio) /
        this.baselineMetrics.sharpeRatio) *
      100;

    return {
      bestResult,
      improvements: improvement,
      iterations,
      allResults: this.results,
    };
  }

  private isBetter(
    candidate: OptimizationResult,
    current: OptimizationResult
  ): boolean {
    // Score based on weighted combination
    const candidateScore = this.calculateScore(candidate);
    const currentScore = this.calculateScore(current);
    return candidateScore > currentScore;
  }

  private calculateScore(result: OptimizationResult): number {
    // Weight: Sharpe 50%, Win Rate 30%, Profit Factor 20%
    const sharpeWeight = 0.5;
    const winRateWeight = 0.3;
    const profitFactorWeight = 0.2;

    const sharpeScore = Math.min(result.sharpeRatio / 2, 1); // Normalize to 0-1
    const winRateScore = result.winRate;
    const profitFactorScore = Math.min(result.profitFactor / 3, 1); // Normalize to 0-1

    return sharpeScore * sharpeWeight + winRateScore * winRateWeight + profitFactorScore * profitFactorWeight;
  }

  getSortedResults(): OptimizationResult[] {
    return this.results.sort((a, b) => this.calculateScore(b) - this.calculateScore(a));
  }

  getTopResults(count: number = 5): OptimizationResult[] {
    return this.getSortedResults().slice(0, count);
  }

  reportImprovements(): {
    baselineSharpe: number;
    bestSharpe: number;
    improvement: number;
    winRateChange: number;
  } {
    if (!this.baselineMetrics) {
      throw new Error('No baseline metrics available');
    }

    const best = this.getSortedResults()[0];
    return {
      baselineSharpe: this.baselineMetrics.sharpeRatio,
      bestSharpe: best.sharpeRatio,
      improvement: ((best.sharpeRatio - this.baselineMetrics.sharpeRatio) / this.baselineMetrics.sharpeRatio) * 100,
      winRateChange: (best.winRate - this.baselineMetrics.winRate) * 100,
    };
  }
}
