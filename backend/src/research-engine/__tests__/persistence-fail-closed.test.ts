import { describe, expect, it } from "vitest";
import { DatabaseService } from "@/lib/db";
import {
  PHASE3_PERSISTENCE_UNAVAILABLE,
  Phase3PersistenceError,
  isMissingPhase3RelationError,
  throwIfMissingPhase3Relation,
} from "../persistence-errors";
import { runControlledResearch } from "../orchestrator";
import { makeBars, parentStrategyRow } from "./fixtures";
import type { ResearchPersistence } from "../orchestrator";
import type { StructuredMutation } from "../types";

function mockClientMissingTable(tableName: string) {
  const missing = {
    message: `relation "${tableName}" does not exist`,
  };
  const chain = {
    insert: () => chain,
    update: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: async () => ({ data: null, error: missing }),
    single: async () => ({ data: null, error: missing }),
    then: undefined as unknown,
  };
  // listResearchRuns awaits the builder directly after order()
  (chain as { then?: unknown }).then = undefined;
  return {
    from: (table: string) => {
      if (
        table === tableName ||
        tableName === "*" ||
        table.startsWith("strategy_")
      ) {
        const err = {
          message: `relation "${table}" does not exist`,
        };
        const c: Record<string, unknown> = {
          insert: () => c,
          update: () => c,
          select: () => c,
          eq: () => c,
          order: () => c,
          maybeSingle: async () => ({ data: null, error: err }),
          single: async () => ({ data: null, error: err }),
        };
        // Make awaitable for list: order() returns a thenable
        c.order = () => ({
          ...c,
          then: (
            resolve: (v: unknown) => void,
            reject: (e: unknown) => void
          ) => Promise.resolve({ data: null, error: err }).then(resolve, reject),
        });
        return c;
      }
      return chain;
    },
  };
}

function dbWithClient(client: unknown): DatabaseService {
  const db = new DatabaseService("http://localhost", "test-key");
  (db as unknown as { client: unknown }).client = client;
  return db;
}

const softConfig = {
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
};

const mockMutation = async ({
  parent,
}: {
  parent: { exit_rules: unknown };
}): Promise<{
  mutation: StructuredMutation;
  raw: StructuredMutation;
  modelId: string;
}> => {
  const mutation: StructuredMutation = {
    mutation_type: "take_profit_percent",
    path: "exit_rules.take_profit_percent",
    old_value: (parent.exit_rules as { take_profit_percent: number })
      .take_profit_percent,
    new_value: 5,
    hypothesis: "persistence fail test",
  };
  return { mutation, raw: mutation, modelId: "mock" };
};

describe("Phase 3 persistence fail-closed helpers", () => {
  it("detects missing relation errors", () => {
    expect(
      isMissingPhase3RelationError('relation "strategy_versions" does not exist')
    ).toBe(true);
    expect(
      isMissingPhase3RelationError("Could not find the table in schema cache")
    ).toBe(true);
    expect(isMissingPhase3RelationError("duplicate key value")).toBe(false);
  });

  it("throwIfMissingPhase3Relation uses clear migration message", () => {
    expect(() =>
      throwIfMissingPhase3Relation(
        "strategy_versions",
        'relation "strategy_versions" does not exist'
      )
    ).toThrow(Phase3PersistenceError);
    try {
      throwIfMissingPhase3Relation(
        "strategy_research_runs",
        "relation does not exist"
      );
    } catch (e) {
      expect(String(e)).toContain(PHASE3_PERSISTENCE_UNAVAILABLE);
      expect(String(e)).toContain("010");
      expect(String(e)).toContain("011");
    }
  });
});

