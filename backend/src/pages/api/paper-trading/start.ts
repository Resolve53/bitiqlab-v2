/**
 * POST /api/paper-trading/start - Start paper trading session
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface StartRequest {
  strategy_id: string;
  version?: number;
  initial_balance?: number;
  use_testnet?: boolean;
  created_by?: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const {
    strategy_id,
    version,
    initial_balance,
    use_testnet,
    created_by,
  }: StartRequest = req.body;

  // Validate required fields
  if (!strategy_id) {
    return sendError(res, "Missing required field: strategy_id", 400, req);
  }

  try {
    const db = getDB();

    // Verify strategy exists
    const strategy = await db.getStrategy(strategy_id);

    // Create paper trading session
    const session = await db.createTradingSession({
      strategy_id,
      session_name: `Paper Trading - ${strategy.name}`,
      initial_balance: initial_balance || 10000,
      exchange: "binance",
      is_testnet: use_testnet !== false,
    });

    // Update strategy status
    await db.updateStrategy(strategy_id, {
      status: "testing",
    });

    // Log audit
    await db.createStrategyAuditLog({
      strategy_id,
      action: "START_PAPER_TRADING",
      new_values: session,
      changed_by: created_by || "system",
    });

    return sendSuccess(
      res,
      {
        session_id: session.id,
        strategy_id: session.strategy_id,
        initial_balance: session.initial_balance,
        current_balance: session.current_balance,
        exchange: session.exchange,
        is_testnet: session.is_testnet,
        message: "Paper trading session started",
      },
      201,
      req
    );
  } catch (error) {
    console.error("Paper trading start error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to start paper trading",
      500,
      req
    );
  }
});
