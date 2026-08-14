import { describe, expect, it } from "vitest";
import { tickPaperSession } from "../tick";
import { hashStrategyRules } from "@/research-engine/experiment-id";
import type { StrategySnapshot } from "@/research-engine/types";
import {
  frozenSnapshot,
  makeBars,
  makeExecDb,
  makeRunningSession,
  makeSessionDb,
} from "./helpers";

/**
 * Fixture integration:
 * frozen strategy → deterministic OHLCV → paper-forward → expected fills/P&L → persistence
 */
describe("paper-forward fixture integration", () => {
  it("frozen long strategy on a known OHLCV path produces expected TP trade and persistence", async () => {
    const snapshot = frozenSnapshot();
    expect(hashStrategyRules(snapshot as StrategySnapshot)).toBe(
      hashStrategyRules(snapshot as StrategySnapshot)
    );

    const session = makeRunningSession(snapshot);
    const { db, store } = makeSessionDb(session);
    const exec = makeExecDb();
    exec.updatePaperForwardExecution = async (_id, updates) => {
      store.sess = { ...store.sess, ...updates } as typeof store.sess;
      return store.sess;
    };

    const bars = makeBars([
      ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
      { close: 101, open: 100, high: 102, low: 99 },
      { close: 99, open: 101, high: 101 * 1.05, low: 99 },
      { close: 90, open: 90, high: 91, low: 89 },
    ]);

    const result = await tickPaperSession(db, exec, {
      sessionId: session.id,
      bars,
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.tradesClosed).toBe(1);
    expect(exec.trades).toHaveLength(1);
    expect(exec.trades[0].status).toBe("closed");
    expect(exec.trades[0].reason).toBe("take_profit");
    expect(Number(exec.trades[0].realized_pnl)).toBeGreaterThan(0);

    const fillEntry = exec.events.find((e) => e.event_type === "fill_entry");
    const fillExit = exec.events.find((e) => e.event_type === "fill_exit");
    expect(fillEntry).toBeTruthy();
    expect(fillExit).toBeTruthy();
    expect(fillEntry.snapshot_hash).toBe(session.snapshot_hash);
    expect(fillExit.engine_version).toMatch(/phase4b/);

    expect(result.metrics.source).toBe("paper_forward_simulated");
    expect(result.metrics.wins).toBe(1);
    expect(result.metrics.totalTrades).toBe(1);
    expect(store.sess.paper_metrics?.totalTrades).toBe(1);
    expect(store.sess.last_processed_candle_ts).toBe(
      bars[bars.length - 1].timestamp.toISOString()
    );
    expect(exec.position).toBeNull();
  });
});
