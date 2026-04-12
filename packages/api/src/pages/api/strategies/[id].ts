/**
 * GET /api/strategies/[id] - Get strategy details
 * PATCH /api/strategies/[id] - Update strategy
 * DELETE /api/strategies/[id] - Delete strategy
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query as { id: string };
  const db = getDB();

  if (req.method === "GET") {
    // Get strategy details
    const strategy = await db.getStrategy(id);
    sendSuccess(res, strategy);
  } else if (req.method === "PATCH") {
    // Update strategy
    const strategy = await db.getStrategy(id);

    const updates = {
      ...req.body,
      updated_at: new Date(),
    };

    // Validate status if provided
    if (updates.status) {
      const validStatuses = [
        "draft",
        "backtested",
        "optimized",
        "paper_trading",
        "approved",
        "disabled",
      ];
      if (!validStatuses.includes(updates.status)) {
        return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
      }
    }

    const updated = await db.updateStrategy(id, updates);

    // Log audit
    await db.createAuditLog({
      action: "UPDATE",
      entity_type: "strategy",
      entity_id: id,
      user_id: req.body.updated_by,
      old_values: strategy,
      new_values: updated,
      description: `Updated strategy: ${updated.name}`,
    });

    sendSuccess(res, updated);
  } else if (req.method === "DELETE") {
    // Delete strategy (soft delete by setting status to 'disabled')
    const updated = await db.updateStrategy(id, {
      status: "disabled",
      updated_at: new Date(),
    });

    // Log audit
    await db.createAuditLog({
      action: "DELETE",
      entity_type: "strategy",
      entity_id: id,
      user_id: req.body.deleted_by,
      description: `Deleted strategy: ${updated.name}`,
    });

    sendSuccess(res, { message: "Strategy deleted", id });
  } else {
    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    sendError(res, "Method not allowed", 405);
  }
});
