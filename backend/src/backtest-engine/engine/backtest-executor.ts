/**
 * LEGACY BacktestExecutor — superseded by TruthBacktestExecutor (@/truth-engine).
 *
 * Types below are retained for paper-trading / walk-forward type compatibility.
 * Runtime execution of this class throws — use @/truth-engine instead.
 */

import type {
  Trade,
  BacktestRun,
  EquityPoint,
} from "../../core";

export interface OHLCVBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Legacy signal shape used by paper-trading-simulator */
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

export interface BacktestConfig {
  strategy_id: string;
  version: number;
  symbol: string;
  timeframe: string;
  market_type: "spot" | "futures";
  leverage: number;
  commission_percent?: number;
  slippage_percent?: number;
}

/**
 * @deprecated Use TruthBacktestExecutor / runTruthBacktest from @/truth-engine
 */
export class BacktestExecutor {
  constructor(_config: BacktestConfig, _initialCapital: number = 10000) {
    // Constructible for type/compat, but execute() always throws.
  }

  async execute(
    _bars: OHLCVBar[],
    _signals: StrategySignal[]
  ): Promise<BacktestRun> {
    throw new Error(
      "Legacy BacktestExecutor is disabled. Use TruthBacktestExecutor / runTruthBacktest from @/truth-engine (Phase 1 Truth Engine)."
    );
  }

  getEquityCurve(): EquityPoint[] {
    return [];
  }

  getTrades(): Trade[] {
    return [];
  }
}
