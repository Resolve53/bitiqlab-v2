import type { NextApiRequest, NextApiResponse } from 'next';
import { getOnChainMetrics, scanOnChainSignals } from '@/lib/on-chain-service';
import { asyncHandler } from '@/lib/utils';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let symbols: string[] = [];

  if (req.method === 'POST') {
    const { symbols: bodySymbols } = req.body;
    symbols = bodySymbols || [];
  } else {
    const { symbols: querySymbols, symbol } = req.query;
    if (symbol) {
      symbols = [String(symbol)];
    } else if (querySymbols) {
      symbols = (String(querySymbols)).split(',');
    }
  }

  if (!symbols || symbols.length === 0) {
    return res.status(400).json({
      error: 'Missing symbols. Provide ?symbol=BTCUSDT or ?symbols=BTCUSDT,ETHUSDT or POST with symbols array',
    });
  }

  try {
    // Single symbol
    if (symbols.length === 1) {
      const metrics = await getOnChainMetrics(symbols[0]);
      return res.status(200).json({
        success: true,
        data: metrics,
      });
    }

    // Multiple symbols - get all and sort by score
    const metricsArray = await scanOnChainSignals(symbols);
    return res.status(200).json({
      success: true,
      data: {
        count: metricsArray.length,
        metrics: metricsArray,
        topSignals: metricsArray.filter((m) => m.combinedScore >= 70),
      },
    });
  } catch (error) {
    console.error('Error fetching on-chain data:', error);
    res.status(500).json({ error: 'Failed to fetch on-chain data' });
  }
});
