/**
 * GET /api/paper-forward/sessions/[id]
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
} from "@/paper-forward";
import { asPaperForwardPersistence } from "@/paper-forward/db-adapter";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const id = String(req.query.id || "");
  if (!id) return sendError(res, "Missing session id", 400, req);

  try {
    const session = await getPaperSession(
      asPaperForwardPersistence(getDB()),
      id
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
    if (error instanceof Phase4PersistenceError) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
