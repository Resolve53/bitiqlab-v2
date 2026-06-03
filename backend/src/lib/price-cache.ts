/**
 * Price Cache Service — Binance spot or USD-M futures public ticker prices.
 */

import type { TradingMarketType } from "./trading-market-resolver";

const SPOT_PRICE_BASE = "https://api.binance.com/api/v3";
const FUTURES_PRICE_BASE =
  process.env.BINANCE_FUTURES_TESTNET_BASE_URL ||
  "https://demo-fapi.binance.com";

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

  private cacheMinIntervalMs = 3000;
  private isUpdating = false;

  getPrices(symbols: string[]): PriceData[] {
    return symbols
      .map((symbol) => this.cache.prices.get(symbol))
      .filter((price): price is PriceData => price !== undefined);
  }

  getPrice(symbol: string): PriceData | undefined {
    return this.cache.prices.get(symbol);
  }

  async updatePrices(
    symbols: string[],
    marketType: TradingMarketType = "spot"
  ): Promise<void> {
    const timeSinceLastUpdate = Date.now() - this.cache.lastUpdate.getTime();
    if (timeSinceLastUpdate < this.cacheMinIntervalMs) {
      return;
    }

    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;

    try {
      const batches = this.batchSymbols(symbols, 50);

      for (const batch of batches) {
        await this.fetchBatch(batch, marketType);
      }

      this.cache.lastUpdate = new Date();
    } catch (error) {
      console.error("Error updating prices:", error);
    } finally {
      this.isUpdating = false;
    }
  }

  private priceBase(marketType: TradingMarketType): string {
    return marketType === "futures"
      ? `${FUTURES_PRICE_BASE}/fapi/v1`
      : SPOT_PRICE_BASE;
  }

  private async fetchBatch(
    symbols: string[],
    marketType: TradingMarketType = "spot"
  ): Promise<void> {
    if (symbols.length === 0) return;

    const base = this.priceBase(marketType);

    try {
      if (symbols.length === 1) {
        const response = await fetch(
          `${base}/ticker/price?symbol=${symbols[0]}`
        );
        const data = await response.json();

        if (data.symbol && data.price) {
          this.cache.prices.set(data.symbol, {
            symbol: data.symbol,
            price: parseFloat(data.price),
            change24h: 0,
            timestamp: new Date(),
          });
        }
      } else {
        const promises = symbols.map((symbol) =>
          fetch(`${base}/ticker/price?symbol=${symbol}`)
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

  getCacheAgeMs(): number {
    return Date.now() - this.cache.lastUpdate.getTime();
  }

  isStale(): boolean {
    return this.getCacheAgeMs() > this.cacheMinIntervalMs * 2;
  }

  private batchSymbols(symbols: string[], batchSize: number): string[][] {
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }
    return batches;
  }
}

let instance: PriceCache | null = null;

export function getPriceCache(): PriceCache {
  if (!instance) {
    instance = new PriceCache();
  }
  return instance;
}

export type { PriceData };
