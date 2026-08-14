/**
 * GET /api/paper-forward/sessions/[id]
 * Immutable session + simulated paper metrics/trades/events/position.
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
} from "@/paper-forward";
import {
  asPaperExecutionPersistence,
  asPaperForwardPersistence,
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
    const session = await getPaperSession(asPaperForwardPersistence(db), id);
    const exec = asPaperExecutionPersistence(db);
    const [trades, events, position] = await Promise.all([
      exec.listPaperForwardTrades(id).catch(() => []),
      exec.listPaperForwardEvents(id, 50).catch(() => []),
      exec.getPaperForwardPosition(id).catch(() => null),
    ]);
    return sendSuccess(
      res,
      {
        session,
        trades,
        events,
        position,
        metrics: session.paper_metrics || null,
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
