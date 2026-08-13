import { describe, expect, it, vi } from "vitest";
import {
  createPaperForwardSession,
  startPaperSession,
  abortPaperSession,
} from "../session-service";
import type { PaperForwardPersistence } from "../session-service";
import type { StrategyVersionRow } from "../types";

const snapshot = {
  symbol: "BTCUSDT",
  timeframe: "1h",
  entry_rules: { schema_version: "truth_engine_v1", conditions: [] },
  exit_rules: { take_profit_percent: 4, stop_loss_percent: 2 },
};

const version: StrategyVersionRow = {
  id: "ver-1",
  strategy_id: "strat-1",
  version: 2,
  snapshot_hash: "snap-hash-1",
  strategy_snapshot: snapshot,
};

function makeDb(overrides: Partial<PaperForwardPersistence> = {}) {
  const store: Record<string, any> = {};
  const strategyRow = {
    id: "strat-1",
    entry_rules: { mutable: true },
    exit_rules: { mutable: true },
    status: "draft",
  };

  const db: PaperForwardPersistence = {
    getStrategyVersionById: async (id) =>
      id === version.id ? { ...version } : null,
    getStrategyValidationById: async (id) =>
      id === "val-1"
        ? {
            id: "val-1",
            strategy_id: "strat-1",
            strategy_version: 2,
            strategy_snapshot: snapshot,
            status: "pass",
            gate: { status: "pass" },
            report: {},
            symbol: "BTCUSDT",
            timeframe: "1h",
          }
        : null,
    getResearchRunById: async () => null,
    getStrategy: async () => ({ ...strategyRow }),
    createPaperForwardSession: async (row) => {
      const id = "sess-1";
      store[id] = { id, ...row };
      return store[id];
    },
    getPaperForwardSession: async (id) => {
      if (!store[id]) throw new Error("missing");
      return { ...store[id] };
    },
    updatePaperForwardLifecycle: async (id, updates) => {
      store[id] = { ...store[id], ...updates };
      return { ...store[id] };
    },
    createStrategyAuditLog: async () => ({}),
    ...overrides,
  };
  return { db, store, strategyRow };
}

describe("Phase 4A immutability + session create", () => {
  it("session snapshot equals selected version", async () => {
    const { db, store } = makeDb();
    const { session } = await createPaperForwardSession(db, {
      strategyId: "strat-1",
      strategyVersionId: "ver-1",
      validationId: "val-1",
      createdBy: "tester",
    });
    expect(session.snapshot_hash).toBe(version.snapshot_hash);
    expect(session.strategy_snapshot).toEqual(version.strategy_snapshot);
    expect(store["sess-1"].strategy_snapshot).toEqual(version.strategy_snapshot);
  });

  it("mutable strategy changes after creation do not affect session", async () => {
    const { db, strategyRow } = makeDb();
    const { session } = await createPaperForwardSession(db, {
      strategyId: "strat-1",
      strategyVersionId: "ver-1",
      validationId: "val-1",
    });
    (strategyRow as any).entry_rules = { mutated: true };
    (strategyRow as any).exit_rules = { mutated: true };
    expect(session.strategy_snapshot).toEqual(snapshot);
    expect((session.strategy_snapshot as any).entry_rules.mutable).toBeUndefined();
  });

  it("session provenance fields cannot be changed via lifecycle update API", async () => {
    const { db } = makeDb({
      updatePaperForwardLifecycle: async (_id, updates) => {
        if ("snapshot_hash" in updates) {
          throw new Error("Refusing to mutate immutable paper session field: snapshot_hash");
        }
        return {
          id: "sess-1",
          strategy_id: "strat-1",
          strategy_version_id: "ver-1",
          strategy_version: 2,
          snapshot_hash: "snap-hash-1",
          strategy_snapshot: snapshot,
          validation_id: "val-1",
          lifecycle_status: updates.lifecycle_status,
          symbol: "BTCUSDT",
          timeframe: "1h",
          initial_balance: 10000,
          current_balance: 10000,
          engine_version: "paper_forward_v1_phase4a",
          ...updates,
        };
      },
    });
    await createPaperForwardSession(db, {
      strategyId: "strat-1",
      strategyVersionId: "ver-1",
      validationId: "val-1",
    });
    await expect(
      db.updatePaperForwardLifecycle("sess-1", {
        snapshot_hash: "hacked",
      })
    ).rejects.toThrow(/immutable/i);
  });

  it("active strategy unchanged on create/start/abort", async () => {
    const updateStrategy = vi.fn();
    const { db, strategyRow } = makeDb();
    const before = JSON.stringify(strategyRow);
    const { session } = await createPaperForwardSession(db, {
      strategyId: "strat-1",
      strategyVersionId: "ver-1",
      validationId: "val-1",
    });
    await startPaperSession(db, session.id, "tester");
    await abortPaperSession(db, session.id, "stop test", "tester");
    expect(JSON.stringify(strategyRow)).toBe(before);
    expect(updateStrategy).not.toHaveBeenCalled();
  });

  it("records audit actions", async () => {
    const audits: string[] = [];
    const { db } = makeDb({
      createStrategyAuditLog: async (log) => {
        audits.push(log.action);
        return {};
      },
    });
    const { session } = await createPaperForwardSession(db, {
      strategyId: "strat-1",
      strategyVersionId: "ver-1",
      validationId: "val-1",
    });
    await startPaperSession(db, session.id);
    expect(audits).toContain("PAPER_SESSION_CREATED");
    expect(audits).toContain("PAPER_SESSION_STARTED");
  });
});
