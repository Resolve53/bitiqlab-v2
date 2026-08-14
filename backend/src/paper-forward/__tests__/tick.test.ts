import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { tickPaperSession, PaperTickError } from "../tick";
import { PaperSnapshotError } from "../snapshot";
import { Phase4PersistenceError } from "../persistence-errors";
import {
  makeExecDb,
  makeRunningSession,
  makeSessionDb,
  tpLongBars,
  frozenSnapshot,
} from "./helpers";
import { PAPER_SIMULATED_NOTICE } from "@/lib/trading-safety";

const now = new Date("2025-01-01T00:00:00.000Z");

describe("tick lifecycle guards", () => {
  it("refuses CREATED sessions", async () => {
    const session = makeRunningSession(frozenSnapshot(), {
      lifecycle_status: "CREATED",
    });
    const { db } = makeSessionDb(session);
    await expect(
      tickPaperSession(db, makeExecDb(), {
        sessionId: session.id,
        bars: tpLongBars(),
        now,
      })
    ).rejects.toThrow(/CREATED/);
  });

  it("refuses PAUSED sessions", async () => {
    const session = makeRunningSession(frozenSnapshot(), {
      lifecycle_status: "PAUSED",
    });
    const { db } = makeSessionDb(session);
    await expect(
      tickPaperSession(db, makeExecDb(), {
        sessionId: session.id,
        bars: tpLongBars(),
        now,
      })
    ).rejects.toThrow(/PAUSED/);
  });

  it("refuses terminal sessions", async () => {
    for (const status of ["COMPLETED", "FAILED", "ABORTED"] as const) {
      const session = makeRunningSession(frozenSnapshot(), {
        lifecycle_status: status,
      });
      const { db } = makeSessionDb(session);
      await expect(
        tickPaperSession(db, makeExecDb(), {
          sessionId: session.id,
          bars: tpLongBars(),
          now,
        })
      ).rejects.toBeInstanceOf(PaperTickError);
    }
  });

  it("FAIL CLOSED on corrupt snapshot and marks FAILED", async () => {
    const session = makeRunningSession(frozenSnapshot(), {
      snapshot_hash: "corrupt",
    });
    const { db, store } = makeSessionDb(session);
    await expect(
      tickPaperSession(db, makeExecDb(), {
        sessionId: session.id,
        bars: tpLongBars(),
        now,
      })
    ).rejects.toBeInstanceOf(PaperSnapshotError);
    expect(store.sess.lifecycle_status).toBe("FAILED");
  });
});

describe("tick processing + idempotency", () => {
  it("processes a RUNNING session and persists simulated trades", async () => {
    const session = makeRunningSession();
    const { db, store } = makeSessionDb(session);
    const exec = makeExecDb();
    exec.updatePaperForwardExecution = async (_id, updates) => {
      store.sess = { ...store.sess, ...updates } as typeof store.sess;
      return store.sess;
    };
    const result = await tickPaperSession(db, exec, {
      sessionId: session.id,
      bars: tpLongBars(),
      now,
    });
    expect(result.notice).toBe(PAPER_SIMULATED_NOTICE);
    expect(result.safety.exchangeOrdersAllowed).toBe(false);
    expect(result.safety.enableLiveTrading).toBe(false);
    expect(result.candlesProcessed).toBeGreaterThan(0);
    expect(result.tradesClosed).toBe(1);
    expect(exec.events.some((e) => e.event_type === "fill_entry")).toBe(true);
    expect(store.sess.last_processed_candle_ts).toBeTruthy();
  });

  it("duplicate candle protection / resume idempotency", async () => {
    const session = makeRunningSession();
    const { db, store } = makeSessionDb(session);
    const exec = makeExecDb();
    exec.updatePaperForwardExecution = async (_id, updates) => {
      store.sess = { ...store.sess, ...updates } as typeof store.sess;
      return store.sess;
    };
    const bars = tpLongBars();
    const first = await tickPaperSession(db, exec, {
      sessionId: session.id,
      bars,
      now,
    });
    const eventCount = exec.events.length;
    const second = await tickPaperSession(db, exec, {
      sessionId: session.id,
      bars,
      now,
    });
    expect(second.candlesProcessed).toBe(0);
    expect(exec.events.length).toBe(eventCount);
    expect(first.metrics.realizedPnl).toBe(second.metrics.realizedPnl);
  });

  it("restart/resume continues from last processed candle", async () => {
    const session = makeRunningSession();
    const { db, store } = makeSessionDb(session);
    const exec = makeExecDb();
    exec.updatePaperForwardExecution = async (_id, updates) => {
      store.sess = { ...store.sess, ...updates } as typeof store.sess;
      return store.sess;
    };
    const bars = tpLongBars();
    const mid = bars.slice(0, 6);
    await tickPaperSession(db, exec, { sessionId: session.id, bars: mid, now });
    const afterFirst = store.sess.last_processed_candle_ts;
    expect(afterFirst).toBeTruthy();
    await tickPaperSession(db, exec, { sessionId: session.id, bars, now });
    expect(
      new Date(store.sess.last_processed_candle_ts!).getTime()
    ).toBeGreaterThan(new Date(afterFirst!).getTime());
  });

  it("persistence failure FAIL CLOSED with no fake success", async () => {
    const session = makeRunningSession();
    const { db } = makeSessionDb(session);
    const exec = makeExecDb();
    exec.failNextInsert = true;
    await expect(
      tickPaperSession(db, exec, {
        sessionId: session.id,
        bars: tpLongBars(),
        now,
      })
    ).rejects.toBeInstanceOf(Phase4PersistenceError);
  });
});

describe("ZERO exchange order calls", () => {
  it("tick module source never imports Binance trading/order APIs", () => {
    const files = [
      "tick.ts",
      "sim-executor.ts",
      "snapshot.ts",
      "closed-candles.ts",
      "paper-metrics.ts",
    ];
    for (const f of files) {
      const src = readFileSync(
        path.join(process.cwd(), "src/paper-forward", f),
        "utf8"
      );
      expect(src).not.toMatch(/from ["']@\/lib\/binance-trading["']/);
      expect(src).not.toMatch(/cornix/i);
    }
  });

  it("running a tick does not call order spies", async () => {
    const marketOrder = vi.fn();
    const limitOrder = vi.fn();
    const session = makeRunningSession();
    const { db, store } = makeSessionDb(session);
    const exec = makeExecDb();
    exec.updatePaperForwardExecution = async (_id, updates) => {
      store.sess = { ...store.sess, ...updates } as typeof store.sess;
      return store.sess;
    };
    await tickPaperSession(db, exec, {
      sessionId: session.id,
      bars: tpLongBars(),
      now,
    });
    expect(marketOrder).not.toHaveBeenCalled();
    expect(limitOrder).not.toHaveBeenCalled();
  });
});
