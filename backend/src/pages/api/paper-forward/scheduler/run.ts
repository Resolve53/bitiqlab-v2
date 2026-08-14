/**
 * POST /api/paper-forward/scheduler/run
 * Process RUNNING paper sessions (lease-locked, idempotent ticks).
 *
 * Auth: X-Paper-Forward-Scheduler-Token when PAPER_FORWARD_SCHEDULER_TOKEN is set;
 * otherwise a human actor is required. Not an infinite in-process loop.
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
  runScheduledPaperTicks,
  Phase4PersistenceError,
  PAPER_SIMULATED_NOTICE,
} from "@/paper-forward";
import {
  asPaperExecutionPersistence,
  asPaperForwardPersistence,
  asPaperOpsPersistence,
} from "@/paper-forward/db-adapter";
import { PaperAuthError, requireSchedulerActor } from "@/paper-forward/auth";
import { PaperTickError } from "@/paper-forward/tick";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }
  try {
    const actor = await requireSchedulerActor(
      req,
      req.body?.createdBy || req.body?.created_by
    );
    const db = getDB();
    const result = await runScheduledPaperTicks(
      asPaperForwardPersistence(db),
      asPaperExecutionPersistence(db),
      asPaperOpsPersistence(db),
      { actor }
    );
    return sendSuccess(
      res,
      {
        ...result,
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
    if (error instanceof Phase4PersistenceError)
      return sendError(res, error.message, 503, req);
    throw error;
  }
});
