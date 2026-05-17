import axios from 'axios';

interface FundingRate {
  symbol: string;
  fundingRate: number; // as percentage (e.g., 0.0123 = 1.23%)
  fundingTimestamp: number;
  nextFundingTime: number;
  markPrice: number;
  indexPrice: number;
}

const BINANCE_PERPETUAL_URL = 'https://fapi.binance.com/fapi/v1';

interface CacheEntry {
  data: { [key: string]: FundingRate };
  fetchedAt: number;
}

let fundingRateCache: CacheEntry = { data: {}, fetchedAt: 0 };
const CACHE_DURATION = 30 * 1000; // 30 seconds

export async function getFundingRates(symbols: string[]): Promise<FundingRate[]> {
  // Return cached values if still valid
  if (Date.now() - fundingRateCache.fetchedAt < CACHE_DURATION) {
    return symbols
      .map((s) => fundingRateCache.data[s])
      .filter((r): r is FundingRate => !!r);
  }

  try {
    const results = await Promise.all(
      symbols.map((symbol) => getFundingRate(symbol))
    );

    // Update cache
    const newCache: { [key: string]: FundingRate } = {};
    results.forEach((rate) => {
      if (rate) newCache[rate.symbol] = rate;
    });
    fundingRateCache = { data: newCache, fetchedAt: Date.now() };

    return results.filter((r): r is FundingRate => !!r);
  } catch (error) {
    console.error('Error fetching funding rates:', error);
    return [];
  }
}

async function getFundingRate(symbol: string): Promise<FundingRate | null> {
  try {
    const response = await axios.get(`${BINANCE_PERPETUAL_URL}/fundingRate`, {
      params: { symbol },
      timeout: 5000,
    });

    if (!response.data) return null;

    const data = response.data[0] || response.data;

    return {
      symbol: data.symbol || symbol,
      fundingRate: parseFloat(data.fundingRate || '0') * 100, // Convert to percentage
      fundingTimestamp: parseInt(data.fundingTime || Date.now()),
      nextFundingTime: parseInt(data.fundingTime || Date.now()) + 8 * 60 * 60 * 1000, // 8 hours
      markPrice: parseFloat(data.markPrice || '0'),
      indexPrice: parseFloat(data.indexPrice || '0'),
    };
  } catch (error) {
    console.error(`Error fetching funding rate for ${symbol}:`, error);
    return null;
  }
}

export function assessFundingRateSignal(rate: FundingRate): {
  bullishSignal: boolean;
  reason: string;
  score: number; // 0-100
} {
  const { fundingRate } = rate;

  let bullishSignal = false;
  let score = 0;
  let reason = '';

  // High positive funding rate = more shorts, potential squeeze = bullish
  // High negative funding rate = more longs, potential dump = bearish
  if (fundingRate > 0.1) {
    bullishSignal = true;
    score = 75;
    reason = 'High positive funding (>0.1%) - shorts are expensive, potential long squeeze';
  } else if (fundingRate > 0.05) {
    bullishSignal = true;
    score = 50;
    reason = 'Positive funding rate - slight short pressure';
  } else if (fundingRate > -0.05) {
    bullishSignal = false;
    score = 50;
    reason = 'Neutral funding rate - no strong signal';
  } else if (fundingRate > -0.1) {
    bullishSignal = false;
    score = 30;
    reason = 'Negative funding rate - slight long liquidation risk';
  } else {
    bullishSignal = false;
    score = 10;
    reason = 'High negative funding (<-0.1%) - longs are expensive, watch for liquidations';
  }

  return { bullishSignal, reason, score };
}

export async function getPerpetualOpenInterest(symbol: string): Promise<{
  symbol: string;
  openInterest: number; // in USD
  longPercentage: number; // 0-1
  shortPercentage: number; // 0-1
} | null> {
  try {
    const response = await axios.get(`${BINANCE_PERPETUAL_URL}/openInterest`, {
      params: { symbol },
      timeout: 5000,
    });

    if (!response.data) return null;

    return {
      symbol: response.data.symbol || symbol,
      openInterest: parseFloat(response.data.openInterest || '0'),
      longPercentage: 0.5, // Binance doesn't expose this directly; would need additional API
      shortPercentage: 0.5,
    };
  } catch (error) {
    console.error(`Error fetching open interest for ${symbol}:`, error);
    return null;
  }
}
