import { describe, expect, it } from "vitest";
import { mergeValidationConfig } from "../config";
import { computeDegradation } from "../degradation";
import { evaluateGate } from "../gate";
import { evaluateSampleIntegrity } from "../sample-integrity";
import type {
  ChronologicalSplitResult,
  CostStressResult,
  CrossAssetResult,
  MetricsSummary,
  SensitivityResult,
  WalkForwardResult,
} from "../types";

function metrics(partial: Partial<MetricsSummary>): MetricsSummary {
  return {
    totalTrades: 50,
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

function segment(
  name: "train" | "validation" | "test",
  m: MetricsSummary,
  trades = 50
) {
  return {
    name,
    start: "2023-01-01T00:00:00.000Z",
    end: "2023-06-01T00:00:00.000Z",
    barCount: 100,
    tradeCount: trades,
    metrics: m,
    resultSource: "REAL_BACKTEST" as const,
  };
}

function goodChrono(): ChronologicalSplitResult {
  const train = metrics({ expectancy: 12, profitFactor: 1.8 });
  const validation = metrics({ expectancy: 10, profitFactor: 1.5 });
  const test = metrics({ expectancy: 9, profitFactor: 1.4 });
  return {
    train: segment("train", train, 60),
    validation: segment("validation", validation, 40),
    test: segment("test", test, 40),
    degradation: computeDegradation(train, validation),
  };
}

function goodWf(): WalkForwardResult {
  return {
    windows: [],
    windowCount: 5,
    profitableWindowPct: 0.8,
    aggregate: {
      avgTrainExpectancy: 10,
      avgValidationExpectancy: 8,
      avgProfitFactorRetention: 0.9,
    },
  };
}

function goodSens(): SensitivityResult {
  return {
    variants: [
      {
        parameterPath: "x",
        originalValue: 30,
        testedValue: 28,
        metrics: metrics({}),
        expectancyDelta: 0,
        positiveExpectancy: true,
      },
      {
        parameterPath: "x",
        originalValue: 30,
        testedValue: 32,
        metrics: metrics({}),
        expectancyDelta: 0,
        positiveExpectancy: true,
      },
    ],
    positiveExpectancyPct: 1,
    originalUnchanged: true,
  };
}

function goodCost(): CostStressResult {
  return {
    base: { commissionPct: 0.05, slippagePct: 0.02 },
    cases: [
      {
        name: "fees_x1_5",
        commissionMultiplier: 1.5,
        slippageMultiplier: 1,
        commissionPct: 0.075,
        slippagePct: 0.02,
        metrics: metrics({ expectancy: 5 }),
        positiveExpectancy: true,
      },
      {
        name: "slippage_x1_5",
        commissionMultiplier: 1,
        slippageMultiplier: 1.5,
        commissionPct: 0.05,
        slippagePct: 0.03,
        metrics: metrics({ expectancy: 4 }),
        positiveExpectancy: true,
      },
      {
        name: "fees_x2",
        commissionMultiplier: 2,
        slippageMultiplier: 1,
        commissionPct: 0.1,
        slippagePct: 0.02,
        metrics: metrics({ expectancy: 2 }),
        positiveExpectancy: true,
      },
    ],
  };
}

const cross: CrossAssetResult = {
  mandatory: false,
  assets: [],
  summary: "0/0",
};

describe("promotion gate", () => {
  const config = mergeValidationConfig();

  it("clearly good fixture passes", () => {
    const chronological = goodChrono();
    const sampleIntegrity = evaluateSampleIntegrity({
      totalTrades: 140,
      validationTrades: 40,
      testTrades: 40,
      walkForwardWindows: 5,
      config,
    });
    const gate = evaluateGate({
      chronological,
      walkForward: goodWf(),
      sensitivity: goodSens(),
      costStress: goodCost(),
      sampleIntegrity,
      crossAsset: cross,
      config,
    });
    expect(gate.status).toBe("pass");
    expect(gate.reasons).toEqual([]);
    expect(gate.checks.validation_expectancy.passed).toBe(true);
    expect(gate.checks.test_expectancy.passed).toBe(true);
  });

  it("clearly bad fixture fails with visible reasons", () => {
    const chronological = goodChrono();
    chronological.validation.metrics.expectancy = -5;
    chronological.validation.metrics.profitFactor = 0.5;
    chronological.test.metrics.expectancy = -3;
    chronological.test.metrics.profitFactor = 0.4;
    chronological.test.metrics.maxDrawdown = 0.5;

    const sampleIntegrity = evaluateSampleIntegrity({
      totalTrades: 140,
      validationTrades: 40,
      testTrades: 40,
      walkForwardWindows: 5,
      config,
    });
    const gate = evaluateGate({
      chronological,
      walkForward: { ...goodWf(), profitableWindowPct: 0.2 },
      sensitivity: { ...goodSens(), positiveExpectancyPct: 0.1 },
      costStress: {
        ...goodCost(),
        cases: goodCost().cases.map((c) => ({
          ...c,
          positiveExpectancy: false,
          metrics: metrics({ expectancy: -1 }),
        })),
      },
      sampleIntegrity,
      crossAsset: cross,
      config,
    });
    expect(gate.status).toBe("fail");
    expect(gate.reasons.length).toBeGreaterThan(0);
    expect(gate.checks.validation_expectancy.passed).toBe(false);
    expect(gate.checks.test_expectancy.passed).toBe(false);
    expect(gate.checks.max_drawdown.passed).toBe(false);
  });

  it("insufficient sample alone → conditional with reason", () => {
    const chronological = goodChrono();
    chronological.train.tradeCount = 5;
    chronological.validation.tradeCount = 2;
    chronological.test.tradeCount = 2;
    const sampleIntegrity = evaluateSampleIntegrity({
      totalTrades: 9,
      validationTrades: 2,
      testTrades: 2,
      walkForwardWindows: 1,
      config,
    });
    expect(sampleIntegrity.flags.length).toBeGreaterThan(0);
    const gate = evaluateGate({
      chronological,
      walkForward: goodWf(),
      sensitivity: goodSens(),
      costStress: goodCost(),
      sampleIntegrity,
      crossAsset: cross,
      config,
    });
    expect(gate.status).toBe("conditional");
    expect(gate.reasons.some((r) => r.includes("sample_"))).toBe(true);
  });
});

describe("degradation ratios", () => {
  it("returns null when denominator invalid", () => {
    const d = computeDegradation(
      metrics({ expectancy: 0, profitFactor: null, sharpeRatio: 0 }),
      metrics({ expectancy: 5, profitFactor: 1.2, sharpeRatio: 1 })
    );
    expect(d.expectancyRetention).toBeNull();
    expect(d.profitFactorRetention).toBeNull();
    expect(d.sharpeRetention).toBeNull();
  });

  it("computes retention = oos / train", () => {
    const d = computeDegradation(
      metrics({ expectancy: 10, profitFactor: 2 }),
      metrics({ expectancy: 5, profitFactor: 1.5 })
    );
    expect(d.expectancyRetention).toBe(0.5);
    expect(d.profitFactorRetention).toBe(0.75);
  });
});
