/**
 * Closed-candle selection for paper-forward.
 * Never evaluate the currently forming candle. No future bars. No duplicates.
 */

import {
  MarketDataError,
  normalizeBars,
  timeframeToMs,
} from "@/truth-engine/market-data";
import type { OHLCVBar } from "@/truth-engine/types";

export class PaperCandleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaperCandleError";
  }
}

/** Candle with open time T is closed iff T + interval <= now (no forming bar). */
export function isCandleClosed(
  bar: OHLCVBar,
  timeframe: string,
  now: Date
): boolean {
  const interval = timeframeToMs(timeframe);
  const closeAt = bar.timestamp.getTime() + interval;
  return closeAt <= now.getTime();
}

export function assertChronologicalClosedBars(
  bars: OHLCVBar[],
  timeframe: string,
  now: Date
): OHLCVBar[] {
  let normalized: OHLCVBar[];
  try {
    normalized = normalizeBars(bars);
  } catch (err) {
    throw new PaperCandleError(
      err instanceof Error ? err.message : "Invalid OHLCV"
    );
  }

  const closed: OHLCVBar[] = [];
  for (const bar of normalized) {
    if (bar.timestamp.getTime() > now.getTime()) {
      throw new PaperCandleError(
        `Future candle rejected at ${bar.timestamp.toISOString()}`
      );
    }
    if (!isCandleClosed(bar, timeframe, now)) {
      continue;
    }
    closed.push(bar);
  }

  for (let i = 1; i < closed.length; i++) {
    if (closed[i].timestamp.getTime() <= closed[i - 1].timestamp.getTime()) {
      throw new PaperCandleError("Closed candles are not strictly chronological");
    }
  }

  return closed;
}

export function candlesAfterCursor(
  bars: OHLCVBar[],
  lastProcessedCandleTs: string | null | undefined
): OHLCVBar[] {
  if (!lastProcessedCandleTs) return bars;
  const cursor = new Date(lastProcessedCandleTs).getTime();
  if (Number.isNaN(cursor)) {
    throw new PaperCandleError(
      `Invalid last_processed_candle_ts: ${lastProcessedCandleTs}`
    );
  }
  return bars.filter((b) => b.timestamp.getTime() > cursor);
}

export function candlesOnOrAfter(
  bars: OHLCVBar[],
  iso: string | null | undefined
): OHLCVBar[] {
  if (!iso) return bars;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) {
    throw new PaperCandleError(`Invalid timestamp: ${iso}`);
  }
  return bars.filter((b) => b.timestamp.getTime() >= t);
}

export const PAPER_INDICATOR_LOOKBACK_BARS = 250;
export const PAPER_MAX_BARS_PER_TICK = 500;

export function lookbackStart(
  timeframe: string,
  from: Date,
  lookbackBars = PAPER_INDICATOR_LOOKBACK_BARS
): Date {
  const ms = timeframeToMs(timeframe);
  return new Date(from.getTime() - lookbackBars * ms);
}

export function splitWarmupAndExecute(params: {
  bars: OHLCVBar[];
  executeFromTs: string | null;
  lastProcessedCandleTs: string | null;
}): { warmup: OHLCVBar[]; execute: OHLCVBar[]; executeFromIndex: number } {
  const { bars, executeFromTs, lastProcessedCandleTs } = params;
  if (bars.length === 0) {
    return { warmup: [], execute: [], executeFromIndex: 0 };
  }

  let execute = candlesAfterCursor(bars, lastProcessedCandleTs);
  if (executeFromTs && !lastProcessedCandleTs) {
    execute = candlesOnOrAfter(execute, executeFromTs);
  }

  if (execute.length === 0) {
    return { warmup: bars, execute: [], executeFromIndex: bars.length };
  }

  const firstExecuteTs = execute[0].timestamp.getTime();
  const executeFromIndex = bars.findIndex(
    (b) => b.timestamp.getTime() === firstExecuteTs
  );
  if (executeFromIndex < 0) {
    throw new PaperCandleError("Execute window is not a subset of fetched bars");
  }

  return {
    warmup: bars.slice(0, executeFromIndex),
    execute,
    executeFromIndex,
  };
}

export { MarketDataError };
