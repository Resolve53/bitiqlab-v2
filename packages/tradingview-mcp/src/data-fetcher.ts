/**
 * TradingView Data Fetcher
 * Fetches OHLCV data and technical indicators from TradingView MCP
 */

import axios, { AxiosInstance } from "axios";
import { OHLCVBar, StrategySignal } from "@bitiqlab/backtest-engine";

export interface TradingViewMCPConfig {
  base_url: string;
  api_key?: string;
  timeout?: number;  // milliseconds
}

export interface IndicatorValue {
  timestamp: Date;
  value: number;
  signal?: number;  // For indicators like MACD with signal line
  histogram?: number;  // For MACD
}

export interface IndicatorResponse {
  [indicator_name: string]: IndicatorValue[];
}

/**
 * TradingView Data Fetcher
 * Handles all data fetching from TradingView MCP
 */
export class TradingViewDataFetcher {
  private client: AxiosInstance;
  private config: TradingViewMCPConfig;
  private cache: Map<string, any> = new Map();

  constructor(config: TradingViewMCPConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.base_url,
      timeout: this.config.timeout,
      headers: {
        "Content-Type": "application/json",
        ...(this.config.api_key && { "X-API-Key": this.config.api_key }),
      },
    });
  }

  /**
   * Fetch OHLCV data from TradingView
   */
  async getOHLCV(
    symbol: string,
    timeframe: string,
    start_date: Date,
    end_date: Date
  ): Promise<OHLCVBar[]> {
    const cache_key = `ohlcv:${symbol}:${timeframe}:${start_date.getTime()}:${end_date.getTime()}`;

    // Check cache
    if (this.cache.has(cache_key)) {
      return this.cache.get(cache_key);
    }

    try {
      const response = await this.client.get("/data/get_ohlcv", {
        params: {
          symbol,
          timeframe,
          start_date: start_date.toISOString(),
          end_date: end_date.toISOString(),
        },
      });

      // Convert API response to OHLCVBar format
      const bars: OHLCVBar[] = (response.data.bars || []).map((bar: any) => ({
        timestamp: new Date(bar.timestamp),
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
        volume: parseFloat(bar.volume),
      }));

      // Cache for 1 hour
      this.cache.set(cache_key, bars);
      setTimeout(() => this.cache.delete(cache_key), 3600000);

      return bars;
    } catch (error) {
      console.error(`Failed to fetch OHLCV for ${symbol}:${timeframe}`, error);
      throw new Error(
        `TradingView MCP error fetching OHLCV: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetch indicator values from TradingView
   */
  async getIndicators(
    symbol: string,
    timeframe: string,
    indicators: string[],
    start_date: Date,
    end_date: Date
  ): Promise<IndicatorResponse> {
    const cache_key = `indicators:${symbol}:${timeframe}:${indicators.join(",")}: ${start_date.getTime()}:${end_date.getTime()}`;

    // Check cache
    if (this.cache.has(cache_key)) {
      return this.cache.get(cache_key);
    }

    try {
      const response = await this.client.get("/data/get_study_values", {
        params: {
          symbol,
          timeframe,
          indicators: indicators.join(","),
          start_date: start_date.toISOString(),
          end_date: end_date.toISOString(),
        },
      });

      // Convert API response
      const result: IndicatorResponse = {};
      for (const [indicator, values] of Object.entries(
        response.data.indicators || {}
      )) {
        result[indicator] = (values as any[]).map((v: any) => ({
          timestamp: new Date(v.timestamp),
          value: parseFloat(v.value),
          signal: v.signal ? parseFloat(v.signal) : undefined,
          histogram: v.histogram ? parseFloat(v.histogram) : undefined,
        }));
      }

      // Cache for 1 hour
      this.cache.set(cache_key, result);
      setTimeout(() => this.cache.delete(cache_key), 3600000);

      return result;
    } catch (error) {
      console.error(
        `Failed to fetch indicators for ${symbol}:${timeframe}`,
        error
      );
      throw new Error(
        `TradingView MCP error fetching indicators: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetch current market quote
   */
  async getQuote(symbol: string): Promise<{
    symbol: string;
    price: number;
    bid: number;
    ask: number;
    volume: number;
    timestamp: Date;
  }> {
    try {
      const response = await this.client.get("/data/get_quote", {
        params: { symbol },
      });

      return {
        symbol: response.data.symbol,
        price: parseFloat(response.data.price),
        bid: parseFloat(response.data.bid),
        ask: parseFloat(response.data.ask),
        volume: parseFloat(response.data.volume),
        timestamp: new Date(response.data.timestamp),
      };
    } catch (error) {
      console.error(`Failed to fetch quote for ${symbol}`, error);
      throw new Error(
        `TradingView MCP error fetching quote: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get current chart state from TradingView
   */
  async getChartState(symbol: string, timeframe: string): Promise<any> {
    try {
      const response = await this.client.get("/chart/get_state", {
        params: { symbol, timeframe },
      });
      return response.data;
    } catch (error) {
      console.error(
        `Failed to fetch chart state for ${symbol}:${timeframe}`,
        error
      );
      throw new Error(
        `TradingView MCP error fetching chart state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate Pine Script alerts/signals
   * Used for real-time signal generation
   */
  async setPineScriptAlert(
    symbol: string,
    timeframe: string,
    conditions: Record<string, any>
  ): Promise<{ alert_id: string; status: string }> {
    try {
      const response = await this.client.post("/chart/set_alert", {
        symbol,
        timeframe,
        conditions,
      });

      return {
        alert_id: response.data.alert_id,
        status: response.data.status,
      };
    } catch (error) {
      console.error(
        `Failed to set Pine Script alert for ${symbol}:${timeframe}`,
        error
      );
      throw new Error(
        `TradingView MCP error setting alert: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Clear cache for a specific symbol/timeframe
   */
  clearCache(symbol?: string, timeframe?: string): void {
    if (!symbol && !timeframe) {
      this.cache.clear();
    } else if (symbol && !timeframe) {
      const keysToDelete = Array.from(this.cache.keys()).filter((key) =>
        key.includes(symbol)
      );
      keysToDelete.forEach((key) => this.cache.delete(key));
    } else if (symbol && timeframe) {
      const keysToDelete = Array.from(this.cache.keys()).filter(
        (key) => key.includes(symbol) && key.includes(timeframe)
      );
      keysToDelete.forEach((key) => this.cache.delete(key));
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Batch data fetcher for multiple symbols
 */
export class BatchTradingViewDataFetcher {
  private fetcher: TradingViewDataFetcher;
  private batchSize: number;

  constructor(config: TradingViewMCPConfig, batchSize: number = 5) {
    this.fetcher = new TradingViewDataFetcher(config);
    this.batchSize = batchSize;
  }

  /**
   * Fetch OHLCV for multiple symbols in parallel (with batching)
   */
  async getMultipleOHLCV(
    symbols: string[],
    timeframe: string,
    start_date: Date,
    end_date: Date
  ): Promise<Map<string, OHLCVBar[]>> {
    const results = new Map<string, OHLCVBar[]>();

    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < symbols.length; i += this.batchSize) {
      const batch = symbols.slice(i, i + this.batchSize);
      const batchPromises = batch.map((symbol) =>
        this.fetcher
          .getOHLCV(symbol, timeframe, start_date, end_date)
          .then((data) => {
            results.set(symbol, data);
          })
          .catch((error) => {
            console.error(`Error fetching ${symbol}:`, error);
          })
      );

      await Promise.all(batchPromises);
    }

    return results;
  }
}
