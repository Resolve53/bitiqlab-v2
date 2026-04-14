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
    return sendError(res, "Method not allowed", 405);
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
    return sendError(res, "Missing required field: strategy_id", 400);
  }

  try {
    const db = getDB();

    // Verify strategy exists and is in valid state
    const strategy = await db.getStrategy(strategy_id);

    if (!["backtested", "optimized"].includes(strategy.status)) {
      return sendError(
        res,
        `Strategy must be backtested or optimized before paper trading. Current status: ${strategy.status}`,
        400
      );
    }

    // Create paper trading session
    const session = await db.createPaperTradingSession({
      strategy_id,
      version: version || strategy.version,
      start_date: new Date(),
      status: "active",
      paper_account_id: `paper_${Date.now()}`,
      initial_balance: initial_balance || 10000,
      current_balance: initial_balance || 10000,
      total_trades: 0,
      win_rate: 0,
      loss_rate: 0,
      total_pnl: 0,
      total_pnl_percent: 0,
      max_drawdown: 0,
      max_concurrent_positions: 0,
      average_winning_trade: 0,
      average_losing_trade: 0,
      profit_factor: 0,
      meets_min_trades: false,
      meets_min_duration: false,
      passes_stability_checks: false,
      validation_status: "pending",
      use_testnet: use_testnet !== false,
      trades: [],
    });

    // Update strategy status
    await db.updateStrategy(strategy_id, {
      status: "paper_trading",
      updated_at: new Date(),
    });

    // Log audit
    await db.createAuditLog({
      action: "START_PAPER_TRADING",
      entity_type: "paper_trading_session",
      entity_id: session.id,
      user_id: created_by,
      new_values: session,
      description: `Started paper trading for strategy: ${strategy.name}`,
    });

    sendSuccess(
      res,
      {
        session_id: session.id,
        account_id: session.paper_account_id,
        initial_balance: session.initial_balance,
        use_testnet: session.use_testnet,
        message: "Paper trading session started",
      },
      201
    );
  } catch (error) {
    console.error("Paper trading start error:", error);
    sendError(
      res,
      error instanceof Error ? error.message : "Failed to start paper trading",
      500
    );
  }
});
