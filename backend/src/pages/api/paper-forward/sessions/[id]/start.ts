import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import {
  startPaperSession,
  PaperLifecycleError,
  Phase4PersistenceError,
  getTradingSafetyState,
} from "@/paper-forward";
import { asPaperForwardPersistence } from "@/paper-forward/db-adapter";
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
    const actor = await requireHumanActor(
      req,
      req.body?.createdBy || req.body?.created_by
    );
    const session = await startPaperSession(
      asPaperForwardPersistence(getDB()),
      id,
      actor
    );
    return sendSuccess(
      res,
      {
        session,
        safety: getTradingSafetyState(),
        notice:
          "Paper Forward Engine pending / not executing trades yet (Phase 4A).",
      },
      200,
      req
    );
  } catch (error) {
    if (error instanceof PaperAuthError)
      return sendError(res, error.message, error.statusCode, req);
    if (error instanceof PaperLifecycleError)
      return sendError(res, error.message, 400, req);
    if (error instanceof Phase4PersistenceError)
      return sendError(res, error.message, 503, req);
    throw error;
  }
});
