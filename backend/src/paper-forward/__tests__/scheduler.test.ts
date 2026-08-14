import { describe, expect, it } from "vitest";
import { runScheduledPaperTicks } from "../scheduler";
import { tickPaperSession } from "../tick";
import { getTradingSafetyState } from "@/lib/trading-safety";
import {
  makeOpsHarness,
  makeRunningSession,
  tpLongBars,
  frozenSnapshot,
} from "./helpers";
import type { TickResult } from "../tick";

function fakeTickResult(
  session: ReturnType<typeof makeRunningSession>,
  extra: Partial<TickResult> = {}
): TickResult {
  return {
    session,
    metrics: {
      startingCapital: 10_000,
      currentEquity: 10_000,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      maxDrawdown: 0,
      feesPaid: 0,
      lastProcessedCandleTs: null,
      source: "paper_forward_simulated",
    },
    candlesProcessed: 3,
    lastProcessedCandleTs: "2024-01-01T01:00:00.000Z",
    eventsCreated: 3,
    tradesOpened: 0,
    tradesClosed: 0,
    skippedDuplicate: false,
    notice: "PAPER / SIMULATED",
    safety: getTradingSafetyState(),
    ...extra,
  };
}

describe("Phase 4C scheduler", () => {
  it("processes RUNNING sessions with lock and evaluates", async () => {
    const h = makeOpsHarness(makeRunningSession());
    const result = await runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      now: new Date("2024-01-02T00:00:00.000Z"),
      tickFn: async () => fakeTickResult(h.store.sess),
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("ticked");
    expect(result.results[0].candlesProcessed).toBe(3);
    expect(h.store.sess.last_tick_at).toBeTruthy();
    expect(h.store.sess.candles_processed).toBe(3);
    expect(h.evaluations.length).toBe(1);
    expect(h.readiness.length).toBe(1);
    expect(h.store.sess.tick_lock_token).toBeNull();
    expect(result.safety.enableLiveTrading).toBe(false);
    expect(result.safety.exchangeOrdersAllowed).toBe(false);
  });

  it("tick idempotency: second scheduler run with duplicate candles is skipped", async () => {
    const session = makeRunningSession();
    const h = makeOpsHarness(session);
    h.exec.updatePaperForwardExecution = async (_id, updates) => {
      h.store.sess = { ...h.store.sess, ...updates };
      return h.store.sess;
    };
    const now = new Date("2025-01-01T00:00:00.000Z");
    const bars = tpLongBars();
    const first = await runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      now,
      tickFn: (s, e, input) => tickPaperSession(s, e, { ...input, bars, now }),
    });
    const eventCount = h.exec.events.length;
    const second = await runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      now,
      tickFn: (s, e, input) => tickPaperSession(s, e, { ...input, bars, now }),
    });
    expect(first.results[0].status).toBe("ticked");
    expect(second.results[0].candlesProcessed).toBe(0);
    expect(h.exec.events.length).toBe(eventCount);
  });

  it("concurrency: second lock acquire fails while lease is held", async () => {
    const h = makeOpsHarness(makeRunningSession());
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const p1 = runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      tickFn: async () => {
        await gate;
        return fakeTickResult(h.store.sess);
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    const p2 = runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      tickFn: async () => fakeTickResult(h.store.sess),
    });
    const second = await p2;
    expect(second.results[0].status).toBe("locked");
    release();
    const first = await p1;
    expect(first.results[0].status).toBe("ticked");
  });

  it("restart: expired lease is stealable", async () => {
    const h = makeOpsHarness(makeRunningSession());
    h.lock.token = "old";
    h.lock.until = Date.now() - 1000;
    h.store.sess.tick_lock_token = "old";
    h.store.sess.tick_lock_until = new Date(Date.now() - 1000).toISOString();
    const result = await runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      tickFn: async () => fakeTickResult(h.store.sess),
    });
    expect(result.results[0].status).toBe("ticked");
  });

  it("failure/retry then FAIL CLOSED at maxTickErrors", async () => {
    const h = makeOpsHarness(makeRunningSession());
    const run = () =>
      runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
        config: { maxTickErrors: 2 },
        tickFn: async () => {
          throw new Error("simulated tick failure");
        },
      });
    const first = await run();
    expect(first.results[0].status).toBe("error");
    expect(h.store.sess.tick_error_count).toBe(1);
    expect(h.store.sess.lifecycle_status).toBe("RUNNING");
    const second = await run();
    expect(second.results[0].status).toBe("failed");
    expect(h.store.sess.lifecycle_status).toBe("FAILED");
  });

  it("stale detection does not auto-fail", async () => {
    const h = makeOpsHarness(
      makeRunningSession(frozenSnapshot(), {
        last_tick_at: "2020-01-01T00:00:00.000Z",
        started_at: "2020-01-01T00:00:00.000Z",
      })
    );
    const result = await runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      now: new Date("2026-01-01T00:00:00.000Z"),
      config: { staleAfterHours: 6 },
      tickFn: async () => fakeTickResult(h.store.sess),
    });
    expect(result.results[0].stale).toBe(true);
    expect(h.opsEvents.some((e) => e.event_type === "STALE_DETECTED")).toBe(
      true
    );
    expect(h.store.sess.lifecycle_status).toBe("RUNNING");
  });

  it("skips non-RUNNING sessions", async () => {
    const h = makeOpsHarness(
      makeRunningSession(undefined, { lifecycle_status: "PAUSED" })
    );
    const result = await runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      tickFn: async () => fakeTickResult(h.store.sess),
    });
    expect(result.results).toEqual([]);
  });
});
