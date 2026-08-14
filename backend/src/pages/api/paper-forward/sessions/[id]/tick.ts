/**
 * POST /api/paper-forward/sessions/[id]/tick
 * Process new CLOSED candles for a RUNNING paper session (simulated fills only).
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
  tickPaperSession,
  PaperTickError,
  PaperSnapshotError,
  PaperLifecycleError,
  Phase4PersistenceError,
  PAPER_SIMULATED_NOTICE,
  evaluateAndPersistPaperSession,
} from "@/paper-forward";
import { PaperCandleError } from "@/paper-forward/closed-candles";
import {
  asPaperExecutionPersistence,
  asPaperForwardPersistence,
  asPaperOpsPersistence,
} from "@/paper-forward/db-adapter";
import { PaperAuthError, requireHumanActor } from "@/paper-forward/auth";
import { recordTickSuccess } from "@/paper-forward/session-ops";
import { getPaperSession } from "@/paper-forward/session-service";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }
  const id = String(req.query.id || "");
  if (!id) return sendError(res, "Missing session id", 400, req);

  try {
    const actor = await requireHumanActor(
      req,
      req.body?.createdBy || req.body?.created_by
    );
    const db = getDB();
    const sessionDb = asPaperForwardPersistence(db);
    const execDb = asPaperExecutionPersistence(db);
    const opsDb = asPaperOpsPersistence(db);
    const result = await tickPaperSession(sessionDb, execDb, {
      sessionId: id,
      actor,
      maxBars: req.body?.maxBars,
    });
    const after = await getPaperSession(sessionDb, id);
    await recordTickSuccess(opsDb, after, result.candlesProcessed);
    const evaluated = await evaluateAndPersistPaperSession(
      sessionDb,
      opsDb,
      id
    );
    return sendSuccess(
      res,
      {
        ...result,
        evaluation: evaluated.evaluation,
        readiness: evaluated.readiness,
        notice: PAPER_SIMULATED_NOTICE,
      },
      200,
      req
    );
  } catch (error) {
    if (error instanceof PaperAuthError)
      return sendError(res, error.message, error.statusCode, req);
    if (error instanceof PaperTickError)
      return sendError(res, error.message, error.statusCode, req);
    if (error instanceof PaperSnapshotError)
      return sendError(res, error.message, 409, req);
    if (error instanceof PaperCandleError)
      return sendError(res, error.message, 400, req);
    if (error instanceof PaperLifecycleError)
      return sendError(res, error.message, 400, req);
    if (error instanceof Phase4PersistenceError)
      return sendError(res, error.message, 503, req);
    throw error;
  }
});
