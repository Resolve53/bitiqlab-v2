/**
 * GET /api/signals — Recent trade signals / paper activity (no TradingView required)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 200);

  try {
    const db = getDB();
    const trades = await db.listAllPaperTrades({ limit });

    const signals = trades
      .filter((t: { side?: string }) => t.side === "BUY")
      .slice(0, limit)
      .map((t: Record<string, unknown>) => ({
        id: t.id,
        coin: t.symbol,
        symbol: t.symbol,
        direction: "long",
        entry_price: Number(t.entry_price) || 0,
        ai_score: Number(t.confidence_score) || 70,
        reason: (t.reason_entry as string) || "Paper trade entry",
        created_at: t.entry_time || t.created_at,
        strategy_id: t.strategy_id,
      }));

    return sendSuccess(res, signals, 200, req);
  } catch (error) {
    console.error("[SIGNALS]", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to list signals",
      500,
      req
    );
  }
});
