import { describe, expect, it } from "vitest";
import { evaluatePaperReadiness } from "../readiness-gate";
import { evaluatePaperForward } from "../forward-evaluation";
import type { PaperForwardEvaluation } from "../forward-evaluation";
import { makeRunningSession, makeClosedTrade } from "./helpers";
import { DEFAULT_PAPER_READINESS_CONFIG } from "../readiness-config";

const tight = {
  minClosedTrades: 3,
  minClosedCandles: 10,
  minElapsedHours: 1,
  minExpectancy: 0,
  minProfitFactor: 1.2,
  maxDrawdown: 0.2,
  minWinRate: 0.4,
  minHalfExpectancy: 0,
  maxConsecutiveLosses: 10,
  maxTickErrors: 5,
};

function ev(
  overrides: Partial<PaperForwardEvaluation> = {}
): PaperForwardEvaluation {
  return {
    source: "paper_forward_simulated",
    startingCapital: 10_000,
    currentEquity: 10_100,
    realizedPnl: 100,
    unrealizedPnl: 0,
    feesPaid: 1,
    closedTrades: 20,
    openTrades: 0,
    wins: 12,
    losses: 8,
    winRate: 0.6,
    expectancy: 5,
    profitFactor: 1.5,
    maxDrawdown: 0.05,
    maxConsecutiveLosses: 2,
    firstHalfExpectancy: 4,
    secondHalfExpectancy: 6,
    elapsedMs: 48 * 3600_000,
    elapsedHours: 48,
    closedCandlesProcessed: 200,
    lastProcessedCandleTs: "2024-01-02T00:00:00.000Z",
    equityCurve: [],
    evaluatedAt: "2024-01-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 4C readiness gate", () => {
  it("READY_FOR_REVIEW when sample and hard checks pass", () => {
    const decision = evaluatePaperReadiness({
      session: makeRunningSession(),
      evaluation: ev(),
      snapshotOk: true,
      validationStatus: "pass",
      validationId: "val-1",
      tickErrorCount: 0,
    });
    expect(decision.status).toBe("READY_FOR_REVIEW");
    expect(decision.historicalSourceExcluded).toBe(true);
    expect(decision.evaluationSource).toBe("paper_forward_simulated");
  });

  it("NOT_READY on insufficient sample (no hard fail)", () => {
    const decision = evaluatePaperReadiness({
      session: makeRunningSession(),
      evaluation: ev({
        closedTrades: 2,
        closedCandlesProcessed: 5,
        elapsedHours: 1,
      }),
      snapshotOk: true,
      validationStatus: "pass",
      validationId: "val-1",
      config: tight,
    });
    expect(decision.status).toBe("NOT_READY");
    expect(decision.reasons.join(" ")).toMatch(/sample_trades|sample_candles/);
  });

  it("REJECT on drawdown violation even with small sample", () => {
    const decision = evaluatePaperReadiness({
      session: makeRunningSession(),
      evaluation: ev({
        closedTrades: 1,
        closedCandlesProcessed: 1,
        elapsedHours: 0,
        maxDrawdown: 0.5,
      }),
      snapshotOk: true,
      validationStatus: "pass",
      validationId: "val-1",
      config: { ...tight, maxDrawdown: 0.2 },
    });
    expect(decision.status).toBe("REJECT");
    expect(decision.reasons.join(" ")).toMatch(/drawdown/);
  });

  it("REJECT on snapshot / provenance mismatch", () => {
    const decision = evaluatePaperReadiness({
      session: makeRunningSession(),
      evaluation: ev(),
      snapshotOk: false,
      snapshotError: "hash mismatch",
      validationStatus: "fail",
      validationId: "val-1",
    });
    expect(decision.status).toBe("REJECT");
    expect(decision.reasons.join(" ")).toMatch(/snapshot_integrity/);
    expect(decision.reasons.join(" ")).toMatch(/validation_provenance/);
  });

  it("REJECT on missing validation id", () => {
    const decision = evaluatePaperReadiness({
      session: { ...makeRunningSession(), validation_id: "" },
      evaluation: ev(),
      snapshotOk: true,
      validationStatus: null,
      validationId: null,
    });
    expect(decision.status).toBe("REJECT");
  });

  it("REJECT after sufficient sample when expectancy/PF/win rate fail", () => {
    const decision = evaluatePaperReadiness({
      session: makeRunningSession(),
      evaluation: ev({
        expectancy: -2,
        profitFactor: 0.8,
        winRate: 0.1,
        firstHalfExpectancy: -1,
        secondHalfExpectancy: -2,
      }),
      snapshotOk: true,
      validationStatus: "pass",
      validationId: "val-1",
    });
    expect(decision.status).toBe("REJECT");
    expect(decision.checks.expectancy.passed).toBe(false);
    expect(decision.checks.profit_factor.passed).toBe(false);
    expect(decision.checks.win_rate.passed).toBe(false);
    expect(decision.checks.consistency_halves.passed).toBe(false);
  });

  it("does not mix historical metrics into the decision", () => {
    const session = makeRunningSession();
    const fromTrades = evaluatePaperForward({
      session,
      trades: Array.from({ length: 20 }, (_, i) =>
        makeClosedTrade({
          id: `t${i}`,
          realized_pnl: 2,
          fee: 0,
          entry_candle_ts: `2024-01-01T0${i}:00:00.000Z`,
          exit_candle_ts: `2024-01-01T0${i}:30:00.000Z`,
        })
      ),
      closedCandlesProcessed: 200,
      now: new Date("2024-01-03T00:00:00.000Z"),
    });
    const decision = evaluatePaperReadiness({
      session,
      evaluation: fromTrades,
      snapshotOk: true,
      validationStatus: "pass",
      validationId: "val-1",
      config: {
        minClosedTrades: 20,
        minClosedCandles: 100,
        minElapsedHours: 24,
      },
    });
    expect(fromTrades.source).toBe("paper_forward_simulated");
    expect(decision.historicalSourceExcluded).toBe(true);
    expect(fromTrades.expectancy).toBe(2);
  });

  it("documents default thresholds", () => {
    expect(DEFAULT_PAPER_READINESS_CONFIG.minClosedTrades).toBe(20);
    expect(DEFAULT_PAPER_READINESS_CONFIG.minClosedCandles).toBe(100);
    expect(DEFAULT_PAPER_READINESS_CONFIG.minElapsedHours).toBe(24);
    expect(DEFAULT_PAPER_READINESS_CONFIG.minProfitFactor).toBe(1.2);
    expect(DEFAULT_PAPER_READINESS_CONFIG.maxDrawdown).toBe(0.2);
    expect(DEFAULT_PAPER_READINESS_CONFIG.minWinRate).toBe(0.4);
  });
});
