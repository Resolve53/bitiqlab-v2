/**
 * Deterministic OHLCV regime classification (no AI, no look-ahead).
 *
 * Trend (uses only bars ≤ i):
 * - SMA(period) of close
 * - slope = SMA[i] - SMA[i - slopeLookback]
 * - trending_up: close > SMA and slope > 0
 * - trending_down: close < SMA and slope < 0
 * - sideways: otherwise (incl. warmup)
 *
 * Volatility:
 * - ATR(period) / close vs median of ATR/close over available history up to i
 * - high_volatility: ratio > median
 * - low_volatility: ratio ≤ median (warmup → low)
 */

import type { OHLCVBar } from "@/truth-engine";
import type { ValidationConfig } from "./config";
import type { TrendRegime, VolRegime } from "./types";

function trueRange(bars: OHLCVBar[], i: number): number {
  const b = bars[i];
  if (i === 0) return b.high - b.low;
  const prev = bars[i - 1].close;
  return Math.max(
    b.high - b.low,
    Math.abs(b.high - prev),
    Math.abs(b.low - prev)
  );
}

export function classifyTrendRegimes(
  bars: OHLCVBar[],
  config: Pick<ValidationConfig, "regimeSmaPeriod" | "regimeSlopeLookback">
): TrendRegime[] {
  const period = config.regimeSmaPeriod;
  const lookback = config.regimeSlopeLookback;
  const out: TrendRegime[] = new Array(bars.length).fill("sideways");
  const sma: (number | null)[] = new Array(bars.length).fill(null);

  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) sma[i] = sum / period;
  }

  for (let i = 0; i < bars.length; i++) {
    const s = sma[i];
    if (s == null) {
      out[i] = "sideways";
      continue;
    }
    const prevIdx = i - lookback;
    const prev = prevIdx >= 0 ? sma[prevIdx] : null;
    if (prev == null) {
      out[i] = "sideways";
      continue;
    }
    const slope = s - prev;
    const close = bars[i].close;
    if (close > s && slope > 0) out[i] = "trending_up";
    else if (close < s && slope < 0) out[i] = "trending_down";
    else out[i] = "sideways";
  }
  return out;
}

export function classifyVolRegimes(
  bars: OHLCVBar[],
  config: Pick<ValidationConfig, "regimeAtrPeriod">
): VolRegime[] {
  const period = config.regimeAtrPeriod;
  const out: VolRegime[] = new Array(bars.length).fill("low_volatility");
  const atr: (number | null)[] = new Array(bars.length).fill(null);
  const ratios: number[] = [];

  let trSum = 0;
  for (let i = 0; i < bars.length; i++) {
    const tr = trueRange(bars, i);
    trSum += tr;
    if (i >= period) trSum -= trueRange(bars, i - period);
    if (i >= period - 1) {
      atr[i] = trSum / period;
      const ratio = bars[i].close > 0 ? atr[i]! / bars[i].close : 0;
      // median of history including current (causal: only past+current ratios)
      ratios.push(ratio);
      const sorted = [...ratios].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      out[i] = ratio > median ? "high_volatility" : "low_volatility";
    }
  }
  return out;
}

export const REGIME_DEFINITIONS = {
  trend:
    "SMA(regimeSmaPeriod); slope = SMA[i]-SMA[i-slopeLookback]; up: close>SMA & slope>0; down: close<SMA & slope<0; else sideways. Warmup=sideways.",
  volatility:
    "ATR(regimeAtrPeriod)/close vs median of ratios from bar 0..i (inclusive). > median → high_volatility; else low_volatility. Warmup=low_volatility.",
};
