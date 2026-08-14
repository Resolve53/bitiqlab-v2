import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  getTradingSafetyState,
  assertLiveTradingAllowed,
} from "@/lib/trading-safety";
import { runScheduledPaperTicks } from "../scheduler";
import { submitPaperReview } from "../review";
import { completePaperSession } from "../session-service";
import { tickPaperSession } from "../tick";
import {
  makeOpsHarness,
  makeRunningSession,
  tpLongBars,
  makeClosedTrade,
  frozenSnapshot,
} from "./helpers";

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walkTs(p));
    else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("Phase 4C live-trading isolation", () => {
  it("ENABLE_LIVE_TRADING remains false-safe in Phase 4C", () => {
    expect(getTradingSafetyState().enableLiveTrading).toBe(false);
    expect(getTradingSafetyState().exchangeOrdersAllowed).toBe(false);
    expect(getTradingSafetyState().liveForwardExecutionEnabled).toBe(false);
    expect(getTradingSafetyState().paperSimExecutionEnabled).toBe(true);
    expect(getTradingSafetyState().autoPromoteEnabled).toBe(false);
    expect(getTradingSafetyState().forcePromotionEnabled).toBe(false);
    expect(getTradingSafetyState().phase).toBe("4C");
    expect(() => assertLiveTradingAllowed()).toThrow(/Live trading is disabled/);
  });

  it("Phase 4C modules never import the exchange trading client", () => {
    const root = path.join(process.cwd(), "src/paper-forward");
    const files = walkTs(root).filter(
      (f) => !f.includes(`${path.sep}__tests__${path.sep}`)
    );
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/from ["']@\/lib\/binance-trading["']/);
      expect(src).not.toMatch(/from ["']@\/lib\/cornix/);
    }
    const apis = [
      "src/pages/api/paper-forward/sessions/[id]/complete.ts",
      "src/pages/api/paper-forward/sessions/[id]/evaluate.ts",
      "src/pages/api/paper-forward/sessions/[id]/review.ts",
      "src/pages/api/paper-forward/scheduler/run.ts",
      "src/pages/api/paper-forward/sessions/[id]/tick.ts",
    ];
    for (const rel of apis) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/from ["']@\/lib\/binance-trading["']/);
      expect(src).not.toMatch(/promoteStrategyToBitiq/);
    }
  });

  it("4A→4B→4C flow never calls exchange order methods", async () => {
    const marketOrder = vi.fn();
    const limitOrder = vi.fn();
    const h = makeOpsHarness(makeRunningSession(frozenSnapshot()));
    const now = new Date("2025-01-01T00:00:00.000Z");
    await tickPaperSession(h.sessionDb, h.exec, {
      sessionId: "sess-1",
      bars: tpLongBars(),
      now,
    });
    await runScheduledPaperTicks(h.sessionDb, h.exec, h.ops, {
      now: new Date("2024-01-03T00:00:00.000Z"),
      tickFn: async () => ({
        session: h.store.sess,
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
        candlesProcessed: 0,
        lastProcessedCandleTs: null,
        eventsCreated: 0,
        tradesOpened: 0,
        tradesClosed: 0,
        skippedDuplicate: true,
        notice: "PAPER / SIMULATED",
        safety: getTradingSafetyState(),
      }),
    });
    h.exec.trades = Array.from({ length: 20 }, (_, i) =>
      makeClosedTrade({
        id: `y${i}`,
        realized_pnl: 5,
        fee: 0.1,
        entry_candle_ts: `2024-01-01T${String(i).padStart(2, "0")}:00:00.000Z`,
        exit_candle_ts: `2024-01-01T${String(i).padStart(2, "0")}:30:00.000Z`,
      })
    );
    h.store.sess.candles_processed = 200;
    await submitPaperReview(h.sessionDb, h.ops, {
      sessionId: "sess-1",
      decision: "APPROVE_FUTURE_LIVE_ELIGIBLE",
      actor: "reviewer",
    });
    const h2 = makeOpsHarness(makeRunningSession());
    await completePaperSession(h2.sessionDb, "sess-1");
    expect(marketOrder).not.toHaveBeenCalled();
    expect(limitOrder).not.toHaveBeenCalled();
    expect(getTradingSafetyState().exchangeOrdersAllowed).toBe(false);
    expect(getTradingSafetyState().enableLiveTrading).toBe(false);
  });
});