describe("DatabaseService Phase 3 fail-closed", () => {
  it("missing strategy_versions → createStrategyVersion fails (no synthetic id)", async () => {
    const db = dbWithClient(mockClientMissingTable("strategy_versions"));
    await expect(
      db.createStrategyVersion({
        strategy_id: "s1",
        version: 1,
        source: "research_baseline",
        strategy_snapshot: {},
        snapshot_hash: "abc",
      })
    ).rejects.toThrow(Phase3PersistenceError);
    await expect(
      db.createStrategyVersion({
        strategy_id: "s1",
        version: 1,
        source: "research_baseline",
        strategy_snapshot: {},
        snapshot_hash: "abc",
      })
    ).rejects.toThrow(/migrations 010 and 011/);
  });

  it("missing strategy_research_runs → createResearchRun fails (no fabricated id)", async () => {
    const db = dbWithClient(mockClientMissingTable("strategy_research_runs"));
    await expect(
      db.createResearchRun({ id: "rr1", strategy_id: "s1", status: "running" })
    ).rejects.toThrow(Phase3PersistenceError);
  });

  it("missing strategy_research_experiments → appendResearchExperiment fails", async () => {
    const db = dbWithClient(
      mockClientMissingTable("strategy_research_experiments")
    );
    await expect(
      db.appendResearchExperiment({
        experiment_id: "e1",
        research_run_id: "rr1",
        decision: "REJECT",
      })
    ).rejects.toThrow(Phase3PersistenceError);
  });

  it("missing strategy_versions → getStrategyVersion fails (not silent null)", async () => {
    const db = dbWithClient(mockClientMissingTable("strategy_versions"));
    await expect(db.getStrategyVersion("s1", 1)).rejects.toThrow(
      Phase3PersistenceError
    );
  });

  it("missing strategy_research_runs → listResearchRuns fails (not empty array)", async () => {
    const db = dbWithClient(mockClientMissingTable("strategy_research_runs"));
    await expect(db.listResearchRuns("s1")).rejects.toThrow(
      Phase3PersistenceError
    );
  });

  it("successful persistence path still returns real ids", async () => {
    const db = dbWithClient({
      from: () => {
        const row = { id: "real-uuid-1", version: 1 };
        const c: Record<string, unknown> = {
          insert: () => c,
          update: () => c,
          select: () => c,
          eq: () => c,
          order: () =>
            Promise.resolve({ data: [row], error: null }),
          maybeSingle: async () => ({ data: row, error: null }),
          single: async () => ({ data: row, error: null }),
        };
        return c;
      },
    });
    const created = await db.createStrategyVersion({
      strategy_id: "s1",
      version: 1,
      source: "research_baseline",
      strategy_snapshot: {},
      snapshot_hash: "h",
    });
    expect(created.id).toBe("real-uuid-1");
    const run = await db.createResearchRun({ status: "running" });
    expect(run.id).toBe("real-uuid-1");
    const exp = await db.appendResearchExperiment({ decision: "KEEP" });
    expect(exp.id).toBe("real-uuid-1");
  });
});

