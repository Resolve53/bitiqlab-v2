import type { OHLCVBar } from "@/truth-engine";
import type { StrategySnapshot } from "../types";

export function makeBars(count: number): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  const startMs = Date.UTC(2023, 0, 1);
  const intervalMs = 60 * 60 * 1000;
  for (let i = 0; i < count; i++) {
    let price = 95;
    if (i % 8 === 0) price = 95;
    else if (i % 8 === 1) price = 99;
    else if (i % 8 === 2) price = 101;
    else if (i % 8 === 3) price = 104;
    else if (i % 8 === 4) price = 108;
    else if (i % 8 === 5) price = 106;
    else if (i % 8 === 6) price = 103;
    else price = 98;
    const close = price + i * 0.01;
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

export const parentStrategyRow = {
  id: "research-parent",
  name: "Research Parent",
  symbol: "BTCUSDT",
  timeframe: "1h",
  market_type: "spot",
  version: 1,
  entry_rules: {
    schema_version: "truth_engine_v1",
    direction: "long",
    condition: {
      type: "indicator",
      indicator: "price",
      field: "close",
      operator: ">",
      value: 100,
    },
    risk_per_trade_pct: 1,
    leverage: 1,
  },
  exit_rules: {
    stop_loss_percent: 2,
    take_profit_percent: 4,
    risk_per_trade_pct: 1,
    leverage: 1,
  },
};

export function parentSnapshot(): StrategySnapshot {
  return {
    id: parentStrategyRow.id,
    name: parentStrategyRow.name,
    symbol: parentStrategyRow.symbol,
    timeframe: parentStrategyRow.timeframe,
    market_type: "spot",
    entry_rules: JSON.parse(JSON.stringify(parentStrategyRow.entry_rules)),
    exit_rules: JSON.parse(JSON.stringify(parentStrategyRow.exit_rules)),
    version: 1,
  };
}

export function metrics(partial: Partial<{
  totalTrades: number;
  winRate: number;
  expectancy: number | null;
  profitFactor: number | null;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  netProfit: number;
}>) {
  return {
    totalTrades: 40,
    winRate: 0.55,
    expectancy: 10,
    profitFactor: 1.5,
    totalReturn: 0.2,
    maxDrawdown: 0.1,
    sharpeRatio: 1.2,
    netProfit: 500,
    ...partial,
  };
}
