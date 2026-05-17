import type { NextApiRequest, NextApiResponse } from 'next';
import { scoreTrade } from '@/lib/trade-scorer';
import { getOnChainMetrics } from '@/lib/on-chain-service';
import { getEventImpact } from '@/lib/calendar-service';
import { DatabaseService } from '@/lib/db';
import { asyncHandler } from '@/lib/utils';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tradeId, symbol, side, entryPrice, exitPrice, entryTime, exitTime, quantity, pnl, pnlPercent, confidence, technicalSignals } = req.body;

  if (!tradeId || !symbol || !entryPrice || !entryTime) {
    return res.status(400).json({
      error: 'Missing required fields: tradeId, symbol, entryPrice, entryTime',
    });
  }

  try {
    // Fetch on-chain data
    const onChainData = await getOnChainMetrics(symbol);

    // Fetch calendar event if within entry window
    const calendarEvent = await getEventImpact(symbol, new Date(entryTime).toISOString().split('T')[0]);

    // Build trade context
    const tradeContext = {
      tradeId,
      symbol,
      side: side || 'BUY',
      entryPrice,
      exitPrice,
      entryTime,
      exitTime,
      quantity,
      pnl,
      pnlPercent,
      confidence,
      technicalSignals: technicalSignals || [],
      calendarEvent: calendarEvent.hasEvent ? {
        eventName: calendarEvent.eventName || 'Unknown Event',
        importance: calendarEvent.importance || 'low',
      } : undefined,
      onChainData: {
        fearGreedValue: onChainData.fearGreedIndex.value,
        whaleActivity: onChainData.whaleActivity.bullishSignal,
        fundingRate: onChainData.fundingRate.rate,
      },
    };

    // Score the trade
    const score = await scoreTrade(tradeContext);

    // Optionally save to database
    const db = new DatabaseService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await db.saveTradeScore({
      tradeId: score.tradeId,
      tradeQualityScore: score.tradeQualityScore,
      calendarImpactScore: score.calendarImpactScore,
      onChainImpactScore: score.onChainImpactScore,
      combinedScore: score.combinedScore,
      analysisNotes: score.analysis,
    });

    res.status(200).json({
      success: true,
      data: score,
    });
  } catch (error) {
    console.error('Error scoring trade:', error);
    res.status(500).json({ error: 'Failed to score trade' });
  }
});
