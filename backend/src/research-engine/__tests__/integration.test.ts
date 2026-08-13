import { describe, expect, it, vi } from "vitest";
import { runControlledResearch } from "../orchestrator";
import { hashStrategyRules } from "../experiment-id";
import { makeBars, parentStrategyRow } from "./fixtures";
import type { StructuredMutation } from "../types";

describe("research integration (mocked Claude, fixture OHLCV)", () => {
  it("runs baseline → mutation → TE → KEEP/REJECT → final validation once", async () => {
    const bars = makeBars(360);
    const parentEntry = JSON.stringify(parentStrategyRow.entry_rules);
    const parentExit = JSON.stringify(parentStrategyRow.exit_rules);

    let finalValidationCalls = 0;
    const mutations: StructuredMutation[] = [
      {
        mutation_type: "take_profit_percent",
        path: "exit_rules.take_profit_percent",
        old_value: 4,
        new_value: 5,
        hypothesis: "Slightly wider TP",
      },
    ];
    let call = 0;

    const result = await runControlledResearch({
      strategy: { ...parentStrategyRow },
      request: {
        strategyId: parentStrategyRow.id,
        bars,
        skipPersistence: true,
        config: {
          maxGenerations: 2,
          maxCandidates: 2,
          maxClaudeCalls: 2,
          minimumValidationTrades: 1,
          minValidationProfitFactor: 0,
          minValidationExpectancy: -1e9,
          maxDrawdown: 1,
          maxDrawdownIncreaseAbs: 1,
          minExpectancyImprovement: -1e9,
          requireCostStress15Positive: false,
          maxConsecutiveNoImprovement: 5,
        },
        proposeMutation: async ({ trainDiagnostics }) => {
          expect(trainDiagnostics.segment).toBe("train");
          const m = mutations[Math.min(call, mutations.length - 1)];
          call += 1;
          // Adjust old_value dynamically from parent baseline after KEEP
          return {
            mutation: m,
            raw: m,
            modelId: "mock-model",
          };
        },
        runFinalValidation: async () => {
          finalValidationCalls += 1;
          return {
            validationId: "val-fixture",
            status: "conditional" as const,
            reasons: ["fixture_final"],
            score: 0.5,
            chronologicalTestMetrics: {
              totalTrades: 5,
              winRate: 0.5,
              expectancy: 1,
              profitFactor: 1.1,
              totalReturn: 0.01,
              maxDrawdown: 0.05,
              sharpeRatio: 0.5,
              netProfit: 10,
            },
          };
        },
      },
    });

    expect(result.resultSource).toBe("REAL_RESEARCH");
    expect(result.experiments.length).toBeGreaterThan(0);
    expect(result.activation.autoActivated).toBe(false);
    expect(result.activation.autoPaperTrading).toBe(false);
    expect(result.dataset.testBars).toBeGreaterThan(0);

    // Parent production rules unchanged
    expect(JSON.stringify(parentStrategyRow.entry_rules)).toBe(parentEntry);
    expect(JSON.stringify(parentStrategyRow.exit_rules)).toBe(parentExit);

    // Final validation only if KEEP occurred
    const keeps = result.experiments.filter((e) => e.decision === "KEEP");
    if (keeps.length > 0) {
      expect(finalValidationCalls).toBe(1);
      expect(result.finalValidation?.status).toBe("conditional");
    } else {
      expect(finalValidationCalls).toBe(0);
      expect(result.finalValidation).toBeNull();
    }

    // No experiment used TEST in provenance
    for (const exp of result.experiments) {
      expect(exp.provenance?.testUsed ?? false).toBe(false);
      expect(JSON.stringify(exp)).not.toMatch(/"segment":"test"/);
    }
  }, 60_000);

  it("does not call final validation again after TEST fail (no remutation)", async () => {
    const bars = makeBars(240);
    let finalCalls = 0;
    let proposeCalls = 0;

    const result = await runControlledResearch({
      strategy: { ...parentStrategyRow },
      request: {
        strategyId: parentStrategyRow.id,
        bars,
        skipPersistence: true,
        config: {
          maxGenerations: 3,
          maxCandidates: 3,
          maxClaudeCalls: 3,
          minimumValidationTrades: 1,
          minValidationProfitFactor: 0,
          minValidationExpectancy: -1e9,
          maxDrawdown: 1,
          maxDrawdownIncreaseAbs: 1,
          minExpectancyImprovement: -1e9,
          requireCostStress15Positive: false,
        },
        proposeMutation: async ({ parent }) => {
          proposeCalls += 1;
          const sl = (parent.exit_rules as { stop_loss_percent: number })
            .stop_loss_percent;
          const mutation: StructuredMutation = {
            mutation_type: "stop_loss_percent",
            path: "exit_rules.stop_loss_percent",
            old_value: sl,
            new_value: sl + 0.25 * proposeCalls,
            hypothesis: `Adjust SL attempt ${proposeCalls}`,
          };
          return { mutation, raw: mutation, modelId: "mock" };
        },
        runFinalValidation: async () => {
          finalCalls += 1;
          return {
            validationId: null,
            status: "fail" as const,
            reasons: ["test_expectancy: fail"],
            score: 0,
            chronologicalTestMetrics: {
              totalTrades: 1,
              winRate: 0,
              expectancy: -1,
              profitFactor: 0.5,
              totalReturn: -0.1,
              maxDrawdown: 0.3,
              sharpeRatio: null,
              netProfit: -10,
            },
          };
        },
      },
    });

    if (result.champion.snapshot) {
      expect(finalCalls).toBe(1);
      expect(result.outcome).toBe("failed_final_confirmation");
      // No additional propose after final fail
      const proposesBeforeFinal = proposeCalls;
      expect(proposesBeforeFinal).toBeGreaterThan(0);
      // Loop already ended — proposeCalls must equal experiments count
      expect(proposeCalls).toBe(result.experiments.length);
    }
  }, 60_000);

  it("respects maxCandidates / maxClaudeCalls", async () => {
    const bars = makeBars(200);
    let calls = 0;
    const result = await runControlledResearch({
      strategy: { ...parentStrategyRow },
      request: {
        strategyId: parentStrategyRow.id,
        bars,
        skipPersistence: true,
        config: {
          maxGenerations: 10,
          maxCandidates: 2,
          maxClaudeCalls: 2,
          minimumValidationTrades: 1,
          minValidationProfitFactor: 0,
          minValidationExpectancy: -1e9,
          maxDrawdown: 1,
          maxDrawdownIncreaseAbs: 1,
          minExpectancyImprovement: -1e9,
          requireCostStress15Positive: false,
        },
        proposeMutation: async ({ parent }) => {
          calls += 1;
          const tp = (parent.exit_rules as { take_profit_percent: number })
            .take_profit_percent;
          const mutation: StructuredMutation = {
            mutation_type: "take_profit_percent",
            path: "exit_rules.take_profit_percent",
            old_value: tp,
            new_value: tp + calls,
            hypothesis: "limit test",
          };
          return { mutation, raw: mutation, modelId: "mock" };
        },
        runFinalValidation: async () => ({
          validationId: null,
          status: "pass" as const,
          reasons: [],
          score: 1,
          chronologicalTestMetrics: null,
        }),
      },
    });
    expect(calls).toBeLessThanOrEqual(2);
    expect(result.experiments.length).toBeLessThanOrEqual(2);
  }, 60_000);

  it("deterministic hashes for same snapshot", () => {
    const a = {
      id: "x",
      name: "n",
      symbol: "BTCUSDT",
      timeframe: "1h",
      market_type: "spot",
      entry_rules: { a: 1, b: 2 },
      exit_rules: { z: 9, y: 8 },
      version: 1,
    };
    const b = {
      ...a,
      entry_rules: { b: 2, a: 1 },
      exit_rules: { y: 8, z: 9 },
    };
    expect(hashStrategyRules(a)).toBe(hashStrategyRules(b));
  });

  it("does not import ParameterOptimizer / legacy autoresearch optimizer", async () => {
    const mod = await import("../index");
    expect(mod).toHaveProperty("runControlledResearch");
    expect(mod).not.toHaveProperty("ParameterOptimizer");
    expect(mod).not.toHaveProperty("AutoresearchOptimizer");
  });
});

