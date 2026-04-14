/**
 * Re-export wrapper from parent directory
 * This file allows TypeScript to find the tradingview-mcp adapter module
 * The actual implementation is in JavaScript, so we provide type definitions here
 */

export type { OHLCVBar, StrategySignal, TradingViewConfig } from "./adapter.d";

// Mock implementations to allow compilation
// The actual JavaScript module will be used at runtime via dynamic imports
export class TradingViewDataFetcher {
  constructor(config: any) {}
  async getOHLCV(symbol: string, timeframe: string, startDate: Date, endDate: Date) {
    return [];
  }
}

export class SignalGenerator {
  constructor(config: any, fetcher: any) {}
  async generateSignals(startDate: Date, endDate: Date) {
    return [];
  }
}
