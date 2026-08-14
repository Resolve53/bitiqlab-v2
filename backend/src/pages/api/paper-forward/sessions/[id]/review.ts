/**
 * POST /api/paper-forward/sessions/[id]/review
 * Human review of READY_FOR_REVIEW sessions.
 * Approval marks the frozen version eligible for a FUTURE live phase.
 * Does not place exchange orders. force=true is rejected.
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
  submitPaperReview,
  PaperReviewError,
  Phase4PersistenceError,
  PAPER_SIMULATED_NOTICE,
  PROMOTION_FORCE_DISABLED,
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

  const body = req.body || {};
  if (body.force === true || req.query.force === "true") {
    return sendError(res, PROMOTION_FORCE_DISABLED, 400, req);
  }

  try {
    const actor = await requireHumanActor(
      req,
      body.createdBy || body.created_by
    );
    const db = getDB();
    const result = await submitPaperReview(
      asPaperForwardPersistence(db),
      asPaperOpsPersistence(db),
      {
        sessionId: id,
        decision: String(body.decision || ""),
        notes: body.notes ?? body.review_notes ?? null,
        actor,
        force: body.force,
      }
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
    if (error instanceof PaperReviewError)
      return sendError(res, error.message, error.statusCode, req);
    if (error instanceof Phase4PersistenceError)
      return sendError(res, error.message, 503, req);
    throw error;
  }
});
