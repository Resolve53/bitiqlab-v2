/**
 * GET /api/strategies/[id] - Get strategy details
 * PATCH /api/strategies/[id] - Update strategy
 * DELETE /api/strategies/[id] - Delete strategy
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler, handleCORSPreflight } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  // Handle CORS preflight
  if (handleCORSPreflight(req, res)) {
    return;
  }

  const { id } = req.query as { id: string };
  const db = getDB();

  try {
    if (req.method === "GET") {
      // Get strategy details
      const strategy = await db.getStrategy(id);
      sendSuccess(res, strategy);
    } else if (req.method === "PATCH") {
      // Update strategy
      const strategy = await db.getStrategy(id);

      // Validate status if provided
      if (req.body.status) {
        const validStatuses = ["draft", "testing", "approved", "failed"];
        if (!validStatuses.includes(req.body.status)) {
          return sendError(
            res,
            `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
            400
          );
        }
      }

      const updated = await db.updateStrategy(id, req.body);

      // Log audit
      await db.createStrategyAuditLog({
        strategy_id: id,
        action: "UPDATE",
        old_values: strategy,
        new_values: updated,
        changed_by: req.body.updated_by || "system",
      });

      sendSuccess(res, updated);
    } else if (req.method === "DELETE") {
      // Get current strategy first
      const strategy = await db.getStrategy(id);

      // Soft delete by setting status to 'failed'
      const updated = await db.updateStrategy(id, {
        status: "failed",
      });

      // Log audit
      await db.createStrategyAuditLog({
        strategy_id: id,
        action: "DELETE",
        old_values: strategy,
        new_values: updated,
        changed_by: req.body.deleted_by || "system",
      });

      sendSuccess(res, { message: "Strategy deleted", id });
    } else {
      res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
      sendError(res, "Method not allowed", 405);
    }
  } catch (error) {
    console.error("Strategy API error:", error);
    sendError(
      res,
      `Error processing request: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
});
