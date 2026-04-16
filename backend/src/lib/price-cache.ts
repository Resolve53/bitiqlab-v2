/**
 * Price Cache Service
 * Manages real-time price data from Binance with intelligent caching
 * to avoid hitting rate limits (1200 requests/min)
 */

interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  timestamp: Date;
}

interface CacheEntry {
  prices: Map<string, PriceData>;
  lastUpdate: Date;
}

class PriceCache {
  private cache: CacheEntry = {
    prices: new Map(),
    lastUpdate: new Date(0),
  };

  private cacheMinIntervalMs = 3000; // Minimum 3 seconds between Binance calls
  private isUpdating = false;

  /**
   * Get current prices from cache
   * Returns cached prices immediately without waiting
   */
  getPrices(symbols: string[]): PriceData[] {
    return symbols
      .map((symbol) => this.cache.prices.get(symbol))
      .filter((price): price is PriceData => price !== undefined);
  }

  /**
   * Get a single price from cache
   */
  getPrice(symbol: string): PriceData | undefined {
    return this.cache.prices.get(symbol);
  }

  /**
   * Update prices from Binance API
   * Respects rate limits by caching for minimum 3 seconds
   */
  async updatePrices(symbols: string[]): Promise<void> {
    // Check if we should update based on cache age
    const timeSinceLastUpdate = Date.now() - this.cache.lastUpdate.getTime();
    if (timeSinceLastUpdate < this.cacheMinIntervalMs) {
      // Still within cache window, skip update
      return;
    }

    // Prevent multiple simultaneous updates
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;

    try {
      // Batch symbols into groups of 50 (Binance limit)
      const batches = this.batchSymbols(symbols, 50);

      for (const batch of batches) {
        await this.fetchBatch(batch);
      }

      this.cache.lastUpdate = new Date();
    } catch (error) {
      console.error("Error updating prices:", error);
      // Silently fail - return cached data
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Fetch a batch of prices from Binance
   * Uses the efficient /ticker/price endpoint
   */
  private async fetchBatch(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return;

    try {
      // For single symbol, use direct endpoint
      if (symbols.length === 1) {
        const response = await fetch(
          `https://api.binance.com/api/v3/ticker/price?symbol=${symbols[0]}`
        );
        const data = await response.json();

        if (data.symbol && data.price) {
          this.cache.prices.set(data.symbol, {
            symbol: data.symbol,
            price: parseFloat(data.price),
            change24h: 0, // Would need 24hr endpoint for this
            timestamp: new Date(),
          });
        }
      } else {
        // For multiple symbols, fetch individual prices
        // (Binance doesn't have a single endpoint for multiple spot prices)
        const promises = symbols.map((symbol) =>
          fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.symbol && data.price) {
                this.cache.prices.set(data.symbol, {
                  symbol: data.symbol,
                  price: parseFloat(data.price),
                  change24h: 0,
                  timestamp: new Date(),
                });
              }
            })
            .catch((error) => {
              console.error(`Error fetching price for ${symbol}:`, error);
            })
        );

        await Promise.all(promises);
      }
    } catch (error) {
      console.error("Error fetching batch:", error);
    }
  }

  /**
   * Fetch 24hr change stats for better data
   */
  private async fetch24hrStats(symbols: string[]): Promise<void> {
    try {
      if (symbols.length === 0) return;

      const promises = symbols.map((symbol) =>
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.symbol) {
              const existing = this.cache.prices.get(data.symbol);
              if (existing) {
                existing.change24h = parseFloat(data.priceChangePercent);
              }
            }
          })
          .catch(() => {
            // Silently fail for 24hr stats
          })
      );

      await Promise.all(promises);
    } catch (error) {
      console.error("Error fetching 24hr stats:", error);
    }
  }

  /**
   * Get cache age in milliseconds
   */
  getCacheAgeMs(): number {
    return Date.now() - this.cache.lastUpdate.getTime();
  }

  /**
   * Check if cache is stale
   */
  isStale(): boolean {
    return this.getCacheAgeMs() > this.cacheMinIntervalMs * 2;
  }

  /**
   * Batch array into chunks
   */
  private batchSymbols(symbols: string[], batchSize: number): string[][] {
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }
    return batches;
  }
}

// Singleton instance
let instance: PriceCache | null = null;

export function getPriceCache(): PriceCache {
  if (!instance) {
    instance = new PriceCache();
  }
  return instance;
}

export { PriceData };
