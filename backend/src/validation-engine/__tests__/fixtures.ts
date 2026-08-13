/**
 * Deterministic OHLCV fixtures for Phase 2 validation tests (no network).
 */

import type { OHLCVBar } from "@/truth-engine";

/** Generate chronological bars with optional trend / volatility pattern. */
export function makeBars(
  count: number,
  opts?: {
    startMs?: number;
    intervalMs?: number;
    base?: number;
    /** sine amplitude as fraction of base */
    amp?: number;
    /** linear drift per bar */
    drift?: number;
    /** extra high-low range fraction */
    range?: number;
  }
): OHLCVBar[] {
  const startMs = opts?.startMs ?? Date.UTC(2023, 0, 1);
  const intervalMs = opts?.intervalMs ?? 60 * 60 * 1000; // 1h
  const base = opts?.base ?? 100;
  const amp = opts?.amp ?? 0.08;
  const drift = opts?.drift ?? 0.02;
  const range = opts?.range ?? 0.01;
  const bars: OHLCVBar[] = [];
  for (let i = 0; i < count; i++) {
    const mid = base + drift * i + Math.sin(i / 5) * base * amp;
    const high = mid * (1 + range);
    const low = mid * (1 - range);
    const open = mid * (1 - range * 0.2);
    const close = mid * (1 + range * 0.2 * Math.sin(i));
    bars.push({
      timestamp: new Date(startMs + i * intervalMs),
      open,
      high,
      low,
      close,
      volume: 1000 + (i % 50),
    });
  }
  return bars;
}

/** Strong uptrend with frequent dips below then above threshold — many long trades. */
export function makeProfitableLongBars(count = 400): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  const startMs = Date.UTC(2023, 0, 1);
  const intervalMs = 60 * 60 * 1000;
  let price = 90;
  for (let i = 0; i < count; i++) {
    // Alternate: dip below 100 then rally strongly (take profit friendly)
    if (i % 8 === 0) price = 95;
    else if (i % 8 === 1) price = 99;
    else if (i % 8 === 2) price = 101;
    else if (i % 8 === 3) price = 104;
    else if (i % 8 === 4) price = 108; // hit TP zone
    else if (i % 8 === 5) price = 106;
    else if (i % 8 === 6) price = 103;
    else price = 98;
    // slow upward drift so later splits also work
    const drift = i * 0.01;
    const close = price + drift;
    bars.push({
      timestamp: new Date(startMs + i * intervalMs),
      open: close * 0.999,
      high: close * 1.02,
      low: close * 0.99,
      close,
      volume: 1500,
    });
  }
  return bars;
}

export const fixtureStrategy = {
  id: "val-fixture-strat",
  name: "Validation Fixture Long",
  symbol: "BTCUSDT",
  timeframe: "1h",
  market_type: "spot",
  version: 1,
  entry_rules: {
    direction: "long",
    condition: {
      type: "indicator",
      indicator: "price",
      field: "close",
      operator: ">",
      value: 100,
    },
  },
  exit_rules: {
    stop_loss_percent: 2,
    take_profit_percent: 4,
  },
};

export const rsiStrategy = {
  ...fixtureStrategy,
  id: "val-rsi-strat",
  name: "RSI Fixture",
  entry_rules: {
    direction: "long",
    condition: {
      type: "indicator",
      indicator: "rsi",
      period: 14,
      field: "close",
      operator: "<",
      value: 30,
    },
  },
  exit_rules: {
    stop_loss_percent: 2,
    take_profit_percent: 4,
    risk_per_trade_pct: 1,
  },
};
