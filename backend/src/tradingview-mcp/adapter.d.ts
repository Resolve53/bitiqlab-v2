/**
 * Type declarations for TradingView MCP adapter
 */

export interface OHLCVBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingViewConfig {
  base_url: string;
  api_key?: string;
}

export interface StrategySignal {
  timestamp: Date;
  type: "entry" | "exit";
  direction?: "long" | "short";
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  conditions?: Record<string, any>;
  exit_reason?: string;
}

export class TradingViewDataFetcher {
  constructor(config: TradingViewConfig);
  getOHLCV(
    symbol: string,
    timeframe: string,
    startDate: Date,
    endDate: Date
  ): Promise<OHLCVBar[]>;
}

export class SignalGenerator {
  constructor(
    config: {
      symbol: string;
      timeframe: string;
      entry_rules: Record<string, any>;
      exit_rules: Record<string, any>;
      market_type: "spot" | "futures";
      leverage: number;
    },
    fetcher: TradingViewDataFetcher
  );
  generateSignals(startDate: Date, endDate: Date): Promise<StrategySignal[]>;
}

export default {
  TradingViewDataFetcher,
  SignalGenerator,
};
