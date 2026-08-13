import { describe, expect, it } from "vitest";
import { TruthBacktestExecutor } from "../executor";
import { applySlippage } from "../slippage";
import { calculateMetrics } from "../metrics";
import type { OHLCVBar, StrategyDefinition } from "../types";

function makeBars(
  rows: Array<Partial<OHLCVBar> & { close: number; open?: number }>
): OHLCVBar[] {
  return rows.map((r, i) => {
    const close = r.close;
    const open = r.open ?? close;
    const high = r.high ?? Math.max(open, close) * 1.0;
    const low = r.low ?? Math.min(open, close) * 1.0;
    return {
      timestamp: r.timestamp ?? new Date(Date.UTC(2024, 0, 1 + Math.floor(i / 4), (i % 4) * 6)),
      open,
      high: r.high ?? high,
      low: r.low ?? low,
      close,
      volume: r.volume ?? 1000,
    };
  });
}

const baseStrategy = (
  overrides: Partial<StrategyDefinition> = {}
): StrategyDefinition => ({
  id: "test",
  name: "test",
  version: 1,
  marketType: "spot",
  symbol: "BTCUSDT",
  entryTimeframe: "15m",
  allowedDirections: ["long"],
  entryRules: [
    {
      type: "indicator",
      indicator: "price",
      field: "close",
      operator: ">",
      value: 100,
    },
  ],
  exitRules: [],
  risk: {
    riskPerTradePct: 1,
    stopLossPct: 2,
    takeProfitPct: 4,
  },
  ...overrides,
});

describe("execution", () => {
  it("slippage worsens buy and sell", () => {
    expect(applySlippage(100, "buy", 1)).toBeCloseTo(101, 10);
    expect(applySlippage(100, "sell", 1)).toBeCloseTo(99, 10);
  });

  it("long winning trade via take profit", () => {
    // Warmup below threshold, signal bar close>100, execute next open, then TP
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 }, // signal
      { close: 102, open: 101, high: 101 * 1.05, low: 100.5 }, // entry + TP hit
      { close: 103, open: 102, high: 104, low: 101 },
    ]);
    const exec = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    });
    const result = exec.execute(bars, baseStrategy());
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    const t = result.trades[0];
    expect(t.direction).toBe("long");
    expect(t.exitReason).toBe("take_profit");
    expect(t.netPnl).toBeGreaterThan(0);
  });

  it("long losing trade via stop loss", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 98, open: 101, high: 101.5, low: 101 * 0.97 }, // SL
      { close: 97, open: 98, high: 99, low: 96 },
    ]);
    const exec = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    });
    const result = exec.execute(bars, baseStrategy());
    expect(result.trades[0].exitReason).toBe("stop_loss");
    expect(result.trades[0].netPnl).toBeLessThan(0);
  });

  it("short winning trade via take profit", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      {
        close: 96,
        open: 101,
        high: 101.2,
        low: 101 * 0.95, // TP for short at -4%
      },
      { close: 95, open: 96, high: 97, low: 94 },
    ]);
    const exec = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    });
    const result = exec.execute(
      bars,
      baseStrategy({ allowedDirections: ["short"] })
    );
    expect(result.trades[0].direction).toBe("short");
    expect(result.trades[0].exitReason).toBe("take_profit");
    expect(result.trades[0].netPnl).toBeGreaterThan(0);
  });

  it("short losing trade via stop loss", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      {
        close: 104,
        open: 101,
        high: 101 * 1.03,
        low: 100.5,
      },
      { close: 105, open: 104, high: 106, low: 103 },
    ]);
    const exec = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    });
    const result = exec.execute(
      bars,
      baseStrategy({ allowedDirections: ["short"] })
    );
    expect(result.trades[0].exitReason).toBe("stop_loss");
    expect(result.trades[0].netPnl).toBeLessThan(0);
  });

  it("same-bar TP+SL conflict assumes adverse first", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      {
        close: 101,
        open: 101,
        high: 101 * 1.05,
        low: 101 * 0.97, // both TP and SL
      },
      { close: 101, open: 101, high: 102, low: 100 },
    ]);
    const exec = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    });
    const result = exec.execute(bars, baseStrategy());
    expect(result.trades[0].exitReason).toBe("stop_loss");
    expect(result.trades[0].intrabarConflict).toBe(true);
  });

  it("applies commissions on notional", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 101, high: 101 * 1.05, low: 100.5 },
      { close: 103, open: 102, high: 104, low: 101 },
    ]);
    const exec = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0.1,
      slippagePct: 0,
    });
    const result = exec.execute(bars, baseStrategy());
    const t = result.trades[0];
    expect(t.fees).toBeGreaterThan(0);
    expect(t.netPnl).toBeLessThan(t.grossPnl);
  });

  it("strategy exit schedules to next open", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 }, // signal entry
      { close: 102, open: 101, high: 102.5, low: 100.8 }, // entry; no SL/TP
      { close: 110, open: 102, high: 111, low: 101.5 }, // exit rule: close>105
      { close: 109, open: 110, high: 111, low: 108 }, // strategy exit fill
      { close: 108, open: 109, high: 110, low: 107 },
    ]);
    const strategy = baseStrategy({
      risk: { riskPerTradePct: 1, stopLossPct: 50, takeProfitPct: 50 },
      exitRules: [
        {
          type: "indicator",
          indicator: "price",
          field: "close",
          operator: ">",
          value: 105,
        },
      ],
    });
    const exec = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    });
    const result = exec.execute(bars, strategy);
    expect(result.trades.some((t) => t.exitReason === "strategy_exit")).toBe(
      true
    );
  });
});

