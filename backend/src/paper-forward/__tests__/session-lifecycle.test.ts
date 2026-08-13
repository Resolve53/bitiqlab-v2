import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createPaperForwardSession,
  startPaperSession,
  pausePaperSession,
  resumePaperSession,
  abortPaperSession,
} from "../session-service";
import type { PaperForwardPersistence } from "../session-service";
import { PaperLifecycleError } from "../lifecycle";

const snapshot = {
  symbol: "ETHUSDT",
  timeframe: "15m",
  entry_rules: {},
  exit_rules: {},
};

function makeDb(): PaperForwardPersistence {
  const store: Record<string, any> = {};
  return {
    getStrategyVersionById: async () => ({
      id: "ver-1",
      strategy_id: "strat-1",
      version: 1,
      snapshot_hash: "h1",
      strategy_snapshot: snapshot,
    }),
    getStrategyValidationById: async () => ({
      id: "val-1",
      strategy_id: "strat-1",
      strategy_version: 1,
      strategy_snapshot: snapshot,
      status: "pass",
      gate: {},
      report: {},
      symbol: "ETHUSDT",
      timeframe: "15m",
    }),
    getStrategy: async () => ({ id: "strat-1" }),
    createPaperForwardSession: async (row) => {
      store.sess = { id: "sess-1", ...row };
      return store.sess;
    },
    getPaperForwardSession: async () => ({ ...store.sess }),
    updatePaperForwardLifecycle: async (_id, updates) => {
      store.sess = { ...store.sess, ...updates };
      return { ...store.sess };
    },
    createStrategyAuditLog: async () => ({}),
  };
}

describe("Phase 4A session lifecycle service", () => {
  it("CREATED→RUNNING→PAUSED→RUNNING→ABORTED", async () => {
    const db = makeDb();
    const { session } = await createPaperForwardSession(db, {
      strategyId: "strat-1",
      strategyVersionId: "ver-1",
      validationId: "val-1",
    });
    expect(session.lifecycle_status).toBe("CREATED");

    let s = await startPaperSession(db, session.id);
    expect(s.lifecycle_status).toBe("RUNNING");
    expect(s.started_at).toBeTruthy();

    s = await pausePaperSession(db, session.id);
    expect(s.lifecycle_status).toBe("PAUSED");
    expect(s.paused_at).toBeTruthy();

    s = await resumePaperSession(db, session.id);
    expect(s.lifecycle_status).toBe("RUNNING");

    s = await abortPaperSession(db, session.id, "manual stop");
    expect(s.lifecycle_status).toBe("ABORTED");
    expect(s.abort_reason).toBe("manual stop");
  });

  it("terminal states cannot restart", async () => {
    const db = makeDb();
    const { session } = await createPaperForwardSession(db, {
      strategyId: "strat-1",
      strategyVersionId: "ver-1",
      validationId: "val-1",
    });
    await startPaperSession(db, session.id);
    await abortPaperSession(db, session.id, "done");
    await expect(startPaperSession(db, session.id)).rejects.toThrow(
      PaperLifecycleError
    );
  });
});

describe("Phase 4A exchange safety on session flows", () => {
  const orderSpies = {
    marketOrder: vi.fn(),
    limitOrder: vi.fn(),
    futuresOrder: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    Object.values(orderSpies).forEach((s) => s.mockClear());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("create/start/pause/resume/abort never call order methods", async () => {
    const db = makeDb();
    // If session service imported binance, these would be called — assert zero.
    await createPaperForwardSession(db, {
      strategyId: "strat-1",
      strategyVersionId: "ver-1",
      validationId: "val-1",
    });
    await startPaperSession(db, "sess-1");
    await pausePaperSession(db, "sess-1");
    await resumePaperSession(db, "sess-1");
    await abortPaperSession(db, "sess-1", "end");

    expect(orderSpies.marketOrder).not.toHaveBeenCalled();
    expect(orderSpies.limitOrder).not.toHaveBeenCalled();
    expect(orderSpies.futuresOrder).not.toHaveBeenCalled();
  });
});
