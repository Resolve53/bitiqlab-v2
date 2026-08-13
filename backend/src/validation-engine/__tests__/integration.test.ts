import { describe, expect, it } from "vitest";
import { chronologicalSplitIndices } from "../splits";
import { mergeValidationConfig } from "../config";
import { buildWalkForwardWindows } from "../walk-forward";
import { runValidation } from "../orchestrator";
import {
  fixtureStrategy,
  makeBars,
  makeProfitableLongBars,
} from "./fixtures";

function stripVolatile(report: Awaited<ReturnType<typeof runValidation>>) {
  const { timestamp: _t, ...rest } = report;
  return rest;
}

describe("validation integration (Truth Engine)", () => {
  it("runs full pipeline on fixture OHLCV without network", async () => {
    const bars = makeProfitableLongBars(360);
    const config = mergeValidationConfig({
      walkForwardTrainBars: 80,
      walkForwardValidationBars: 20,
      walkForwardStepBars: 20,
      minimumTotalTrades: 1,
      minimumValidationTrades: 0,
      minimumTestTrades: 0,
      minimumWalkForwardWindows: 1,
      // Relax gate for synthetic fixture — assert structure not perfection
      minValidationProfitFactor: 0,
      minTestProfitFactor: 0,
      minWalkForwardProfitableWindowPct: 0,
      minSensitivityPositiveExpectancyPct: 0,
      costStressRequirePositiveExpectancyAt: 1.5,
      crossAssetSymbols: ["BTCUSDT", "ETHUSDT"],
    });

    const ethBars = makeBars(360, { base: 2000, startMs: Date.UTC(2023, 0, 1) });

    const report = await runValidation({
      strategy: fixtureStrategy,
      request: {
        strategyId: fixtureStrategy.id,
        bars,
        crossAssetBars: {
          BTCUSDT: bars,
          ETHUSDT: ethBars,
        },
        initialCapital: 10_000,
        commissionPct: 0.05,
        slippagePct: 0.02,
        config,
      },
    });

    expect(report.resultSource).toBe("REAL_VALIDATION");
    expect(report.schemaVersion).toBe("validation_engine_v1");
    expect(report.chronological.train.barCount).toBeGreaterThan(0);
    expect(report.chronological.validation.barCount).toBeGreaterThan(0);
    expect(report.chronological.test.barCount).toBeGreaterThan(0);
    expect(report.chronological.train.resultSource).toBe("REAL_BACKTEST");
    expect(report.walkForward.windowCount).toBeGreaterThan(0);
    expect(report.costStress.cases.length).toBe(5);
    expect(report.regimes.definitions.trend).toBeTruthy();
    expect(report.regimes.methodology).toMatch(/Descriptive only/);
    for (const b of [...report.regimes.trend, ...report.regimes.volatility]) {
      expect(b).toHaveProperty("netPnl");
      expect(b).toHaveProperty("tradePathDrawdownApprox");
      expect(b).not.toHaveProperty("totalReturn");
      expect(b).not.toHaveProperty("maxDrawdown");
    }
    expect(report.gate.status).toMatch(/pass|conditional|fail/);
    expect(report.gate.checks).toBeTypeOf("object");
    expect(Object.keys(report.gate.checks).length).toBeGreaterThan(5);
    expect(report.dataset.provider).toBe("fixture");
    expect(report.sensitivity.originalUnchanged).toBe(true);

    // Cost multipliers applied
    const fees15 = report.costStress.cases.find((c) => c.name === "fees_x1_5")!;
    expect(fees15.commissionPct).toBeCloseTo(0.05 * 1.5);
    expect(fees15.slippagePct).toBeCloseTo(0.02);
  }, 60_000);

  it("identical inputs → identical report (except timestamp)", async () => {
    const bars = makeBars(200, { drift: 0.05, amp: 0.04 });
    const config = {
      walkForwardTrainBars: 50,
      walkForwardValidationBars: 15,
      walkForwardStepBars: 15,
      minimumTotalTrades: 1,
      minimumValidationTrades: 0,
      minimumTestTrades: 0,
      minimumWalkForwardWindows: 1,
      minValidationProfitFactor: 0,
      minTestProfitFactor: 0,
      minWalkForwardProfitableWindowPct: 0,
      minSensitivityPositiveExpectancyPct: 0,
      crossAssetSymbols: ["BTCUSDT"],
    };
    const req = {
      strategyId: fixtureStrategy.id,
      bars,
      crossAssetBars: { BTCUSDT: bars },
      initialCapital: 10_000,
      commissionPct: 0.05,
      slippagePct: 0.02,
      config,
    };
    const a = await runValidation({ strategy: fixtureStrategy, request: req });
    const b = await runValidation({ strategy: fixtureStrategy, request: req });
    expect(stripVolatile(a)).toEqual(stripVolatile(b));
  }, 60_000);
});

describe("data leakage protections", () => {
  it("walk-forward windows stay entirely before reserved test split", () => {
    const n = 200;
    const config = mergeValidationConfig({
      trainPct: 0.6,
      validationPct: 0.2,
      testPct: 0.2,
      walkForwardTrainBars: 40,
      walkForwardValidationBars: 10,
      walkForwardStepBars: 10,
    });
    const split = chronologicalSplitIndices(n, config);
    const preTestLen = split.testStart;
    const windows = buildWalkForwardWindows(preTestLen, config);
    for (const w of windows) {
      expect(w.validationEnd).toBeLessThanOrEqual(preTestLen);
      // absolute index in full series = same since preTest starts at 0
      expect(w.validationEnd).toBeLessThanOrEqual(split.testStart);
    }
  });

  it("test segment never overlaps train or validation", () => {
    const split = chronologicalSplitIndices(
      500,
      mergeValidationConfig()
    );
    const trainIdx = new Set(
      Array.from({ length: split.trainEnd }, (_, i) => i)
    );
    const valIdx = new Set(
      Array.from(
        { length: split.validationEnd - split.validationStart },
        (_, i) => i + split.validationStart
      )
    );
    for (let i = split.testStart; i < split.testEnd; i++) {
      expect(trainIdx.has(i)).toBe(false);
      expect(valIdx.has(i)).toBe(false);
    }
  });
});
