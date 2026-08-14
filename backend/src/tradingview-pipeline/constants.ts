/**
 * TradingView Candidate Pipeline — Stage 1 constants.
 * TradingView is a DETECTOR only. No exchange execution.
 */

export const BITIQ_PINE_VERSION = "truth_engine_pine_v1";
export const BITIQ_ENGINE_ID = "truth_engine_v1";

export const CANDIDATE_SOURCE = "TRADINGVIEW" as const;

export const CANDIDATE_STATUSES = [
  "RECEIVED",
  "INVALID",
  "READY_FOR_ENRICHMENT",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const DIRECTIONS = ["LONG", "SHORT"] as const;
export type CandidateDirection = (typeof DIRECTIONS)[number];

/** Max webhook body size (TradingView alert messages are small JSON). */
export const MAX_WEBHOOK_BYTES = 32 * 1024;

/** Reject candles older than this (webhook retries still fit). */
export const MAX_CANDLE_AGE_MS = 48 * 60 * 60 * 1000;

export const WEBHOOK_RATE_WINDOW_MS = 60_000;
export const WEBHOOK_RATE_MAX = 60;

export const TV_RESOLUTION: Record<string, string> = {
  "15m": "15",
  "1h": "60",
  "4h": "240",
};

export function toTradingViewResolution(timeframe: string): string {
  return TV_RESOLUTION[timeframe] || timeframe;
}

export function toTradingViewSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.includes(":")) return upper;
  return `BINANCE:${upper}`;
}

export function timeframeToMs(timeframe: string): number {
  switch (timeframe) {
    case "15m":
      return 15 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "4h":
      return 4 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
}
