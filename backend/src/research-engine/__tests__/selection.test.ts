import { describe, expect, it } from "vitest";
import { mergeResearchConfig } from "../config";
import { evaluateSelection } from "../selection-gate";
import { metrics } from "./fixtures";

const config = mergeResearchConfig({
  minimumValidationTrades: 20,
  minValidationExpectancy: 0,
  minValidationProfitFactor: 1.2,
  maxDrawdown: 0.2,
  maxDrawdownIncreaseAbs: 0.05,
  minExpectancyImprovement: 0,
  requireCostStress15Positive: true,
});

const goodRobustness = {
  costStress15: {
    commissionMultiplier: 1.5,
    slippageMultiplier: 1.5,
    metrics: metrics({ expectancy: 5 }),
    positiveExpectancy: true,
  },
};

describe("selection gate", () => {
  it("KEEPs a clearly better validation candidate", () => {
    const result = evaluateSelection({
      baselineTrain: metrics({ expectancy: 8 }),
      baselineValidation: metrics({ expectancy: 5, profitFactor: 1.3 }),
      candidateTrain: metrics({ expectancy: 9 }),
      candidateValidation: metrics({
        expectancy: 8,
        profitFactor: 1.5,
        maxDrawdown: 0.11,
        totalTrades: 40,
      }),
      robustness: goodRobustness,
      config,
      isDuplicate: false,
    });
    expect(result.decision).toBe("KEEP");
    expect(result.reasons).toEqual([]);
  });

  it("REJECTs bad expectancy", () => {
    const result = evaluateSelection({
      baselineTrain: metrics({ expectancy: 8 }),
      baselineValidation: metrics({ expectancy: 5 }),
      candidateTrain: metrics({ expectancy: 1 }),
      candidateValidation: metrics({
        expectancy: -2,
        profitFactor: 1.5,
        totalTrades: 40,
      }),
      robustness: goodRobustness,
      config,
      isDuplicate: false,
    });
    expect(result.decision).toBe("REJECT");
    expect(result.reasons.some((r) => r.includes("validation_expectancy"))).toBe(
      true
    );
  });

  it("REJECTs tiny validation sample", () => {
    const result = evaluateSelection({
      baselineTrain: metrics({}),
      baselineValidation: metrics({ expectancy: 5 }),
      candidateTrain: metrics({}),
      candidateValidation: metrics({
        expectancy: 20,
        profitFactor: 2,
        totalTrades: 3,
      }),
      robustness: goodRobustness,
      config,
      isDuplicate: false,
    });
    expect(result.decision).toBe("REJECT");
    expect(result.checks.validation_sample.passed).toBe(false);
  });

  it("REJECTs higher expectancy with catastrophic DD", () => {
    const result = evaluateSelection({
      baselineTrain: metrics({}),
      baselineValidation: metrics({ expectancy: 5, maxDrawdown: 0.08 }),
      candidateTrain: metrics({}),
      candidateValidation: metrics({
        expectancy: 12,
        profitFactor: 1.5,
        maxDrawdown: 0.25,
        totalTrades: 40,
      }),
      robustness: goodRobustness,
      config,
      isDuplicate: false,
    });
    expect(result.decision).toBe("REJECT");
    expect(
      result.reasons.some(
        (r) =>
          r.includes("no_catastrophic_drawdown") ||
          r.includes("validation_max_drawdown")
      )
    ).toBe(true);
  });

  it("REJECTs TRAIN improvement + VAL degradation", () => {
    const result = evaluateSelection({
      baselineTrain: metrics({ expectancy: 5 }),
      baselineValidation: metrics({ expectancy: 6, profitFactor: 1.4 }),
      candidateTrain: metrics({ expectancy: 20 }),
      candidateValidation: metrics({
        expectancy: 2,
        profitFactor: 1.3,
        totalTrades: 40,
      }),
      robustness: goodRobustness,
      config,
      isDuplicate: false,
    });
    expect(result.decision).toBe("REJECT");
    expect(result.checks.not_train_only_improvement.passed).toBe(false);
  });

  it("REJECTs duplicates", () => {
    const result = evaluateSelection({
      baselineTrain: metrics({}),
      baselineValidation: metrics({ expectancy: 5 }),
      candidateTrain: metrics({}),
      candidateValidation: metrics({ expectancy: 10, profitFactor: 1.5 }),
      robustness: goodRobustness,
      config,
      isDuplicate: true,
      duplicateOf: "abc",
    });
    expect(result.decision).toBe("REJECT");
    expect(result.checks.not_duplicate.passed).toBe(false);
  });

  it("REJECTs cost-stress failure", () => {
    const result = evaluateSelection({
      baselineTrain: metrics({}),
      baselineValidation: metrics({ expectancy: 5 }),
      candidateTrain: metrics({}),
      candidateValidation: metrics({
        expectancy: 10,
        profitFactor: 1.5,
        totalTrades: 40,
      }),
      robustness: {
        costStress15: {
          commissionMultiplier: 1.5,
          slippageMultiplier: 1.5,
          metrics: metrics({ expectancy: -1 }),
          positiveExpectancy: false,
        },
      },
      config,
      isDuplicate: false,
    });
    expect(result.decision).toBe("REJECT");
    expect(result.checks.cost_stress_1_5.passed).toBe(false);
  });
});
