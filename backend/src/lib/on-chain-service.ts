import { getFearGreedIndex, getOptimalTradeCondition } from './fear-greed-service';
import { detectWhaleActivity, scanWhalesAcrossCoins } from './whale-monitor';
import { getFundingRates, assessFundingRateSignal } from './funding-rates';

export interface OnChainMetrics {
  symbol: string;
  fearGreedIndex: {
    value: number;
    classification: string;
    isOptimal: boolean;
    score: number;
  };
  whaleActivity: {
    largeOrderCount: number;
    bullishSignal: boolean;
    confidence: number;
  };
  fundingRate: {
    rate: number;
    bullishSignal: boolean;
    score: number;
  };
  combinedScore: number; // 0-100
  recommendation: string;
}

export async function getOnChainMetrics(symbol: string): Promise<OnChainMetrics> {
  try {
    // Fetch all data in parallel
    const [fearGreed, whales, fundingRates] = await Promise.all([
      getFearGreedIndex(),
      detectWhaleActivity(symbol),
      getFundingRates([symbol]),
    ]);

    const fearGreedSignal = getOptimalTradeCondition(fearGreed);
    const fundingSignal = fundingRates.length > 0 ? assessFundingRateSignal(fundingRates[0]) : null;

    // Calculate combined score
    const combinedScore = calculateCombinedScore(
      fearGreedSignal.score,
      whales.confidence,
      fundingSignal?.score || 50
    );

    // Generate recommendation
    const recommendation = generateRecommendation(
      fearGreedSignal,
      whales,
      fundingSignal,
      combinedScore
    );

    return {
      symbol,
      fearGreedIndex: {
        value: fearGreed.value,
        classification: fearGreed.classification,
        isOptimal: fearGreedSignal.isOptimal,
        score: fearGreedSignal.score,
      },
      whaleActivity: {
        largeOrderCount: whales.largeOrderCount,
        bullishSignal: whales.bullishSignal,
        confidence: whales.confidence,
      },
      fundingRate: {
        rate: fundingRates[0]?.fundingRate ?? 0,
        bullishSignal: fundingSignal?.bullishSignal || false,
        score: fundingSignal?.score || 50,
      },
      combinedScore,
      recommendation,
    };
  } catch (error) {
    console.error(`Error getting on-chain metrics for ${symbol}:`, error);
    return createEmptyMetrics(symbol);
  }
}

export async function scanOnChainSignals(symbols: string[]): Promise<OnChainMetrics[]> {
  const results = await Promise.all(symbols.map((s) => getOnChainMetrics(s)));
  return results.sort((a, b) => b.combinedScore - a.combinedScore); // Sort by strength
}

function calculateCombinedScore(
  fearGreedScore: number,
  whaleScore: number,
  fundingScore: number
): number {
  // Weighted average: fear-greed 40%, whale activity 35%, funding rate 25%
  const weighted = fearGreedScore * 0.4 + whaleScore * 0.35 + fundingScore * 0.25;
  return Math.round(weighted);
}

function generateRecommendation(
  fearGreed: any,
  whales: any,
  funding: any,
  combinedScore: number
): string {
  const signals: string[] = [];

  if (fearGreed.isOptimal) signals.push('Fear/Greed: optimal zone');
  if (whales.bullishSignal) signals.push('Whale activity: bullish');
  if (funding?.bullishSignal) signals.push('Funding rate: favorable');

  if (combinedScore >= 80) {
    return `Strong buy signal (${combinedScore}/100). ${signals.join(', ')}`;
  } else if (combinedScore >= 60) {
    return `Moderate buy signal (${combinedScore}/100). ${signals.join(', ')}`;
  } else if (combinedScore >= 40) {
    return `Neutral zone (${combinedScore}/100). Wait for confirmation.`;
  } else if (combinedScore >= 20) {
    return `Caution zone (${combinedScore}/100). Consider avoiding entries.`;
  } else {
    return `Strong sell/avoid signal (${combinedScore}/100). Poor conditions.`;
  }
}

function createEmptyMetrics(symbol: string): OnChainMetrics {
  return {
    symbol,
    fearGreedIndex: {
      value: 50,
      classification: 'Neutral',
      isOptimal: false,
      score: 50,
    },
    whaleActivity: {
      largeOrderCount: 0,
      bullishSignal: false,
      confidence: 0,
    },
    fundingRate: {
      rate: 0,
      bullishSignal: false,
      score: 50,
    },
    combinedScore: 50,
    recommendation: 'Unable to fetch on-chain data. Use with caution.',
  };
}
