import { describe, expect, it } from "vitest";
import { buildHistoricalVsForwardComparison } from "../comparison";
import { evaluatePaperForward } from "../forward-evaluation";
import { evaluatePaperReadiness } from "../readiness-gate";
import { makeRunningSession, makeClosedTrade } from "./helpers";

describe("historical vs forward comparison", () => {
  it("keeps Phase 2 historical and Phase 4 forward metrics in separate slices", () => {
    const session = makeRunningSession();
    const evaluation = evaluatePaperForward({
      session,
      trades: [makeClosedTrade({ realized_pnl: 3 })],
      closedCandlesProcessed: 10,
    });
    const readiness = evaluatePaperReadiness({
      session,
      evaluation,
      snapshotOk: true,
      validationStatus: "pass",
      validationId: session.validation_id,
      config: { minClosedTrades: 100 },
    });
    const comparison = buildHistoricalVsForwardComparison({
      validation: {
        id: "val-1",
        status: "pass",
        gate: { status: "pass" },
        report: {
          chronological: {
            validation: {
              tradeCount: 40,
              barCount: 500,
              metrics: {
                expectancy: 12,
                profitFactor: 1.8,
                winRate: 0.55,
                maxDrawdown: 0.08,
                totalTrades: 40,
                totalReturn: 0.2,
                sharpeRatio: 1.1,
                netProfit: 480,
              },
            },
            test: {
              metrics: { expectancy: 8, profitFactor: 1.4 },
            },
          },
        },
      },
      validationId: "val-1",
      evaluation,
      readiness,
    });
    expect(comparison.blended).toBe(false);
    expect(comparison.historical.source).toBe("phase2_historical_validation");
    expect(comparison.forward.source).toBe("paper_forward_simulated");
    expect(comparison.historical.validationSplit?.expectancy).toBe(12);
    expect(comparison.forward.evaluation?.expectancy).toBe(3);
    expect(comparison.forward.evaluation?.expectancy).not.toBe(
      comparison.historical.validationSplit?.expectancy
    );
  });
});
