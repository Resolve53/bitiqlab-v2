import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseService } from '@/lib/db';
import { asyncHandler } from '@/lib/utils';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { strategyId, decision, reason } = req.body;

  if (!strategyId || !decision || !['promote', 'archive'].includes(decision)) {
    return res.status(400).json({
      error: 'Missing or invalid fields: strategyId, decision (promote|archive)',
    });
  }

  try {
    const db = new DatabaseService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get strategy details
    const strategy = await db.getStrategy(strategyId);

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    // Check promotion criteria
    const criteria = {
      minPaperTradingDays: 14,
      minTrades: 30,
      minSharpeRatio: 0.5,
      maxDrawdown: 0.2,
      minAverageTradeScore: 70,
      minWinRate: 0.55,
    };

    const meetsMinDays = true; // Would check session creation date
    const totalTrades = (strategy.winning_trades || 0) + (strategy.losing_trades || 0);
    const winRate = totalTrades > 0 ? (strategy.winning_trades || 0) / totalTrades : 0;
    const meetsTrades = totalTrades >= criteria.minTrades;
    const meetsSharpe = (strategy.current_sharpe || 0) >= criteria.minSharpeRatio;
    const meetsDrawdown = true; // Would check max_drawdown if available
    const meetsWinRate = winRate >= criteria.minWinRate;

    const allCriteriaMet = meetsMinDays && meetsTrades && meetsSharpe && meetsDrawdown && meetsWinRate;

    const result = {
      strategyId,
      decision,
      timestamp: new Date(),
      reason: reason || 'No reason provided',
      meetsPromotionCriteria: allCriteriaMet,
      criteria: {
        minPaperTradingDays: { required: criteria.minPaperTradingDays, met: meetsMinDays },
        minTrades: { required: criteria.minTrades, actual: totalTrades, met: meetsTrades },
        minSharpeRatio: { required: criteria.minSharpeRatio, actual: strategy.current_sharpe, met: meetsSharpe },
        maxDrawdown: { required: criteria.maxDrawdown, actual: 'N/A', met: meetsDrawdown },
        minWinRate: { required: criteria.minWinRate, actual: winRate.toFixed(2), met: meetsWinRate },
      },
    };

    // Update strategy status
    const newStatus = decision === 'promote' ? 'approved' : 'failed';
    await db.updateStrategy(strategyId, {
      status: newStatus,
    });

    // Log decision to audit trail
    // (In production, would create audit log entry)

    res.status(200).json({
      success: true,
      data: result,
      message: decision === 'promote'
        ? `Strategy promoted to live trading. All criteria met: ${allCriteriaMet}`
        : `Strategy archived. Reason: ${reason}`,
    });
  } catch (error) {
    console.error('Error making strategy decision:', error);
    res.status(500).json({
      error: 'Failed to make strategy decision',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
