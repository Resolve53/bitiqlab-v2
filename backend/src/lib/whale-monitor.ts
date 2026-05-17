import { BinanceTradingClient } from './binance-trading';

interface WhaleActivity {
  symbol: string;
  timestamp: number;
  largeOrderCount: number;
  largeOrderVolume: number; // in base currency
  buyVolume: number;
  sellVolume: number;
  netVolume: number; // positive = more buying
  bullishSignal: boolean;
  confidence: number; // 0-100
}

const LARGE_ORDER_THRESHOLD = 500000; // $500k+ is considered "whale"

export async function detectWhaleActivity(symbol: string): Promise<WhaleActivity> {
  try {
    const client = new BinanceTradingClient();
    const orderBook = await client.getOrderBook(symbol, 20);

    if (!orderBook) {
      return createEmptyWhaleActivity(symbol);
    }

    const { bids, asks } = orderBook;
    let largeOrderCount = 0;
    let largeOrderVolume = 0;
    let buyVolume = 0;
    let sellVolume = 0;

    // Analyze buy side (bids)
    for (const [price, quantity] of bids) {
      const value = parseFloat(price) * parseFloat(quantity);
      buyVolume += value;

      if (value > LARGE_ORDER_THRESHOLD) {
        largeOrderCount++;
        largeOrderVolume += value;
      }
    }

    // Analyze sell side (asks)
    for (const [price, quantity] of asks) {
      const value = parseFloat(price) * parseFloat(quantity);
      sellVolume += value;

      if (value > LARGE_ORDER_THRESHOLD) {
        largeOrderCount++;
        largeOrderVolume += value;
      }
    }

    const netVolume = buyVolume - sellVolume;
    const bullishSignal = netVolume > 0 && largeOrderCount > 2;
    const confidence = calculateConfidence(largeOrderCount, largeOrderVolume, netVolume);

    return {
      symbol,
      timestamp: Date.now(),
      largeOrderCount,
      largeOrderVolume,
      buyVolume,
      sellVolume,
      netVolume,
      bullishSignal,
      confidence,
    };
  } catch (error) {
    console.error(`Error detecting whale activity for ${symbol}:`, error);
    return createEmptyWhaleActivity(symbol);
  }
}

export async function scanWhalesAcrossCoins(symbols: string[]): Promise<WhaleActivity[]> {
  const results = await Promise.all(symbols.map((s) => detectWhaleActivity(s)));
  return results.filter((r) => r.confidence > 30); // Only return meaningful signals
}

function calculateConfidence(
  largeOrderCount: number,
  largeOrderVolume: number,
  netVolume: number
): number {
  let confidence = 0;

  // Factor 1: Number of large orders
  if (largeOrderCount >= 5) confidence += 40;
  else if (largeOrderCount >= 3) confidence += 25;
  else if (largeOrderCount >= 1) confidence += 10;

  // Factor 2: Total volume of large orders
  if (largeOrderVolume > 5000000) confidence += 35; // >$5M
  else if (largeOrderVolume > 2000000) confidence += 20;
  else if (largeOrderVolume > 500000) confidence += 10;

  // Factor 3: Net volume direction
  if (netVolume > largeOrderVolume * 0.2) confidence += 25; // Strong buy pressure
  else if (netVolume < -largeOrderVolume * 0.2) confidence += 15; // Sell pressure

  return Math.min(confidence, 100);
}

function createEmptyWhaleActivity(symbol: string): WhaleActivity {
  return {
    symbol,
    timestamp: Date.now(),
    largeOrderCount: 0,
    largeOrderVolume: 0,
    buyVolume: 0,
    sellVolume: 0,
    netVolume: 0,
    bullishSignal: false,
    confidence: 0,
  };
}
