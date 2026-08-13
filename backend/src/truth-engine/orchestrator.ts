/**
 * Orchestrates a real deterministic backtest end-to-end.
 */

import {
  assertSupportedMarket,
  buildStrategyDefinition,
  StrategyValidationError,
} from "./strategy-schema";
import { fetchHistoricalOHLCV, MarketDataError } from "./market-data";
import { TruthBacktestExecutor } from "./executor";
import { calculateMetrics, estimateBarsInPosition } from "./metrics";
import type {
  BacktestRunRequest,
  BacktestRunResult,
  OHLCVBar,
  StrategyDefinition,
} from "./types";

export function windowToDateRange(window: string): [Date, Date] {
  const endDate = new Date();
  const startDate = new Date();
  switch (window) {
    case "1m":
      startDate.setUTCMonth(startDate.getUTCMonth() - 1);
      break;
    case "3m":
      startDate.setUTCMonth(startDate.getUTCMonth() - 3);
      break;
    case "6m":
      startDate.setUTCMonth(startDate.getUTCMonth() - 6);
      break;
    case "12m":
    case "1y":
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
      break;
    default:
      startDate.setUTCMonth(startDate.getUTCMonth() - 3);
  }
  return [startDate, endDate];
}

export async function runTruthBacktest(params: {
  strategy: {
    id: string;
    name: string;
    symbol: string;
    timeframe: string;
    market_type?: string;
    entry_rules?: unknown;
    exit_rules?: unknown;
    version?: number;
    backtest_count?: number;
  };
  request: BacktestRunRequest;
}): Promise<BacktestRunResult> {
  const { strategy, request } = params;

  let definition: StrategyDefinition;
  try {
    definition = buildStrategyDefinition(strategy);
  } catch (err) {
    if (err instanceof StrategyValidationError) throw err;
    throw new StrategyValidationError(
      err instanceof Error ? err.message : "Strategy validation failed"
    );
  }

  const symbol = (request.symbol || definition.symbol).toUpperCase();
  const timeframe = request.timeframe || definition.entryTimeframe;

  assertSupportedMarket(symbol, timeframe);

  definition = {
    ...definition,
    symbol,
    entryTimeframe: timeframe,
  };

  let start: Date;
  let end: Date;
  if (request.startDate && request.endDate) {
    start = new Date(request.startDate);
    end = new Date(request.endDate);
  } else if (request.window) {
    [start, end] = windowToDateRange(request.window);
  } else if (request.bars && request.bars.length > 0) {
    start = request.bars[0].timestamp;
    end = request.bars[request.bars.length - 1].timestamp;
  } else {
    [start, end] = windowToDateRange("3m");
  }

  const initialCapital = request.initialCapital ?? 10_000;
  if (!(initialCapital > 0)) {
    throw new Error("initialCapital must be > 0");
  }

  const commissionPct =
    request.commissionPct ?? definition.fees?.commissionPct ?? 0.05;
  const slippagePct =
    request.slippagePct ?? definition.fees?.slippagePct ?? 0.02;

  let bars: OHLCVBar[];
  let marketMeta;

  if (request.bars && request.bars.length > 0) {
    bars = request.bars;
    marketMeta = {
      provider: "fixture",
      symbol,
      timeframe,
      start: bars[0].timestamp.toISOString(),
      end: bars[bars.length - 1].timestamp.toISOString(),
      bars: bars.length,
    };
  } else {
    try {
      const fetched = await fetchHistoricalOHLCV({
        symbol,
        timeframe,
        start,
        end,
      });
      bars = fetched.bars;
      marketMeta = fetched.meta;
    } catch (err) {
      if (err instanceof MarketDataError) throw err;
      throw new MarketDataError(
        err instanceof Error ? err.message : "Market data fetch failed"
      );
    }
  }

  const minBars = request.bars ? 10 : 50;
  if (bars.length < minBars) {
    throw new MarketDataError(
      `Insufficient historical bars (${bars.length}). Need at least ${minBars} closed candles.`
    );
  }

  const leverage =
    request.leverage && request.leverage > 0
      ? request.leverage
      : definition.leverage;

  if (definition.marketType === "spot" && leverage !== 1) {
    throw new StrategyValidationError(
      `Spot backtests require leverage=1 (got ${leverage}).`
    );
  }

  const executor = new TruthBacktestExecutor({
    initialCapital,
    commissionPct,
    slippagePct,
    leverage,
  });

  const exec = executor.execute(bars, definition);
  const barsInPosition = estimateBarsInPosition(exec.trades, bars);
  const metrics = calculateMetrics({
    trades: exec.trades,
    equityTimeline: exec.equityTimeline,
    initialCapital,
    totalBars: bars.length,
    barsInPosition,
  });

  const provenance = {
    strategyId: definition.id,
    strategyVersion: definition.version,
    strategyDefinitionSnapshot: definition,
    marketData: marketMeta,
    symbol,
    timeframe,
    start: marketMeta.start,
    end: marketMeta.end,
    bars: marketMeta.bars,
    initialCapital,
    commissionPct,
    slippagePct,
    executionModel: "signal_close_n_execute_open_n1" as const,
    timestamp: new Date().toISOString(),
    resultSource: "REAL_BACKTEST" as const,
  };

  return {
    resultSource: "REAL_BACKTEST",
    metrics,
    trades: exec.trades,
    provenance,
    signals: exec.signals,
  };
}