describe("risk", () => {
  it("sizes position from 1% risk and loses ~1R on SL", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 98, open: 100, high: 100.5, low: 100 * 0.97 },
      { close: 97, open: 98, high: 99, low: 96 },
    ]);
    const capital = 10_000;
    const exec = new TruthBacktestExecutor({
      initialCapital: capital,
      commissionPct: 0,
      slippagePct: 0,
    });
    const result = exec.execute(
      bars,
      baseStrategy({
        risk: { riskPerTradePct: 1, stopLossPct: 2, takeProfitPct: 10 },
      })
    );
    const t = result.trades[0];
    expect(t.initialRiskUsd).toBeCloseTo(capital * 0.01, 6);
    expect(t.exitReason).toBe("stop_loss");
    expect(t.realizedR).toBeCloseTo(-1, 5);
  });

  it("initial capital changes results appropriately", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 101, high: 101 * 1.05, low: 100.5 },
      { close: 103, open: 102, high: 104, low: 101 },
    ]);
    const a = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, baseStrategy());
    const b = new TruthBacktestExecutor({
      initialCapital: 20_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, baseStrategy());
    expect(b.trades[0].quantity).toBeCloseTo(a.trades[0].quantity * 2, 8);
    expect(b.trades[0].netPnl).toBeCloseTo(a.trades[0].netPnl * 2, 6);
  });
});

describe("metrics", () => {
  it("computes win rate, profit factor, expectancy, drawdown, R, equity", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      // trade 1 win
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 101, high: 101 * 1.05, low: 100.5 },
      // cool off
      { close: 90, open: 90, high: 91, low: 89 },
      { close: 90, open: 90, high: 91, low: 89 },
      // trade 2 loss
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 98, open: 101, high: 101.2, low: 101 * 0.97 },
      { close: 97, open: 97, high: 98, low: 96 },
    ]);
    const exec = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    });
    const result = exec.execute(bars, baseStrategy());
    const metrics = calculateMetrics({
      trades: result.trades,
      equityTimeline: result.equityTimeline,
      initialCapital: 10_000,
      totalBars: bars.length,
      barsInPosition: 2,
    });
    expect(metrics.totalTrades).toBe(result.trades.length);
    expect(metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(metrics.finalEquity).toBe(result.finalEquity);
    expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(metrics.averageRealizedR).not.toBeNull();
    expect(metrics.expectancy).not.toBeNull();
  });
});
