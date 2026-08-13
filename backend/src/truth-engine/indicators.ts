/**
 * Deterministic technical indicators for closed-candle evaluation.
 * Warmup bars return null (not fake defaults like 50).
 */

import type { OHLCVBar } from "./types";

export interface IndicatorSeries {
  rsi: Map<number, (number | null)[]>; // period → series
  sma: Map<number, (number | null)[]>;
  ema: Map<number, (number | null)[]>;
  macd: {
    line: (number | null)[];
    signal: (number | null)[];
    histogram: (number | null)[];
  };
  bollinger: {
    upper: (number | null)[];
    middle: (number | null)[];
    lower: (number | null)[];
  };
  volume: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
}

export function buildIndicatorSeries(
  bars: OHLCVBar[],
  opts?: {
    rsiPeriods?: number[];
    smaPeriods?: number[];
    emaPeriods?: number[];
    bbPeriod?: number;
    bbStdDev?: number;
  }
): IndicatorSeries {
  const closes = bars.map((b) => b.close);
  const rsiPeriods = opts?.rsiPeriods ?? [14];
  const smaPeriods = opts?.smaPeriods ?? [20, 50, 200];
  const emaPeriods = opts?.emaPeriods ?? [12, 26, 50];
  const bbPeriod = opts?.bbPeriod ?? 20;
  const bbStdDev = opts?.bbStdDev ?? 2;

  const rsi = new Map<number, (number | null)[]>();
  for (const p of rsiPeriods) rsi.set(p, calcRSI(closes, p));

  const sma = new Map<number, (number | null)[]>();
  for (const p of smaPeriods) sma.set(p, calcSMA(closes, p));

  const ema = new Map<number, (number | null)[]>();
  for (const p of emaPeriods) ema.set(p, calcEMA(closes, p));

  const macd = calcMACD(closes, 12, 26, 9);
  const bollinger = calcBollinger(closes, bbPeriod, bbStdDev);

  return {
    rsi,
    sma,
    ema,
    macd,
    bollinger,
    volume: bars.map((b) => b.volume),
    open: bars.map((b) => b.open),
    high: bars.map((b) => b.high),
    low: bars.map((b) => b.low),
    close: closes,
  };
}

export function ensurePeriod(
  series: IndicatorSeries,
  kind: "rsi" | "sma" | "ema",
  period: number,
  closes: number[]
): (number | null)[] {
  const map =
    kind === "rsi" ? series.rsi : kind === "sma" ? series.sma : series.ema;
  if (!map.has(period)) {
    const calc =
      kind === "rsi"
        ? calcRSI(closes, period)
        : kind === "sma"
          ? calcSMA(closes, period)
          : calcEMA(closes, period);
    map.set(period, calc);
  }
  return map.get(period)!;
}

export function calcSMA(data: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function calcEMA(data: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  if (period <= 0 || data.length === 0) return out;
  const k = 2 / (period + 1);
  let ema: number | null = null;
  let seedSum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      seedSum += data[i];
      continue;
    }
    if (i === period - 1) {
      seedSum += data[i];
      ema = seedSum / period;
      out[i] = ema;
      continue;
    }
    ema = data[i] * k + (ema as number) * (1 - k);
    out[i] = ema;
  }
  return out;
}

/** Wilder RSI — null until period gains/losses available */
export function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] =
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] =
      avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function calcMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): {
  line: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const line: (number | null)[] = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null
      ? (emaFast[i] as number) - (emaSlow[i] as number)
      : null
  );

  // Signal EMA over non-null MACD line values — keep index alignment
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  const histogram: (number | null)[] = new Array(closes.length).fill(null);
  const k = 2 / (signalPeriod + 1);
  let ema: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] == null) continue;
    if (ema == null) {
      seedSum += line[i] as number;
      seedCount++;
      if (seedCount === signalPeriod) {
        ema = seedSum / signalPeriod;
        signal[i] = ema;
        histogram[i] = (line[i] as number) - ema;
      }
      continue;
    }
    ema = (line[i] as number) * k + ema * (1 - k);
    signal[i] = ema;
    histogram[i] = (line[i] as number) - ema;
  }

  return { line, signal, histogram };
}

export function calcBollinger(
  closes: number[],
  period = 20,
  stdDevMult = 2
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const middle = calcSMA(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (middle[i] == null) continue;
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i] as number;
    const variance =
      slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper[i] = mean + stdDevMult * std;
    lower[i] = mean - stdDevMult * std;
  }
  return { upper, middle, lower };
}
