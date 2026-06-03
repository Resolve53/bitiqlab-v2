/**
 * POST /api/strategies/purge-failed
 * Permanently delete all strategies marked failed (soft-deleted before this fix).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  try {
    const db = getDB();
    const archived = await db.listStrategies({ include_archived: true });
    const failed = archived.filter((s) => s.status === "failed");
    const ids: string[] = [];

    for (const s of failed) {
      await db.deleteStrategyCompletely(s.id);
      ids.push(s.id);
    }

    return sendSuccess(
      res,
      {
        purged: ids.length,
        strategy_ids: ids,
        message:
          ids.length > 0
            ? `Permanently removed ${ids.length} archived strategies`
            : "No archived (failed) strategies to remove",
      },
      200,
      req
    );
  } catch (error) {
    console.error("[PURGE-FAILED]", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Purge failed",
      500,
      req
    );
  }
});
