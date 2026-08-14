import { describe, expect, it } from "vitest";
import {
  evaluatePaperForward,
  maxConsecutiveLosses,
  halfExpectancy,
} from "../forward-evaluation";
import { makeRunningSession, makeClosedTrade } from "./helpers";

describe("Phase 4C forward evaluation formulas", () => {
  it("computes expectancy, PF, win rate, DD, fees, equity curve from closed simulated trades only", () => {
    const session = makeRunningSession();
    const trades = [
      makeClosedTrade({
        id: "a",
        realized_pnl: 10,
        fee: 1,
        exit_candle_ts: "2024-01-01T01:00:00.000Z",
      }),
      makeClosedTrade({
        id: "b",
        realized_pnl: -5,
        fee: 1,
        entry_candle_ts: "2024-01-01T02:00:00.000Z",
        exit_candle_ts: "2024-01-01T03:00:00.000Z",
      }),
      makeClosedTrade({
        id: "c",
        realized_pnl: 15,
        fee: 1,
        entry_candle_ts: "2024-01-01T04:00:00.000Z",
        exit_candle_ts: "2024-01-01T05:00:00.000Z",
      }),
      {
        ...makeClosedTrade({ id: "open" }),
        status: "open",
        realized_pnl: null,
        exit_candle_ts: null,
        fee: 0.5,
      },
    ];
    const ev = evaluatePaperForward({
      session: {
        ...session,
        started_at: "2024-01-01T00:00:00.000Z",
        unrealized_pnl: 2,
      },
      trades,
      closedCandlesProcessed: 40,
      now: new Date("2024-01-02T00:00:00.000Z"),
    });
    expect(ev.source).toBe("paper_forward_simulated");
    expect(ev.closedTrades).toBe(3);
    expect(ev.openTrades).toBe(1);
    expect(ev.wins).toBe(2);
    expect(ev.losses).toBe(1);
    expect(ev.winRate).toBeCloseTo(2 / 3);
    expect(ev.expectancy).toBeCloseTo(20 / 3);
    expect(ev.profitFactor).toBeCloseTo(25 / 5);
    expect(ev.realizedPnl).toBe(20);
    expect(ev.feesPaid).toBeCloseTo(3.5);
    expect(ev.elapsedHours).toBe(24);
    expect(ev.closedCandlesProcessed).toBe(40);
    expect(ev.equityCurve[0].equity).toBe(10_000);
    expect(ev.equityCurve[0].source).toBe("paper_forward_simulated");
    expect(ev.currentEquity).toBe(10_022);
    expect(ev.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it("ignores historical-looking fields and only uses trade realized_pnl", () => {
    const session = makeRunningSession();
    (session as any).paper_metrics = { realizedPnl: 999999 };
    const ev = evaluatePaperForward({
      session,
      trades: [makeClosedTrade({ realized_pnl: 1, fee: 0 })],
      closedCandlesProcessed: 1,
    });
    expect(ev.realizedPnl).toBe(1);
    expect(ev.expectancy).toBe(1);
  });

  it("max consecutive losses and half expectancy", () => {
    expect(maxConsecutiveLosses([1, -1, -1, -1, 2, -1])).toBe(3);
    const h = halfExpectancy([10, 10, -4, -4]);
    expect(h.first).toBe(10);
    expect(h.second).toBe(-4);
  });

  it("PF is null when there are wins and zero losses", () => {
    const ev = evaluatePaperForward({
      session: makeRunningSession(),
      trades: [makeClosedTrade({ realized_pnl: 5 })],
      closedCandlesProcessed: 1,
    });
    expect(ev.profitFactor).toBeNull();
    expect(ev.expectancy).toBe(5);
  });
});
