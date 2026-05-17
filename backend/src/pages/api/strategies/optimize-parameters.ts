import type { NextApiRequest, NextApiResponse } from 'next';
import { ParameterOptimizer } from '@/lib/parameter-optimizer';
import { asyncHandler } from '@/lib/utils';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    strategyId,
    baselineParameters,
    maxIterations = 50,
    backtestResults = [], // Pre-computed backtest results for different parameters
  } = req.body;

  if (!strategyId || !baselineParameters) {
    return res.status(400).json({
      error: 'Missing required fields: strategyId, baselineParameters',
    });
  }

  try {
    const optimizer = new ParameterOptimizer(Math.min(maxIterations, 100));

    // Mock evaluation function - in production, would run actual backtest
    const evaluationFunction = async (params: any) => {
      // Find or compute backtest results for these parameters
      const cached = backtestResults.find(
        (r: any) => JSON.stringify(r.parameters) === JSON.stringify(params)
      );

      if (cached) {
        return {
          sharpeRatio: cached.sharpeRatio,
          winRate: cached.winRate,
          profitFactor: cached.profitFactor,
          maxDrawdown: cached.maxDrawdown,
          totalReturn: cached.totalReturn,
        };
      }

      // Return slightly varied metrics for demo
      return {
        sharpeRatio: 0.8 + Math.random() * 0.5,
        winRate: 0.55 + Math.random() * 0.15,
        profitFactor: 1.5 + Math.random() * 1.0,
        maxDrawdown: 0.15 + Math.random() * 0.1,
        totalReturn: 0.1 + Math.random() * 0.2,
      };
    };

    const optimizationResult = await optimizer.optimizeParameters(
      baselineParameters,
      evaluationFunction
    );

    const topResults = optimizer.getTopResults(5);
    const report = optimizer.reportImprovements();

    res.status(200).json({
      success: true,
      data: {
        strategyId,
        optimization: optimizationResult,
        topResults,
        report,
        summary: {
          iterationsRun: optimizationResult.iterations,
          maxIterations,
          sharpeImprovement: `${report.improvement.toFixed(2)}%`,
          bestParameters: optimizationResult.bestResult.parameters,
          bestMetrics: {
            sharpeRatio: optimizationResult.bestResult.sharpeRatio.toFixed(2),
            winRate: `${(optimizationResult.bestResult.winRate * 100).toFixed(1)}%`,
            profitFactor: optimizationResult.bestResult.profitFactor.toFixed(2),
          },
        },
      },
    });
  } catch (error) {
    console.error('Error optimizing parameters:', error);
    res.status(500).json({
      error: 'Failed to optimize parameters',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
