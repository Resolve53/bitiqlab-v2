/**
 * Strategy Signal Evaluator
 * Evaluates strategies and generates trading signals in real-time
 */

import { BinanceDataFetcher, calculateIndicators } from "./binance-fetcher";

export interface StrategySignal {
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reason: string;
  indicators: {
    rsi?: number;
    macd?: { line: number; signal: number; histogram: number };
    bollinger_bands?: { upper: number; middle: number; lower: number };
    sma_20?: number;
    sma_50?: number;
  };
}

export interface EntryRules {
  indicators?: string[];
  conditions?: string[];
}

export interface ExitRules {
  stop_loss_percent?: number;
  take_profit_percent?: number;
  conditions?: string[];
}

export class StrategyEvaluator {
  private fetcher: BinanceDataFetcher;
  private indicatorCache: Map<string, any> = new Map();
  private cacheExpiry: number = 60000; // 1 minute

  constructor() {
    this.fetcher = new BinanceDataFetcher();
  }

  /**
   * Evaluate strategy entry conditions
   */
  async evaluateEntry(
    symbol: string,
    timeframe: string,
    entryRules: EntryRules,
    currentPrice: number
  ): Promise<StrategySignal> {
    try {
      const indicators = await this.getIndicators(symbol, timeframe);
      let confidence = 0;
      let reason = "";
      const signalReasons: string[] = [];

      // Normalize entry rules — conditions may be string or array from DB
      const ruleIndicators = Array.isArray(entryRules.indicators) ? entryRules.indicators : [];
      const ruleConditions = Array.isArray(entryRules.conditions)
        ? entryRules.conditions.map((c) => String(c).toLowerCase())
        : typeof entryRules.conditions === "string"
        ? [String(entryRules.conditions).toLowerCase()]
        : [];

      const hasKeyword = (kw: string) =>
        ruleIndicators.some((i) => String(i).toLowerCase().includes(kw)) ||
        ruleConditions.some((c) => c.includes(kw));

      if (indicators) {
        // RSI-based signals
        if (hasKeyword("rsi")) {
          if (indicators.rsi < 30) {
            signalReasons.push("RSI oversold (<30)");
            confidence += 30;
          } else if (indicators.rsi < 40) {
            signalReasons.push("RSI approaching oversold (<40)");
            confidence += 15;
          } else if (indicators.rsi > 70) {
            signalReasons.push("RSI overbought (>70)");
            confidence -= 20;
          }
        }

        // MACD-based signals
        if (hasKeyword("macd")) {
          if (
            indicators.macd.line > indicators.macd.signal &&
            indicators.macd.histogram > 0
          ) {
            signalReasons.push("MACD bullish crossover");
            confidence += 30;
          }
        }

        // Bollinger Bands
        if (hasKeyword("bollinger") || hasKeyword("band")) {
          if (currentPrice < indicators.bollinger_bands.lower) {
            signalReasons.push("Price below lower Bollinger Band");
            confidence += 25;
          } else if (currentPrice < indicators.bollinger_bands.middle) {
            signalReasons.push("Price below Bollinger midline");
            confidence += 10;
          } else if (currentPrice > indicators.bollinger_bands.upper) {
            signalReasons.push("Price above upper Bollinger Band");
            confidence -= 15;
          }
        }

        // Moving Averages
        if (hasKeyword("moving_average") || hasKeyword("moving average") || hasKeyword("sma") || hasKeyword("ema")) {
          if (currentPrice > indicators.sma_20 && indicators.sma_20 > indicators.sma_50) {
            signalReasons.push("Price above MA20, MA20 > MA50 (uptrend)");
            confidence += 25;
          } else if (currentPrice < indicators.sma_20 && indicators.sma_20 < indicators.sma_50) {
            signalReasons.push("Price below MA20, MA20 < MA50 (downtrend)");
            confidence -= 20;
          }
        }

        // If no specific indicators matched, apply a simple price momentum check
        if (signalReasons.length === 0) {
          if (indicators.rsi < 40 && indicators.macd.line > indicators.macd.signal) {
            signalReasons.push("RSI oversold with MACD bullish bias");
            confidence += 35;
          } else if (indicators.rsi > 60) {
            signalReasons.push("RSI elevated — waiting for pullback");
            confidence += 5;
          }
        }
      }

      // Clamp confidence to 0-100
      confidence = Math.max(0, Math.min(100, confidence));
      reason = signalReasons.length > 0 ? signalReasons.join("; ") : "No clear signals";

      // Generate signal based on confidence
      let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
      if (confidence > 50) {
        signal = "BUY";
      } else if (confidence < -20) {
        signal = "SELL";
      }

      return {
        signal,
        confidence: Math.abs(confidence),
        reason,
        indicators,
      };
    } catch (error) {
      console.error("Error evaluating entry:", error);
      return {
        signal: "HOLD",
        confidence: 0,
        reason: `Error evaluating entry: ${error instanceof Error ? error.message : "Unknown error"}`,
        indicators: {},
      };
    }
  }

  /**
   * Evaluate strategy exit conditions
   */
  async evaluateExit(
    symbol: string,
    entryPrice: number,
    currentPrice: number,
    exitRules: ExitRules
  ): Promise<{ shouldExit: boolean; reason: string; exitPrice: number }> {
    const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;

    // Check stop loss
    if (
      exitRules.stop_loss_percent &&
      priceChange < -exitRules.stop_loss_percent
    ) {
      return {
        shouldExit: true,
        reason: `Stop loss hit: ${priceChange.toFixed(2)}% loss`,
        exitPrice: currentPrice,
      };
    }

    // Check take profit
    if (
      exitRules.take_profit_percent &&
      priceChange > exitRules.take_profit_percent
    ) {
      return {
        shouldExit: true,
        reason: `Take profit hit: ${priceChange.toFixed(2)}% gain`,
        exitPrice: currentPrice,
      };
    }

    return {
      shouldExit: false,
      reason: "Position still active",
      exitPrice: currentPrice,
    };
  }

  /**
   * Get cached indicators or fetch new ones
   */
  private async getIndicators(symbol: string, timeframe: string): Promise<any> {
    const cacheKey = `${symbol}-${timeframe}`;
    const cached = this.indicatorCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      // Fetch last 90 days of data
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

      const ohlcv = await this.fetcher.getOHLCV(symbol, timeframe, startDate, endDate);
      const indicators = calculateIndicators(ohlcv);

      // Cache the indicators
      this.indicatorCache.set(cacheKey, {
        data: indicators,
        timestamp: Date.now(),
      });

      return indicators;
    } catch (error) {
      console.error(`Error fetching indicators for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Clear cached indicators
   */
  clearCache(): void {
    this.indicatorCache.clear();
  }

  /**
   * Clear cache for specific symbol
   */
  clearSymbolCache(symbol: string): void {
    const keys = Array.from(this.indicatorCache.keys()).filter((k) =>
      k.startsWith(symbol)
    );
    keys.forEach((k) => this.indicatorCache.delete(k));
  }
}

// Singleton instance
let evaluator: StrategyEvaluator | null = null;

export function getEvaluator(): StrategyEvaluator {
  if (!evaluator) {
    evaluator = new StrategyEvaluator();
  }
  return evaluator;
}
