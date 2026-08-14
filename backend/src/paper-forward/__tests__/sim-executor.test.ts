import { describe, expect, it } from "vitest";
import { TruthBacktestExecutor } from "@/truth-engine/executor";
import { applySlippage } from "@/truth-engine/slippage";
import {
  initialPaperState,
  processClosedBars,
  sizePosition,
} from "../sim-executor";
import { buildPaperMetrics } from "../paper-metrics";
import {
  makeBars,
  slLongBars,
  tpLongBars,
  truthStrategy,
} from "./helpers";

function runPaper(
  bars: ReturnType<typeof makeBars>,
  strategy = truthStrategy(),
  fees = { commissionPct: 0, slippagePct: 0 }
) {
  return processClosedBars({
    bars,
    executeFromIndex: 0,
    strategy,
    state: initialPaperState({
      initialCapital: 10_000,
      ...fees,
    }),
  });
}

describe("simulated fills — direction, SL, TP, strategy exit", () => {
  it("long entry then take profit", () => {
    const result = runPaper(tpLongBars());
    expect(result.closedTrades).toHaveLength(1);
    expect(result.closedTrades[0].direction).toBe("long");
    expect(result.closedTrades[0].reason).toBe("take_profit");
    expect(result.closedTrades[0].realizedPnl).toBeGreaterThan(0);
  });

  it("long entry then stop loss", () => {
    const result = runPaper(slLongBars());
    expect(result.closedTrades[0].reason).toBe("stop_loss");
    expect(result.closedTrades[0].realizedPnl).toBeLessThan(0);
  });

  it("short entry then take profit where allowed", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 96, open: 101, high: 101.2, low: 101 * 0.95 },
      { close: 95, open: 96, high: 97, low: 94 },
    ]);
    const result = runPaper(
      bars,
      truthStrategy({
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
    expect(result.closedTrades[0].direction).toBe("short");
    expect(result.closedTrades[0].reason).toBe("take_profit");
    expect(result.closedTrades[0].realizedPnl).toBeGreaterThan(0);
  });

  it("strategy exit fills at next open (not same bar)", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 101.2, open: 101, high: 101.3, low: 100.8 },
      { close: 50, open: 101.1, high: 101.2, low: 100.9 },
      { close: 50, open: 50, high: 50.5, low: 49.5 },
    ]);
    const result = runPaper(
      bars,
      truthStrategy({
        exitCondition: {
          type: "indicator",
          indicator: "price",
          field: "close",
          operator: "<",
          value: 60,
        },
        risk: { riskPerTradePct: 1, stopLossPct: 50, takeProfitPct: 80 },
      })
    );
    expect(result.closedTrades[0].reason).toBe("strategy_exit");
  });

  it("SL+TP same-candle ambiguity uses adverse SL first", () => {
    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 100, open: 101, high: 101 * 1.05, low: 101 * 0.97 },
    ]);
    const result = runPaper(bars);
    expect(result.closedTrades[0].reason).toBe("stop_loss");
    expect(result.closedTrades[0].intrabarConflict).toBe(true);
  });
});

describe("fees, slippage, sizing, leverage, pnl, equity, drawdown", () => {
  it("fees reduce net P&L vs zero-commission", () => {
    const bars = tpLongBars();
    const free = runPaper(bars);
    const paid = runPaper(bars, truthStrategy(), {
      commissionPct: 0.1,
      slippagePct: 0,
    });
    expect(paid.closedTrades[0].fee).toBeGreaterThan(0);
    expect(paid.closedTrades[0].realizedPnl).toBeLessThan(
      free.closedTrades[0].realizedPnl
    );
    expect(paid.state.feesPaid).toBeGreaterThan(0);
  });

  it("slippage worsens entry and exit", () => {
    expect(applySlippage(100, "buy", 1)).toBeCloseTo(101);
    expect(applySlippage(100, "sell", 1)).toBeCloseTo(99);
    const bars = tpLongBars();
    const free = runPaper(bars);
    const slipped = runPaper(bars, truthStrategy(), {
      commissionPct: 0,
      slippagePct: 0.05,
    });
    expect(slipped.openedTrades[0].entryPrice).toBeGreaterThan(
      free.openedTrades[0].entryPrice
    );
  });

  it("risk sizing uses equity * riskPct / |entry-stop| then capital cap", () => {
    const sized = sizePosition({
      equity: 10_000,
      entryPrice: 100,
      stopLoss: 98,
      riskPerTradePct: 1,
      leverage: 1,
      commissionPct: 0,
    });
    expect(sized).not.toBeNull();
    expect(sized!.requestedRiskUsd).toBeCloseTo(100);
    expect(sized!.quantity).toBeCloseTo(50);
    expect(sized!.actualRiskUsd).toBeCloseTo(100);
  });

  it("leverage only affects margin cap, not requested risk", () => {
    const spot = sizePosition({
      equity: 1_000,
      entryPrice: 100,
      stopLoss: 99,
      riskPerTradePct: 50,
      leverage: 1,
      commissionPct: 0,
    })!;
    const lev = sizePosition({
      equity: 1_000,
      entryPrice: 100,
      stopLoss: 99,
      riskPerTradePct: 50,
      leverage: 5,
      commissionPct: 0,
    })!;
    expect(spot.requestedRiskUsd).toBeCloseTo(lev.requestedRiskUsd);
    expect(lev.quantity).toBeGreaterThan(spot.quantity);
    expect(lev.marginUsed).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it("realized + unrealized + equity + drawdown from simulated trades", () => {
    const result = runPaper(slLongBars());
    const metrics = buildPaperMetrics({
      initialCapital: 10_000,
      state: result.state,
      unrealizedPnl: result.unrealizedPnl,
      lastProcessedCandleTs: result.lastProcessedCandleTs,
      equityTimeline: result.equityTimeline,
    });
    expect(metrics.source).toBe("paper_forward_simulated");
    expect(metrics.realizedPnl).toBe(result.state.realizedPnl);
    expect(metrics.currentEquity).toBeCloseTo(
      10_000 + metrics.realizedPnl + metrics.unrealizedPnl
    );
    expect(metrics.maxDrawdown).toBeGreaterThan(0);
    expect(metrics.losses).toBe(1);
    expect(metrics.winRate).toBe(0);
  });
});

describe("parity with Truth Engine on the same closed bars", () => {
  it("matches backtest closed trades (no end_of_test leftover)", () => {
    const bars = tpLongBars();
    const paper = runPaper(bars);
    const backtest = new TruthBacktestExecutor({
      initialCapital: 10_000,
      commissionPct: 0,
      slippagePct: 0,
    }).execute(bars, truthStrategy());
    const backtestClosed = backtest.trades.filter(
      (t) => t.exitReason !== "end_of_test"
    );
    expect(paper.closedTrades).toHaveLength(backtestClosed.length);
    expect(paper.closedTrades[0].reason).toBe(backtestClosed[0].exitReason);
    expect(paper.closedTrades[0].entryPrice).toBeCloseTo(
      backtestClosed[0].entryPrice
    );
    expect(paper.closedTrades[0].exitPrice).toBeCloseTo(
      backtestClosed[0].exitPrice
    );
    expect(paper.closedTrades[0].realizedPnl).toBeCloseTo(
      backtestClosed[0].netPnl
    );
  });
});
