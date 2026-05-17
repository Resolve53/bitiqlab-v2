import type { NextApiRequest, NextApiResponse } from 'next';
import { performWalkForwardAnalysis } from '@/lib/walk-forward-validator';
import { asyncHandler } from '@/lib/utils';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { strategyId, symbol, entryRules, exitRules, window = '12m', ohlcvData } = req.body;

  if (!symbol || !entryRules || !exitRules) {
    return res.status(400).json({
      error: 'Missing required fields: symbol, entryRules, exitRules',
    });
  }

  if (!ohlcvData || ohlcvData.length < 100) {
    return res.status(400).json({
      error: 'Insufficient OHLCV data (minimum 100 candles required)',
    });
  }

  try {
    const strategyRules = { entryRules, exitRules };

    // Perform walk-forward analysis
    const wfAnalysis = await performWalkForwardAnalysis(
      symbol,
      strategyRules,
      window as '12m' | '6m' | '3m',
      ohlcvData
    );

    res.status(200).json({
      success: true,
      data: {
        strategyId,
        symbol,
        window,
        walkForwardAnalysis: wfAnalysis,
        metadata: {
          dataPoints: ohlcvData.length,
          analysisType: 'walk-forward-validation',
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Error validating strategy with walk-forward:', error);
    res.status(500).json({
      error: 'Failed to validate strategy',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
