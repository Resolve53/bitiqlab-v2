import type { NextApiRequest, NextApiResponse } from 'next';
import { TradeExecutionService } from '@/lib/trade-execution-service';
import { asyncHandler } from '@/lib/utils';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    symbol,
    side,
    quantity,
    entryPrice,
    stopLossPercent = 2,
    takeProfitPercent = 5,
    accountBalance = 10000,
    maxRetries = 3,
    retryDelayMs = 1000,
  } = req.body;

  if (!symbol || !side || !quantity || !entryPrice) {
    return res.status(400).json({
      error: 'Missing required fields: symbol, side, quantity, entryPrice',
    });
  }

  try {
    const executionService = new TradeExecutionService(accountBalance);

    const result = await executionService.executeTradeWithRetry({
      symbol,
      side,
      quantity,
      entryPrice,
      stopLossPercent,
      takeProfitPercent,
      maxRetries,
      retryDelayMs,
    });

    const statusCode = result.success ? 200 : 400;

    res.status(statusCode).json({
      success: result.success,
      data: result,
      message: result.success
        ? `Order ${result.orderId} executed at $${result.executedPrice}`
        : `Order rejected after ${result.attempts} attempt(s): ${result.error}`,
    });
  } catch (error) {
    console.error('Error executing trade:', error);
    res.status(500).json({
      error: 'Failed to execute trade',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
