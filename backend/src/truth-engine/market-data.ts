/**
 * Real historical OHLCV via Binance. No synthetic fallback.
 */

import { BinanceDataFetcher, type OHLCV } from "@/lib/binance-fetcher";
import { SUPPORTED_TIMEFRAMES } from "./strategy-schema";
import type { MarketDataMeta, OHLCVBar } from "./types";

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataError";
  }
}

const PHASE1_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);

export function normalizeBars(raw: OHLCV[] | OHLCVBar[]): OHLCVBar[] {
  const mapped: OHLCVBar[] = raw.map((b) => ({
    timestamp: b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp),
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: Number(b.volume),
  }));

  for (const b of mapped) {
    if (
      ![b.open, b.high, b.low, b.close, b.volume].every((n) =>
        Number.isFinite(n)
      )
    ) {
      throw new MarketDataError("OHLCV contains non-finite values");
    }
    if (b.high < b.low) {
      throw new MarketDataError(
        `Invalid bar high < low at ${b.timestamp.toISOString()}`
      );
    }
  }

  mapped.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const deduped: OHLCVBar[] = [];
  const seen = new Set<number>();
  for (const b of mapped) {
    const t = b.timestamp.getTime();
    if (seen.has(t)) continue;
    seen.add(t);
    deduped.push(b);
  }

  for (let i = 1; i < deduped.length; i++) {
    if (deduped[i].timestamp.getTime() <= deduped[i - 1].timestamp.getTime()) {
      throw new MarketDataError("OHLCV not strictly chronological after dedupe");
    }
  }

  return deduped;
}

export function detectMissingBars(
  bars: OHLCVBar[],
  timeframe: string
): number[] {
  const ms = timeframeToMs(timeframe);
  const gaps: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const delta = bars[i].timestamp.getTime() - bars[i - 1].timestamp.getTime();
    // Allow small jitter; flag multiples of interval missing
    if (delta > ms * 1.5) {
      gaps.push(i);
    }
  }
  return gaps;
}

export function timeframeToMs(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
  };
  if (!map[tf]) {
    throw new MarketDataError(`Unknown timeframe: ${tf}`);
  }
  return map[tf];
}

export interface FetchMarketDataResult {
  bars: OHLCVBar[];
  meta: MarketDataMeta;
  missingBarIndexes: number[];
}

export async function fetchHistoricalOHLCV(params: {
  symbol: string;
  timeframe: string;
  start: Date;
  end: Date;
  fetcher?: BinanceDataFetcher;
  allowAnyUsdtSymbol?: boolean;
}): Promise<FetchMarketDataResult> {
  const symbol = params.symbol.toUpperCase();
  const timeframe = params.timeframe;

  if (!(SUPPORTED_TIMEFRAMES as readonly string[]).includes(timeframe)) {
    throw new MarketDataError(
      `Unsupported timeframe "${timeframe}". Supported: ${SUPPORTED_TIMEFRAMES.join(
        ", "
      )}`
    );
  }

  if (!params.allowAnyUsdtSymbol && !PHASE1_SYMBOLS.has(symbol)) {
    throw new MarketDataError(
      `Unsupported symbol "${symbol}". Phase 1 supports: BTCUSDT, ETHUSDT, SOLUSDT`
    );
  }

  if (!(params.start instanceof Date) || Number.isNaN(params.start.getTime())) {
    throw new MarketDataError("Invalid start date");
  }
  if (!(params.end instanceof Date) || Number.isNaN(params.end.getTime())) {
    throw new MarketDataError("Invalid end date");
  }
  if (params.end.getTime() <= params.start.getTime()) {
    throw new MarketDataError("endDate must be after startDate");
  }

  const fetcher = params.fetcher ?? new BinanceDataFetcher();
  let raw: OHLCV[];
  try {
    raw = await fetcher.getOHLCV(symbol, timeframe, params.start, params.end);
  } catch (err) {
    throw new MarketDataError(
      `Failed to fetch real OHLCV from Binance: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!raw || raw.length === 0) {
    throw new MarketDataError(
      `No historical OHLCV returned for ${symbol} ${timeframe}`
    );
  }

  const bars = normalizeBars(raw);
  const missingBarIndexes = detectMissingBars(bars, timeframe);

  const meta: MarketDataMeta = {
    provider: "binance",
    symbol,
    timeframe,
    start: bars[0].timestamp.toISOString(),
    end: bars[bars.length - 1].timestamp.toISOString(),
    bars: bars.length,
  };

  return { bars, meta, missingBarIndexes };
}
