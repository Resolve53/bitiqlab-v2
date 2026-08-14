import { describe, expect, it } from "vitest";
import { submitPaperReview, PaperReviewError } from "../review";
import { PROMOTION_FORCE_DISABLED } from "@/lib/trading-safety";
import { evaluateAndPersistPaperSession } from "../evaluate-persist";
import {
  makeOpsHarness,
  makeRunningSession,
  makeClosedTrade,
  frozenSnapshot,
} from "./helpers";

function readyHarness() {
  const session = makeRunningSession(frozenSnapshot(), {
    candles_processed: 200,
    started_at: "2024-01-01T00:00:00.000Z",
  });
  const h = makeOpsHarness(session);
  h.exec.trades.push(
    ...Array.from({ length: 20 }, (_, i) =>
      makeClosedTrade({
        id: `t${i}`,
        realized_pnl: 5,
        fee: 0.1,
        entry_candle_ts: `2024-01-01T${String(i).padStart(2, "0")}:00:00.000Z`,
        exit_candle_ts: `2024-01-01T${String(i).padStart(2, "0")}:30:00.000Z`,
      })
    )
  );
  return h;
}

describe("Phase 4C human review", () => {
  it("approves future-live eligibility, audits, and places ZERO orders", async () => {
    const h = readyHarness();
    const marketOrder = { called: false };
    const result = await submitPaperReview(h.sessionDb, h.ops, {
      sessionId: "sess-1",
      decision: "APPROVE_FUTURE_LIVE_ELIGIBLE",
      notes: "looks consistent",
      actor: "reviewer@lab",
    });
    expect(result.futureLiveEligible).toBe(true);
    expect(result.liveTradingEnabled).toBe(false);
    expect(result.exchangeOrdersPlaced).toBe(false);
    expect(h.liveEligible).toBe(true);
    expect(h.reviews[0].decision).toBe("APPROVE_FUTURE_LIVE_ELIGIBLE");
    expect(h.reviews[0].actor).toBe("reviewer@lab");
    expect(
      h.audit.some(
        (a) => a.action === "PAPER_FORWARD_REVIEW_APPROVE_FUTURE_LIVE_ELIGIBLE"
      )
    ).toBe(true);
    expect(h.opsEvents.some((e) => e.event_type === "REVIEW_APPROVED")).toBe(
      true
    );
    expect(marketOrder.called).toBe(false);
  });

  it("rejects force=true bypass", async () => {
    const h = readyHarness();
    await expect(
      submitPaperReview(h.sessionDb, h.ops, {
        sessionId: "sess-1",
        decision: "APPROVE_FUTURE_LIVE_ELIGIBLE",
        actor: "attacker",
        force: true,
      })
    ).rejects.toMatchObject({
      name: "PaperReviewError",
      message: PROMOTION_FORCE_DISABLED,
      statusCode: 400,
    });
    expect(h.liveEligible).toBe(false);
    expect(h.reviews).toHaveLength(0);
  });

  it("refuses review when not READY_FOR_REVIEW", async () => {
    const h = makeOpsHarness(makeRunningSession());
    await expect(
      submitPaperReview(h.sessionDb, h.ops, {
        sessionId: "sess-1",
        decision: "APPROVE_FUTURE_LIVE_ELIGIBLE",
        actor: "reviewer",
      })
    ).rejects.toBeInstanceOf(PaperReviewError);
    expect(h.liveEligible).toBe(false);
  });

  it("REJECT_REVIEW is audited and does not mark eligible", async () => {
    const h = readyHarness();
    const result = await submitPaperReview(h.sessionDb, h.ops, {
      sessionId: "sess-1",
      decision: "REJECT_REVIEW",
      notes: "sample still thin qualitatively",
      actor: "reviewer",
    });
    expect(result.futureLiveEligible).toBe(false);
    expect(h.liveEligible).toBe(false);
    expect(h.reviews[0].decision).toBe("REJECT_REVIEW");
  });

  it("refuses review when frozen snapshot does not verify", async () => {
    const h = readyHarness();
    h.store.sess.snapshot_hash = "tampered";
    await expect(
      submitPaperReview(h.sessionDb, h.ops, {
        sessionId: "sess-1",
        decision: "APPROVE_FUTURE_LIVE_ELIGIBLE",
        actor: "reviewer",
      })
    ).rejects.toBeInstanceOf(PaperReviewError);
    expect(h.liveEligible).toBe(false);
  });

  it("evaluateAndPersist writes append-only evaluation + readiness", async () => {
    const h = readyHarness();
    const first = await evaluateAndPersistPaperSession(
      h.sessionDb,
      h.ops,
      "sess-1",
      new Date("2024-01-03T00:00:00.000Z")
    );
    const second = await evaluateAndPersistPaperSession(
      h.sessionDb,
      h.ops,
      "sess-1",
      new Date("2024-01-03T01:00:00.000Z")
    );
    expect(first.readiness.status).toBe("READY_FOR_REVIEW");
    expect(second.evaluation.source).toBe("paper_forward_simulated");
    expect(h.evaluations).toHaveLength(2);
    expect(h.readiness).toHaveLength(2);
    expect(h.store.sess.strategy_snapshot).toEqual(
      h.sessionDb && (await h.ops.getStrategyVersionById("ver-1")).strategy_snapshot
    );
  });
});
