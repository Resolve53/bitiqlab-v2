/**
 * GET /api/paper-forward/sessions/[id]
 * Immutable session + simulated paper metrics/trades + 4C evaluation/readiness/comparison.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import {
  getPaperSession,
  getTradingSafetyState,
  Phase4PersistenceError,
  PAPER_SIMULATED_NOTICE,
  evaluatePaperForward,
  evaluatePaperReadiness,
  buildHistoricalVsForwardComparison,
} from "@/paper-forward";
import { verifyImmutableSnapshot } from "@/paper-forward/snapshot";
import {
  asPaperExecutionPersistence,
  asPaperForwardPersistence,
  asPaperOpsPersistence,
} from "@/paper-forward/db-adapter";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const id = String(req.query.id || "");
  if (!id) return sendError(res, "Missing session id", 400, req);

  try {
    const db = getDB();
    const sessionDb = asPaperForwardPersistence(db);
    const exec = asPaperExecutionPersistence(db);
    const ops = asPaperOpsPersistence(db);
    const session = await getPaperSession(sessionDb, id);
    const [trades, events, position, reviews, opsEvents] = await Promise.all([
      exec.listPaperForwardTrades(id).catch(() => []),
      exec.listPaperForwardEvents(id, 50).catch(() => []),
      exec.getPaperForwardPosition(id).catch(() => null),
      ops.listPaperForwardReviews(id).catch(() => []),
      ops.listPaperForwardOpsEvents(id, 50).catch(() => []),
    ]);

    const storedEval = await ops
      .getLatestPaperForwardEvaluation(id)
      .catch(() => null);
    const storedReady = await ops
      .getLatestPaperForwardReadiness(id)
      .catch(() => null);

    let candles = session.candles_processed ?? 0;
    if (!candles) {
      candles = await ops.countPaperForwardCandleEvents(id).catch(() => 0);
    }

    const evaluation =
      storedEval?.evaluation ??
      evaluatePaperForward({
        session,
        trades,
        closedCandlesProcessed: candles,
      });

    let snapshotOk = true;
    let snapshotError: string | undefined;
    try {
      verifyImmutableSnapshot(session);
    } catch (err) {
      snapshotOk = false;
      snapshotError = err instanceof Error ? err.message : String(err);
    }

    const validation = session.validation_id
      ? await ops.getStrategyValidationById(session.validation_id).catch(() => null)
      : null;
    const validationStatus =
      validation?.status === "pass" ||
      validation?.status === "conditional" ||
      validation?.status === "fail"
        ? validation.status
        : null;

    const readiness =
      storedReady?.decision ??
      evaluatePaperReadiness({
        session,
        evaluation,
        snapshotOk,
        snapshotError,
        validationStatus,
        validationId: session.validation_id,
        tickErrorCount: session.tick_error_count ?? 0,
      });

    const comparison = buildHistoricalVsForwardComparison({
      validation,
      validationId: session.validation_id,
      evaluation,
      readiness,
    });

    const reviewEligible = readiness.status === "READY_FOR_REVIEW";

    return sendSuccess(
      res,
      {
        session,
        trades,
        events,
        position,
        metrics: session.paper_metrics || null,
        evaluation,
        readiness,
        comparison,
        reviews,
        opsEvents,
        reviewEligible,
        reviewAction: reviewEligible
          ? {
              available: true,
              decisions: [
                "APPROVE_FUTURE_LIVE_ELIGIBLE",
                "REJECT_REVIEW",
              ],
              notice:
                "Human review may mark the frozen version eligible for a future live phase. It does not place exchange orders.",
            }
          : { available: false, reasons: readiness.reasons },
        safety: getTradingSafetyState(),
        notice: PAPER_SIMULATED_NOTICE,
      },
      200,
      req
    );
  } catch (error) {
    if (error instanceof Phase4PersistenceError) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