describe("research orchestrator persistence integrity", () => {
  it("missing strategy_versions (baseline) → research fails; no success result", async () => {
    const strategy = {
      ...parentStrategyRow,
      entry_rules: JSON.parse(JSON.stringify(parentStrategyRow.entry_rules)),
      exit_rules: JSON.parse(JSON.stringify(parentStrategyRow.exit_rules)),
    };
    const persistence: ResearchPersistence = {
      ensureBaselineVersion: async () => {
        throw new Phase3PersistenceError(
          'Required table "strategy_versions" is missing'
        );
      },
      createResearchRun: async () => ({ id: "should-not-reach" }),
      updateResearchRun: async () => {},
      appendExperiment: async () => {},
      createStrategyVersion: async () => {},
    };

    await expect(
      runControlledResearch({
        strategy,
        persistence,
        request: {
          strategyId: strategy.id,
          bars: makeBars(200),
          config: softConfig,
          proposeMutation: mockMutation,
          runFinalValidation: async () => ({
            validationId: null,
            status: "pass",
            reasons: [],
            score: 1,
            chronologicalTestMetrics: null,
          }),
        },
      })
    ).rejects.toThrow(Phase3PersistenceError);

    expect(strategy.exit_rules).toEqual(parentStrategyRow.exit_rules);
  }, 60_000);

  it("missing strategy_research_runs → research fails", async () => {
    const strategy = {
      ...parentStrategyRow,
      entry_rules: JSON.parse(JSON.stringify(parentStrategyRow.entry_rules)),
      exit_rules: JSON.parse(JSON.stringify(parentStrategyRow.exit_rules)),
    };
    await expect(
      runControlledResearch({
        strategy,
        persistence: {
          ensureBaselineVersion: async () => {},
          createResearchRun: async () => {
            throw new Phase3PersistenceError(
              'Required table "strategy_research_runs" is missing'
            );
          },
          updateResearchRun: async () => {},
          appendExperiment: async () => {},
          createStrategyVersion: async () => {},
        },
        request: {
          strategyId: strategy.id,
          bars: makeBars(200),
          config: softConfig,
          proposeMutation: mockMutation,
          runFinalValidation: async () => ({
            validationId: null,
            status: "pass",
            reasons: [],
            score: 1,
            chronologicalTestMetrics: null,
          }),
        },
      })
    ).rejects.toThrow(/strategy_research_runs|migrations 010/);
  }, 60_000);

  it("experiment insert failure → research fails and marks run failed", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const strategy = {
      ...parentStrategyRow,
      entry_rules: JSON.parse(JSON.stringify(parentStrategyRow.entry_rules)),
      exit_rules: JSON.parse(JSON.stringify(parentStrategyRow.exit_rules)),
    };

    await expect(
      runControlledResearch({
        strategy,
        persistence: {
          ensureBaselineVersion: async () => {},
          createResearchRun: async (row) => ({ id: String(row.id) }),
          updateResearchRun: async (_id, u) => {
            updates.push(u);
          },
          appendExperiment: async () => {
            throw new Phase3PersistenceError(
              'Required table "strategy_research_experiments" is missing'
            );
          },
          createStrategyVersion: async () => {},
        },
        request: {
          strategyId: strategy.id,
          bars: makeBars(200),
          config: softConfig,
          proposeMutation: mockMutation,
          runFinalValidation: async () => ({
            validationId: null,
            status: "pass",
            reasons: [],
            score: 1,
            chronologicalTestMetrics: null,
          }),
        },
      })
    ).rejects.toThrow(Phase3PersistenceError);

    expect(updates.some((u) => u.status === "failed")).toBe(true);
    expect(
      updates.some((u) =>
        JSON.stringify(u.outcome_reasons || []).includes(
          "strategy_research_experiments"
        )
      )
    ).toBe(true);
    expect(strategy.entry_rules).toEqual(parentStrategyRow.entry_rules);
  }, 60_000);

  it("version insert failure → research fails and marks run failed", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const strategy = {
      ...parentStrategyRow,
      entry_rules: JSON.parse(JSON.stringify(parentStrategyRow.entry_rules)),
      exit_rules: JSON.parse(JSON.stringify(parentStrategyRow.exit_rules)),
    };

    await expect(
      runControlledResearch({
        strategy,
        persistence: {
          ensureBaselineVersion: async () => {},
          createResearchRun: async (row) => ({ id: String(row.id) }),
          updateResearchRun: async (_id, u) => {
            updates.push(u);
          },
          appendExperiment: async () => {},
          createStrategyVersion: async () => {
            throw new Phase3PersistenceError(
              "Failed to create strategy version: boom"
            );
          },
        },
        request: {
          strategyId: strategy.id,
          bars: makeBars(200),
          config: softConfig,
          proposeMutation: mockMutation,
          runFinalValidation: async () => ({
            validationId: null,
            status: "pass",
            reasons: [],
            score: 1,
            chronologicalTestMetrics: null,
          }),
        },
      })
    ).rejects.toThrow(/strategy version|migrations 010/);

    expect(updates.some((u) => u.status === "failed")).toBe(true);
    expect(strategy.exit_rules).toEqual(parentStrategyRow.exit_rules);
  }, 60_000);

  it("successful persistence path still completes", async () => {
    const versions: string[] = [];
    const experiments: string[] = [];
    const strategy = {
      ...parentStrategyRow,
      entry_rules: JSON.parse(JSON.stringify(parentStrategyRow.entry_rules)),
      exit_rules: JSON.parse(JSON.stringify(parentStrategyRow.exit_rules)),
    };

    const result = await runControlledResearch({
      strategy,
      persistence: {
        ensureBaselineVersion: async () => {
          versions.push("baseline");
        },
        createResearchRun: async (row) => ({ id: String(row.id) }),
        updateResearchRun: async () => {},
        appendExperiment: async (row) => {
          experiments.push(String(row.experiment_id));
        },
        createStrategyVersion: async (row) => {
          versions.push(`${row.source}:${row.version}`);
        },
      },
      request: {
        strategyId: strategy.id,
        bars: makeBars(200),
        config: softConfig,
        proposeMutation: mockMutation,
        runFinalValidation: async () => ({
          validationId: "v1",
          status: "conditional",
          reasons: [],
          score: 0.5,
          chronologicalTestMetrics: null,
        }),
      },
    });

    expect(result.resultSource).toBe("REAL_RESEARCH");
    expect(versions).toContain("baseline");
    expect(experiments.length).toBeGreaterThan(0);
    expect(result.activation.autoActivated).toBe(false);
    expect(strategy.exit_rules).toEqual(parentStrategyRow.exit_rules);
  }, 60_000);
});

describe("API must not report success after persistence failure", () => {
  it("Phase3PersistenceError message is unsuitable for 200 success payloads", () => {
    const err = new Phase3PersistenceError(
      'Required table "strategy_versions" is missing'
    );
    // Contract used by /api/research/run catch → sendError 503
    expect(err.message).toContain(PHASE3_PERSISTENCE_UNAVAILABLE);
    expect(err.name).toBe("Phase3PersistenceError");
  });
});
