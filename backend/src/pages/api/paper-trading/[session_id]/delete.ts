/**
 * DELETE /api/paper-trading/[session_id]/delete
 * Permanently remove a paper trading session and its trades.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id } = req.query as { session_id: string };
  if (!session_id) {
    return sendError(res, "Missing session_id", 400, req);
  }

  try {
    const db = getDB();
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Session not found", 404, req);
    }

    await db.deleteTradingSession(session_id);

    return sendSuccess(
      res,
      { message: "Session and trades permanently deleted", session_id },
      200,
      req
    );
  } catch (error) {
    console.error("[DELETE SESSION]", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to delete session",
      500,
      req
    );
  }
});
