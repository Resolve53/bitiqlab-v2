import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  assertLiveTradingAllowed,
  assertNoExchangeOrdersInPhase4A,
  getTradingSafetyState,
  isLiveTradingEnabled,
  isPaperTradingEnabled,
  PAPER_FORWARD_FEATURE_DISABLED,
} from "@/lib/trading-safety";
import { createPaperForwardSession } from "../session-service";
import type { PaperForwardPersistence } from "../session-service";
import { DatabaseService } from "@/lib/db";
import { Phase4PersistenceError } from "../persistence-errors";

describe("Phase 4A trading safety flags", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("ENABLE_LIVE_TRADING defaults false and assert always fails", () => {
    delete process.env.ENABLE_LIVE_TRADING;
    expect(isLiveTradingEnabled()).toBe(false);
    expect(getTradingSafetyState().enableLiveTrading).toBe(false);
    expect(getTradingSafetyState().exchangeOrdersAllowed).toBe(false);
    expect(() => assertLiveTradingAllowed()).toThrow(/Live trading is disabled/);
    expect(() => assertNoExchangeOrdersInPhase4A()).toThrow(
      /Legacy paper execution is disabled/
    );
  });

  it("ENABLE_PAPER_TRADING=false blocks session creation", async () => {
    process.env.ENABLE_PAPER_TRADING = "false";
    expect(isPaperTradingEnabled()).toBe(false);
    const db = {} as PaperForwardPersistence;
    await expect(
      createPaperForwardSession(db, {
        strategyId: "s",
        strategyVersionId: "v",
        validationId: "val",
      })
    ).rejects.toThrow(PAPER_FORWARD_FEATURE_DISABLED);
  });
});

describe("Phase 4A persistence fail-closed", () => {
  it("missing migration columns → fail closed, no fake IDs", async () => {
    const db = new DatabaseService("http://localhost", "test-key");
    const missing = {
      message: 'column "lifecycle_status" does not exist',
    };
    (db as any).client = {
      from: () => {
        const c: any = {
          insert: () => c,
          update: () => c,
          select: () => c,
          eq: () => c,
          single: async () => ({ data: null, error: missing }),
          maybeSingle: async () => ({ data: null, error: missing }),
        };
        return c;
      },
    };

    await expect(
      db.createPaperForwardSession({
        strategy_id: "s",
        lifecycle_status: "CREATED",
        strategy_version_id: "v",
        snapshot_hash: "h",
        initial_balance: 1000,
      })
    ).rejects.toBeInstanceOf(Phase4PersistenceError);

    await expect(
      db.createPaperForwardSession({
        strategy_id: "s",
        lifecycle_status: "CREATED",
        strategy_version_id: "v",
        snapshot_hash: "h",
        initial_balance: 1000,
      })
    ).rejects.not.toMatchObject({ id: expect.anything() });
  });

  it("insert returning no id → fail", async () => {
    const db = new DatabaseService("http://localhost", "test-key");
    (db as any).client = {
      from: () => {
        const c: any = {
          insert: () => c,
          select: () => c,
          single: async () => ({
            data: { lifecycle_status: "CREATED", strategy_version_id: "v", snapshot_hash: "h" },
            error: null,
          }),
        };
        return c;
      },
    };
    await expect(
      db.createPaperForwardSession({ strategy_id: "s" })
    ).rejects.toThrow(/no persisted id/i);
  });

  it("refuses provenance mutation on lifecycle update", async () => {
    const db = new DatabaseService("http://localhost", "test-key");
    await expect(
      db.updatePaperForwardLifecycle("sess", {
        snapshot_hash: "evil",
      })
    ).rejects.toThrow(/immutable/i);
  });

  it("partial lifecycle update without id → fail", async () => {
    const db = new DatabaseService("http://localhost", "test-key");
    (db as any).client = {
      from: () => {
        const c: any = {
          update: () => c,
          eq: () => c,
          select: () => c,
          single: async () => ({ data: { lifecycle_status: "RUNNING" }, error: null }),
        };
        return c;
      },
    };
    await expect(
      db.updatePaperForwardLifecycle("sess", { lifecycle_status: "RUNNING" })
    ).rejects.toThrow(/no persisted id/i);
  });
});

describe("Phase 4A Binance order spies on quarantined paths", () => {
  it("execute-signal / webhook / monitor handlers do not call marketOrder", async () => {
    const marketOrder = vi.fn();
    const limitOrder = vi.fn();
    vi.doMock("@/lib/binance-trading", () => ({
      getTradingClient: () => ({ marketOrder, limitOrder }),
      BinanceTradingClient: class {
        marketOrder = marketOrder;
        limitOrder = limitOrder;
      },
    }));

    const handlers = [
      (await import("@/pages/api/paper-trading/monitor")).default,
      (await import("@/pages/api/paper-trading/execute-signal")).default,
      (await import("@/pages/api/paper-trading/tradingview-webhook")).default,
    ];

    for (const handler of handlers) {
      const req: any = {
        method: "POST",
        body: { session_id: "s", signal: "BUY", symbol: "BTCUSDT", auto_trade: true },
        headers: {},
        query: {},
        url: "/",
      };
      const res: any = {
        setHeader: () => res,
        status: () => res,
        json: () => res,
        end: () => res,
      };
      await handler(req, res);
    }

    expect(marketOrder).not.toHaveBeenCalled();
    expect(limitOrder).not.toHaveBeenCalled();
  });
});
