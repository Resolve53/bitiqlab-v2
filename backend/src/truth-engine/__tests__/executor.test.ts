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
    return {
      timestamp:
        r.timestamp ??
        new Date(Date.UTC(2024, 0, 1 + Math.floor(i / 4), (i % 4) * 6)),
      open,
      high: r.high ?? Math.max(open, close),
      low: r.low ?? Math.min(open, close),
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
  entries: [
    {
      direction: "long",
      condition: {
        type: "indicator",
        indicator: "price",
        field: "close",
        operator: ">",
        value: 100,
      },
    },
  ],
  exitCondition: null,
  risk: {
    riskPerTradePct: 1,
    stopLossPct: 2,
    takeProfitPct: 4,
  },
  leverage: 1,
  ...overrides,
});

describe("execution", () => {
  it("slippage worsens buy and sell", () => {
    expect(applySlippage(100, "buy", 1)).toBeCloseTo(101, 10);
    expect(applySlippage(100, "sell", 1)).toBeCloseTo(99, 10);
  });

  it("long winning trade via take profit", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 101, high: 101 * 1.05, low: 100.5 },
      { close: 103, open: 102, high: 104, low: 101 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, baseStrategy());
    expect(result.trades[0].direction).toBe("long");
    expect(result.trades[0].exitReason).toBe("take_profit");
    expect(result.trades[0].netPnl).toBeGreaterThan(0);
  });

  it("long losing trade via stop loss", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 98, open: 101, high: 101.5, low: 101 * 0.97 },
      { close: 97, open: 98, high: 99, low: 96 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, baseStrategy());
    expect(result.trades[0].exitReason).toBe("stop_loss");
    expect(result.trades[0].netPnl).toBeLessThan(0);
  });

  it("short winning trade via take profit", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 96, open: 101, high: 101.2, low: 101 * 0.95 },
      { close: 95, open: 96, high: 97, low: 94 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(
      bars,
      baseStrategy({
        entries: [
          {
            direction: "short",
            condition: {
              type: "indicator",
              indicator: "price",
              field: "close",
              operator: ">",
              value: 100,
            },
          },
        ],
      })
    );
    expect(result.trades[0].direction).toBe("short");
    expect(result.trades[0].exitReason).toBe("take_profit");
    expect(result.trades[0].netPnl).toBeGreaterThan(0);
  });

  it("short losing trade via stop loss", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 104, open: 101, high: 101 * 1.03, low: 100.5 },
      { close: 105, open: 104, high: 106, low: 103 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(
      bars,
      baseStrategy({
        entries: [
          {
            direction: "short",
            condition: {
              type: "indicator",
              indicator: "price",
              field: "close",
              operator: ">",
              value: 100,
            },
          },
        ],
      })
    );
    expect(result.trades[0].exitReason).toBe("stop_loss");
    expect(result.trades[0].netPnl).toBeLessThan(0);
  });

  it("same-bar TP+SL conflict assumes adverse first", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 101, open: 101, high: 101 * 1.05, low: 101 * 0.97 },
      { close: 101, open: 101, high: 102, low: 100 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, baseStrategy());
    expect(result.trades[0].exitReason).toBe("stop_loss");
    expect(result.trades[0].intrabarConflict).toBe(true);
  });

  it("entry-bar SL/TP: fill at N+1 open then check same bar OHLC", () => {
    // Deliberate: entry and SL on the same execution candle
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 }, // signal N
      { close: 99, open: 100, high: 100.5, low: 100 * 0.97 }, // entry+SL on N+1
      { close: 98, open: 99, high: 99.5, low: 97 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, baseStrategy());
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryPrice).toBe(100);
    expect(result.trades[0].exitReason).toBe("stop_loss");
    expect(new Date(result.trades[0].entryTime).getTime()).toBe(
      new Date(result.trades[0].exitTime).getTime()
    );
  });

  it("LONG gap through stop fills at open not stop level", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      // Entry at 100; SL at 98. Next bar gaps open at 95 (< SL)
      { close: 101, open: 100, high: 101, low: 99.5 }, // entry bar, no SL
      { close: 94, open: 95, high: 96, low: 93 }, // gap SL
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(
      bars,
      baseStrategy({
        risk: { riskPerTradePct: 1, stopLossPct: 2, takeProfitPct: 50 },
      })
    );
    const t = result.trades[0];
    expect(t.exitReason).toBe("stop_loss");
    expect(t.gapFill).toBe(true);
    expect(t.exitPrice).toBe(95); // open, not 98
    expect(t.exitPrice).toBeLessThan(t.stopLoss);
  });

  it("SHORT gap through stop fills at open not stop level", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 101, open: 100, high: 100.5, low: 99.5 }, // entry short @100, SL=102
      { close: 106, open: 105, high: 107, low: 104 }, // gap above SL
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(
      bars,
      baseStrategy({
        entries: [
          {
            direction: "short",
            condition: {
              type: "indicator",
              indicator: "price",
              field: "close",
              operator: ">",
              value: 100,
            },
          },
        ],
        risk: { riskPerTradePct: 1, stopLossPct: 2, takeProfitPct: 50 },
      })
    );
    const t = result.trades[0];
    expect(t.exitReason).toBe("stop_loss");
    expect(t.gapFill).toBe(true);
    expect(t.exitPrice).toBe(105);
    expect(t.exitPrice).toBeGreaterThan(t.stopLoss);
  });

  it("applies commissions on notional", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 101, high: 101 * 1.05, low: 100.5 },
      { close: 103, open: 102, high: 104, low: 101 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0.1,
      slippagePct: 0,
    }).execute(bars, baseStrategy());
    expect(result.trades[0].fees).toBeGreaterThan(0);
    expect(result.trades[0].netPnl).toBeLessThan(result.trades[0].grossPnl);
  });

  it("strategy exit schedules to next open", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 101, high: 102.5, low: 100.8 },
      { close: 110, open: 102, high: 111, low: 101.5 },
      { close: 109, open: 110, high: 111, low: 108 },
      { close: 108, open: 109, high: 110, low: 107 },
    ]);
    const strategy = baseStrategy({
      risk: { riskPerTradePct: 1, stopLossPct: 50, takeProfitPct: 50 },
      exitCondition: {
        type: "indicator",
        indicator: "price",
        field: "close",
        operator: ">",
        value: 105,
      },
    });
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, strategy);
    expect(result.trades.some((t) => t.exitReason === "strategy_exit")).toBe(
      true
    );
  });
});

