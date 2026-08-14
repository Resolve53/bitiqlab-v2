/**
 * Human review of READY_FOR_REVIEW paper sessions.
 *
 * Approval marks the immutable strategy version eligible for a FUTURE live phase.
 * It does not place exchange orders, enable ENABLE_LIVE_TRADING,
 * or promote to Bitiq. force=true is always rejected.
 */

import { PROMOTION_FORCE_DISABLED } from "@/lib/trading-safety";
import { PAPER_FORWARD_OPS_ENGINE_VERSION } from "./readiness-config";
import { getPaperSession, type PaperForwardPersistence } from "./session-service";
import { verifyImmutableSnapshot } from "./snapshot";
import { evaluateAndPersistPaperSession } from "./evaluate-persist";
import { insertPaperOpsEvent } from "./session-ops";
import type { PaperOpsPersistence } from "./ops-persistence";
import type { PaperReviewDecision } from "./types";

export class PaperReviewError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PaperReviewError";
    this.statusCode = statusCode;
  }
}

export const REVIEW_DECISIONS: ReadonlyArray<PaperReviewDecision> = [
  "APPROVE_FUTURE_LIVE_ELIGIBLE",
  "REJECT_REVIEW",
];

export interface SubmitPaperReviewInput {
  sessionId: string;
  decision: string;
  notes?: string | null;
  actor: string;
  force?: unknown;
}

export async function submitPaperReview(
  sessionDb: PaperForwardPersistence,
  ops: PaperOpsPersistence,
  input: SubmitPaperReviewInput
) {
  if (input.force === true || input.force === "true" || input.force === 1) {
    throw new PaperReviewError(PROMOTION_FORCE_DISABLED, 400);
  }

  if (!REVIEW_DECISIONS.includes(input.decision as PaperReviewDecision)) {
    throw new PaperReviewError(
      `Invalid review decision. Allowed: ${REVIEW_DECISIONS.join(", ")}`,
      400
    );
  }
  const decision = input.decision as PaperReviewDecision;

  const session = await getPaperSession(sessionDb, input.sessionId);
  try {
    verifyImmutableSnapshot(session);
  } catch (err) {
    throw new PaperReviewError(
      err instanceof Error ? err.message : "Snapshot integrity failed",
      409
    );
  }

  const evaluated = await evaluateAndPersistPaperSession(
    sessionDb,
    ops,
    input.sessionId
  );

  if (evaluated.readiness.status !== "READY_FOR_REVIEW") {
    throw new PaperReviewError(
      `Human review is only available when readiness is READY_FOR_REVIEW (got ${evaluated.readiness.status})`,
      409
    );
  }

  const notes = input.notes?.trim() || null;

  if (decision === "APPROVE_FUTURE_LIVE_ELIGIBLE") {
    const version = await ops.getStrategyVersionById(session.strategy_version_id);
    if (!version) {
      throw new PaperReviewError("Strategy version not found", 404);
    }
    if (version.snapshot_hash !== session.snapshot_hash) {
      throw new PaperReviewError(
        "Version snapshot_hash does not match frozen session snapshot — refusing review",
        409
      );
    }
    await ops.markStrategyVersionLivePhaseEligible(
      session.strategy_version_id,
      input.actor,
      notes
    );
  }

  const review = await ops.insertPaperForwardReview({
    session_id: session.id,
    strategy_id: session.strategy_id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    decision,
    notes,
    actor: input.actor,
    readiness_status: evaluated.readiness.status,
    engine_version: PAPER_FORWARD_OPS_ENGINE_VERSION,
  });

  await insertPaperOpsEvent(ops, {
    session_id: session.id,
    event_type:
      decision === "APPROVE_FUTURE_LIVE_ELIGIBLE"
        ? "REVIEW_APPROVED"
        : "REVIEW_REJECTED",
    actor: input.actor,
    strategy_id: session.strategy_id,
    strategy_version_id: session.strategy_version_id,
    snapshot_hash: session.snapshot_hash,
    payload: {
      decision,
      notes,
      liveTradingEnabled: false,
      exchangeOrdersPlaced: false,
    },
  });

  await ops.createStrategyAuditLog({
    strategy_id: session.strategy_id,
    action:
      decision === "APPROVE_FUTURE_LIVE_ELIGIBLE"
        ? "PAPER_FORWARD_REVIEW_APPROVE_FUTURE_LIVE_ELIGIBLE"
        : "PAPER_FORWARD_REVIEW_REJECT",
    new_values: {
      sessionId: session.id,
      strategyVersionId: session.strategy_version_id,
      snapshotHash: session.snapshot_hash,
      decision,
      notes,
      readiness: evaluated.readiness.status,
      liveTradingEnabled: false,
      exchangeOrdersPlaced: false,
      engine: PAPER_FORWARD_OPS_ENGINE_VERSION,
    },
    changed_by: input.actor,
  });

  return {
    reviewId: review.id,
    decision,
    session: evaluated.session,
    readiness: evaluated.readiness,
    evaluation: evaluated.evaluation,
    futureLiveEligible: decision === "APPROVE_FUTURE_LIVE_ELIGIBLE",
    liveTradingEnabled: false,
    exchangeOrdersPlaced: false,
    notice:
      "PAPER / SIMULATED review only. Approval does not place exchange orders or enable live trading.",
  };
}
