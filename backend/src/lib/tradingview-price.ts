/**
 * TradingView Real-Time Price Fetcher
 * Fetches live market data from TradingView
 */

import axios from "axios";

export interface TradingViewPrice {
  symbol: string;
  price: number;
  high24h?: number;
  low24h?: number;
  change24h?: number;
  volume24h?: number;
  timestamp: number;
}

class TradingViewPriceFetcher {
  private baseUrl = "https://api.tradingview.com/api/v1";
  private fallbackUrl = "https://www.tradingview.com/api/v1";
  private cache: Map<string, { data: TradingViewPrice; timestamp: number }> = new Map();
  private cacheExpiry = 5000; // 5 seconds

  /**
   * Get real-time price from TradingView
   * Falls back to Binance if TradingView is unavailable
   */
  async getPrice(symbol: string): Promise<TradingViewPrice> {
    // Check cache first
    const cacheKey = symbol.toUpperCase();
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      // Try TradingView API first
      const tvPrice = await this.fetchFromTradingView(symbol);

      if (tvPrice) {
        this.cache.set(cacheKey, {
          data: tvPrice,
          timestamp: Date.now(),
        });
        return tvPrice;
      }
    } catch (error) {
      console.warn(`TradingView API error for ${symbol}:`, error);
    }

    // Fallback to Binance if TradingView fails
    return this.fetchFromBinance(symbol);
  }

  /**
   * Fetch from TradingView using their public endpoints
   * Symbol format: BTCUSD, ETHUSD, etc.
   */
  private async fetchFromTradingView(symbol: string): Promise<TradingViewPrice | null> {
    try {
      // Convert BTCUSDT to BTCUSD for TradingView
      const tvSymbol = symbol.replace("USDT", "USD").toUpperCase();

      // Try TradingView's quote endpoint
      const response = await axios.get(
        `https://www.tradingview.com/api/v1/quotes/?symbols=${tvSymbol}`,
        {
          timeout: 5000,
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        }
      );

      if (response.data && response.data[tvSymbol]) {
        const data = response.data[tvSymbol];

        return {
          symbol,
          price: data.last_price || data.price || 0,
          high24h: data.max_price,
          low24h: data.min_price,
          change24h: data.change_percent,
          volume24h: data.volume,
          timestamp: Date.now(),
        };
      }

      // Alternative: Try widget endpoint
      return await this.fetchFromTradingViewWidget(tvSymbol, symbol);
    } catch (error) {
      console.warn("TradingView fetch failed:", error);
      return null;
    }
  }

  /**
   * Alternative TradingView widget API
   */
  private async fetchFromTradingViewWidget(
    tvSymbol: string,
    originalSymbol: string
  ): Promise<TradingViewPrice | null> {
    try {
      const response = await axios.get(
        `https://www.tradingview.com/api/v1/symbols/search/?query=${tvSymbol}`,
        { timeout: 5000 }
      );

      if (response.data && response.data[0]) {
        const symbol = response.data[0];

        // Get real-time quote
        const quoteUrl = `https://www.tradingview.com/api/v1/quotes/?symbols=${symbol.symbol}`;
        const quoteResponse = await axios.get(quoteUrl, { timeout: 5000 });

        if (quoteResponse.data) {
          const quote = Object.values(quoteResponse.data)[0] as any;

          return {
            symbol: originalSymbol,
            price: quote.last_price || quote.price || 0,
            timestamp: Date.now(),
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Fallback: Fetch from Binance
   */
  private async fetchFromBinance(symbol: string): Promise<TradingViewPrice> {
    try {
      const response = await axios.get(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`,
        { timeout: 5000 }
      );

      return {
        symbol: symbol.toUpperCase(),
        price: parseFloat(response.data.price),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("Binance fallback failed:", error);
      throw new Error(`Unable to fetch price for ${symbol}`);
    }
  }

  /**
   * Get batch prices
   */
  async getPrices(symbols: string[]): Promise<TradingViewPrice[]> {
    const promises = symbols.map((symbol) => this.getPrice(symbol));
    return Promise.all(promises);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let fetcher: TradingViewPriceFetcher | null = null;

export function getTradingViewPrice(): TradingViewPriceFetcher {
  if (!fetcher) {
    fetcher = new TradingViewPriceFetcher();
  }
  return fetcher;
}