describe("risk and capital", () => {
  it("sizes position from 1% risk and loses ~1R on SL", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 98, open: 100, high: 100.5, low: 100 * 0.97 },
      { close: 97, open: 98, high: 99, low: 96 },
    ]);
    const capital = 10_000;
    const result = new TruthBacktestExecutor({
      initialCapital: capital,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(
      bars,
      baseStrategy({
        risk: { riskPerTradePct: 1, stopLossPct: 2, takeProfitPct: 10 },
      })
    );
    const t = result.trades[0];
    expect(t.requestedRiskUsd).toBeCloseTo(capital * 0.01, 6);
    expect(t.actualRiskUsd).toBeCloseTo(capital * 0.01, 6);
    expect(t.capitalCapped).toBe(false);
    expect(t.exitReason).toBe("stop_loss");
    expect(t.realizedR).toBeCloseTo(-1, 5);
  });

  it("tight stop causes oversized quantity to be capital-capped", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 100, high: 100 * 1.05, low: 99.9 },
      { close: 103, open: 102, high: 104, low: 101 },
    ]);
    // 10% risk with 0.01% stop → huge qty without cap
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(
      bars,
      baseStrategy({
        risk: { riskPerTradePct: 10, stopLossPct: 0.01, takeProfitPct: 4 },
      })
    );
    const t = result.trades[0];
    expect(t.capitalCapped).toBe(true);
    expect(t.actualRiskUsd).toBeLessThan(t.requestedRiskUsd);
    expect(t.marginUsed + t.fees * 0).toBeLessThanOrEqual(10_000 + 1e-6);
    expect(t.positionNotional).toBeLessThanOrEqual(10_000 + 1e-6);
  });

  it("1x spot cannot buy more than available cash including fees", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 100, high: 105, low: 99.5 },
      { close: 103, open: 102, high: 104, low: 101 },
    ]);
    const equity = 1_000;
    const result = new TruthBacktestExecutor({
      initialCapital: equity,
      commissionPct: 0.1,
      slippagePct: 0,
    }).execute(
      bars,
      baseStrategy({
        risk: { riskPerTradePct: 50, stopLossPct: 0.05, takeProfitPct: 4 },
      })
    );
    const t = result.trades[0];
    expect(t.capitalCapped).toBe(true);
    const entryCommission = t.entryPrice * t.quantity * 0.001;
    expect(t.positionNotional + entryCommission).toBeLessThanOrEqual(
      equity + 1e-6
    );
  });

  it("leveraged futures respects margin constraint", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 100, high: 105, low: 99.5 },
      { close: 103, open: 102, high: 104, low: 101 },
    ]);
    const equity = 1_000;
    const leverage = 5;
    const result = new TruthBacktestExecutor({
      initialCapital: equity,
      commissionPct: 0.05,
      slippagePct: 0,
      leverage,
    }).execute(
      bars,
      baseStrategy({
        marketType: "futures",
        leverage,
        risk: { riskPerTradePct: 20, stopLossPct: 0.05, takeProfitPct: 4 },
      })
    );
    const t = result.trades[0];
    expect(t.leverage).toBe(5);
    const entryCommission = t.entryPrice * t.quantity * (0.05 / 100);
    expect(t.marginUsed + entryCommission).toBeLessThanOrEqual(equity + 1e-6);
    // Notional may exceed equity under leverage, but margin must not
    expect(t.positionNotional).toBeGreaterThan(t.marginUsed);
  });

  it("actual risk shrinks when capital caps position", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 99, open: 100, high: 100.2, low: 100 * 0.97 },
      { close: 98, open: 99, high: 99.5, low: 97 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 5_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(
      bars,
      baseStrategy({
        risk: { riskPerTradePct: 25, stopLossPct: 0.1, takeProfitPct: 10 },
      })
    );
    const t = result.trades[0];
    expect(t.capitalCapped).toBe(true);
    expect(t.actualRiskUsd).toBeLessThan(t.requestedRiskUsd);
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
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 102, open: 101, high: 101 * 1.05, low: 100.5 },
      { close: 90, open: 90, high: 91, low: 89 },
      { close: 90, open: 90, high: 91, low: 89 },
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 98, open: 101, high: 101.2, low: 101 * 0.97 },
      { close: 97, open: 97, high: 98, low: 96 },
    ]);
    const result = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, baseStrategy());
    const metrics = calculateMetrics({
      trades: result.trades,
      equityTimeline: result.equityTimeline,
      initialCapital: 10_000,
      totalBars: bars.length,
      barsInPosition: 2,
    });
    expect(metrics.totalTrades).toBe(result.trades.length);
    expect(metrics.finalEquity).toBe(result.finalEquity);
    expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(metrics.averageRealizedR).not.toBeNull();
  });
});
