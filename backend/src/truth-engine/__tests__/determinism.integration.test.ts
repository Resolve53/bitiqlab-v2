import { describe, expect, it } from "vitest";
import { runTruthBacktest } from "../orchestrator";
import type { OHLCVBar } from "../types";

function fixtureBars(): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  // Flat warmup
  for (let i = 0; i < 20; i++) {
    bars.push({
      timestamp: new Date(Date.UTC(2024, 0, 1, 0, i * 15)),
      open: 95,
      high: 96,
      low: 94,
      close: 95,
      volume: 1000,
    });
  }
  // Signal: close > 100
  bars.push({
    timestamp: new Date(Date.UTC(2024, 0, 1, 5, 0)),
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 1500,
  });
  // Entry + TP
  bars.push({
    timestamp: new Date(Date.UTC(2024, 0, 1, 5, 15)),
    open: 101,
    high: 101 * 1.05,
    low: 100.5,
    close: 103,
    volume: 1600,
  });
  // Trailing bars
  for (let i = 0; i < 5; i++) {
    bars.push({
      timestamp: new Date(Date.UTC(2024, 0, 1, 5, 30 + i * 15)),
      open: 103,
      high: 104,
      low: 102,
      close: 103,
      volume: 1200,
    });
  }
  return bars;
}

const strategyRow = {
  id: "fixture-strat",
  name: "Fixture",
  symbol: "BTCUSDT",
  timeframe: "15m",
  market_type: "spot",
  entry_rules: {
    rules: [
      {
        type: "indicator",
        indicator: "price",
        field: "close",
        operator: ">",
        value: 100,
      },
    ],
  },
  exit_rules: {
    stop_loss_percent: 2,
    take_profit_percent: 4,
  },
};

describe("determinism", () => {
  it("identical fixture runs deep-equal on trades and metrics", async () => {
    const bars = fixtureBars();
    const a = await runTruthBacktest({
      strategy: strategyRow,
      request: {
        strategyId: strategyRow.id,
        bars,
        initialCapital: 10_000,
        commissionPct: 0.05,
        slippagePct: 0.02,
      },
    });
    const b = await runTruthBacktest({
      strategy: strategyRow,
      request: {
        strategyId: strategyRow.id,
        bars,
        initialCapital: 10_000,
        commissionPct: 0.05,
        slippagePct: 0.02,
      },
    });

    // Provenance timestamp differs — compare core outputs
    expect(a.trades).toEqual(b.trades);
    expect({ ...a.metrics, equityCurve: undefined }).toEqual({
      ...b.metrics,
      equityCurve: undefined,
    });
    expect(a.metrics.equityCurve).toEqual(b.metrics.equityCurve);
    expect(a.signals.map((s) => ({ ...s, timestamp: s.timestamp.toISOString() }))).toEqual(
      b.signals.map((s) => ({ ...s, timestamp: s.timestamp.toISOString() }))
    );
    expect(a.resultSource).toBe("REAL_BACKTEST");
  });
});

describe("integration e2e fixture", () => {
  it("strategy → rules → signal → trade → metrics", async () => {
    const result = await runTruthBacktest({
      strategy: strategyRow,
      request: {
        strategyId: strategyRow.id,
        bars: fixtureBars(),
        initialCapital: 10_000,
        commissionPct: 0,
        slippagePct: 0,
      },
    });

    expect(result.signals.some((s) => s.action === "entry")).toBe(true);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    expect(result.trades[0].exitReason).toBe("take_profit");
    expect(result.trades[0].direction).toBe("long");
    expect(result.metrics.totalTrades).toBe(result.trades.length);
    expect(result.metrics.finalEquity).toBeGreaterThan(10_000);
    expect(result.provenance.executionModel).toBe(
      "signal_close_n_execute_open_n1"
    );
    expect(result.provenance.marketData.provider).toBe("fixture");
  });
});