describe("versioning behavior (in-memory)", () => {
  it("KEEP does not overwrite parent strategy object rules", async () => {
    const bars = makeBars(200);
    const strategy = {
      ...parentStrategyRow,
      entry_rules: JSON.parse(JSON.stringify(parentStrategyRow.entry_rules)),
      exit_rules: JSON.parse(JSON.stringify(parentStrategyRow.exit_rules)),
    };
    const versions: Array<{ version: number; source: string }> = [];

    await runControlledResearch({
      strategy,
      persistence: {
        ensureBaselineVersion: async () => {
          versions.push({ version: 1, source: "research_baseline" });
        },
        createResearchRun: async (row) => ({ id: String(row.id) }),
        updateResearchRun: async () => {},
        appendExperiment: async () => {},
        createStrategyVersion: async (row) => {
          versions.push({ version: row.version, source: row.source });
        },
      },
      request: {
        strategyId: strategy.id,
        bars,
        config: {
          maxGenerations: 1,
          maxCandidates: 1,
          maxClaudeCalls: 1,
          minimumValidationTrades: 1,
          minValidationProfitFactor: 0,
          minValidationExpectancy: -1e9,
          maxDrawdown: 1,
          maxDrawdownIncreaseAbs: 1,
          minExpectancyImprovement: -1e9,
          requireCostStress15Positive: false,
        },
        proposeMutation: async ({ parent }) => {
          const mutation: StructuredMutation = {
            mutation_type: "take_profit_percent",
            path: "exit_rules.take_profit_percent",
            old_value: (parent.exit_rules as { take_profit_percent: number })
              .take_profit_percent,
            new_value: 6,
            hypothesis: "versioning test",
          };
          return { mutation, raw: mutation, modelId: "mock" };
        },
        runFinalValidation: async () => ({
          validationId: null,
          status: "pass",
          reasons: [],
          score: 1,
          chronologicalTestMetrics: null,
        }),
      },
    });

    expect(strategy.exit_rules).toEqual(parentStrategyRow.exit_rules);
    expect(versions.some((v) => v.source === "research_baseline")).toBe(true);
  }, 60_000);
});
