import Anthropic from '@anthropic-ai/sdk';

export interface TradeScore {
  tradeId: string;
  tradeQualityScore: number; // 0-100
  calendarImpactScore: number; // 0-100
  onChainImpactScore: number; // 0-100
  combinedScore: number; // 0-100
  analysis: string;
  factors: {
    entryQuality: string;
    exitQuality: string;
    riskRewardRatio: string;
    timeOfEntry: string;
    marketConditions: string;
  };
}

interface TradeContext {
  tradeId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  entryTime: number;
  exitTime?: number;
  quantity: number;
  pnl?: number;
  pnlPercent?: number;
  confidence?: number;
  technicalSignals?: string[];
  calendarEvent?: {
    eventName: string;
    importance: string;
  };
  onChainData?: {
    fearGreedValue: number;
    whaleActivity: boolean;
    fundingRate: number;
  };
}

const client = new Anthropic();

export async function scoreTrade(context: TradeContext): Promise<TradeScore> {
  try {
    const prompt = buildScoringPrompt(context);

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const analysisText =
      response.content[0].type === 'text' ? response.content[0].text : '';
    const scores = parseScores(analysisText, context);

    return scores;
  } catch (error) {
    console.error('Error scoring trade:', error);
    return createDefaultScore(context);
  }
}

function buildScoringPrompt(context: TradeContext): string {
  const isCompleted = !!context.exitPrice;
  const duration = isCompleted ? (context.exitTime! - context.entryTime) / 1000 / 60 : null; // minutes

  return `Analyze this cryptocurrency trade and provide quality scores:

TRADE DETAILS:
- Symbol: ${context.symbol}
- Side: ${context.side}
- Entry Price: $${context.entryPrice.toFixed(2)}
${isCompleted ? `- Exit Price: $${context.exitPrice!.toFixed(2)}` : '- Trade OPEN'}
${isCompleted ? `- P&L: ${context.pnlPercent!.toFixed(2)}% ($${context.pnl!.toFixed(2)})` : ''}
${isCompleted ? `- Duration: ${duration} minutes` : ''}
- Entry Confidence: ${context.confidence || 'Unknown'}%
- Technical Signals: ${context.technicalSignals?.join(', ') || 'None specified'}

MARKET CONTEXT AT ENTRY:
${context.calendarEvent ? `- Economic Event: ${context.calendarEvent.eventName} (${context.calendarEvent.importance})` : '- No major economic event'}
${context.onChainData ? `- Fear/Greed Index: ${context.onChainData.fearGreedValue}/100` : ''}
${context.onChainData?.whaleActivity ? '- Whale Activity: Detected' : ''}
${context.onChainData ? `- Funding Rate: ${context.onChainData.fundingRate.toFixed(3)}%` : ''}

PROVIDE SCORES (0-100 scale):
1. Trade Quality Score (40% weight): Entry/exit timing, risk management, technical confluence
2. Calendar Impact Score (20% weight): How did the economic event (if any) affect this trade?
3. On-Chain Impact Score (20% weight): How favorable were fear/greed index and whale activity?
4. Combined Score (weighted average of above)

FORMAT YOUR RESPONSE EXACTLY AS:
TRADE_QUALITY: [score]
CALENDAR_IMPACT: [score]
ONCHAIN_IMPACT: [score]
COMBINED: [score]
ANALYSIS: [brief 2-3 sentence analysis]

Be strict: entry during high-impact events without proper precautions = lower scores. Perfect technical setup + favorable market conditions = higher scores.`;
}

function parseScores(analysisText: string, context: TradeContext): TradeScore {
  const tradeQualityMatch = analysisText.match(/TRADE_QUALITY:\s*(\d+)/);
  const calendarMatch = analysisText.match(/CALENDAR_IMPACT:\s*(\d+)/);
  const onChainMatch = analysisText.match(/ONCHAIN_IMPACT:\s*(\d+)/);
  const combinedMatch = analysisText.match(/COMBINED:\s*(\d+)/);
  const analysisMatch = analysisText.match(/ANALYSIS:\s*(.+?)(?=\n|$)/i);

  const tradeQualityScore = tradeQualityMatch ? parseInt(tradeQualityMatch[1]) : 50;
  const calendarImpactScore = calendarMatch ? parseInt(calendarMatch[1]) : 50;
  const onChainImpactScore = onChainMatch ? parseInt(onChainMatch[1]) : 50;
  const combinedScore = combinedMatch ? parseInt(combinedMatch[1]) : 50;
  const analysis = analysisMatch
    ? analysisMatch[1].trim()
    : 'Trade analysis unavailable';

  return {
    tradeId: context.tradeId,
    tradeQualityScore,
    calendarImpactScore,
    onChainImpactScore,
    combinedScore,
    analysis,
    factors: {
      entryQuality: `${context.confidence || 50}% confidence`,
      exitQuality: context.pnlPercent ? `${context.pnlPercent.toFixed(2)}% P&L` : 'Open position',
      riskRewardRatio: context.pnl ? `${(context.pnl / (context.quantity * context.entryPrice * 0.02)).toFixed(2)}:1` : 'Not calculated',
      timeOfEntry: new Date(context.entryTime).toISOString(),
      marketConditions: `Fear/Greed: ${context.onChainData?.fearGreedValue || 'N/A'}/100`,
    },
  };
}

function createDefaultScore(context: TradeContext): TradeScore {
  return {
    tradeId: context.tradeId,
    tradeQualityScore: 50,
    calendarImpactScore: 50,
    onChainImpactScore: 50,
    combinedScore: 50,
    analysis: 'Trade scoring unavailable - using default score',
    factors: {
      entryQuality: 'Not scored',
      exitQuality: 'Not scored',
      riskRewardRatio: 'Not calculated',
      timeOfEntry: new Date(context.entryTime).toISOString(),
      marketConditions: 'Not analyzed',
    },
  };
}
