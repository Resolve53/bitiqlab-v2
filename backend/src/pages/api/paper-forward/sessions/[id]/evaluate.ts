/**
 * POST /api/paper-forward/sessions/[id]/evaluate
 * Persist forward metrics + readiness from simulated trades only.
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
  evaluateAndPersistPaperSession,
  Phase4PersistenceError,
  PAPER_SIMULATED_NOTICE,
  getTradingSafetyState,
} from "@/paper-forward";
import {
  asPaperForwardPersistence,
  asPaperOpsPersistence,
} from "@/paper-forward/db-adapter";
import { PaperAuthError, requireHumanActor } from "@/paper-forward/auth";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }
  const id = String(req.query.id || "");
  if (!id) return sendError(res, "Missing session id", 400, req);
  try {
    await requireHumanActor(req, req.body?.createdBy || req.body?.created_by);
    const db = getDB();
    const result = await evaluateAndPersistPaperSession(
      asPaperForwardPersistence(db),
      asPaperOpsPersistence(db),
      id
    );
    return sendSuccess(
      res,
      {
        ...result,
        safety: getTradingSafetyState(),
        notice: PAPER_SIMULATED_NOTICE,
      },
      200,
      req
    );
  } catch (error) {
    if (error instanceof PaperAuthError)
      return sendError(res, error.message, error.statusCode, req);
    if (error instanceof Phase4PersistenceError)
      return sendError(res, error.message, 503, req);
    throw error;
  }
});
