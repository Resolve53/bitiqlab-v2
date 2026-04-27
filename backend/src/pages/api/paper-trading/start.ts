/**
 * POST /api/paper-trading/start - Start paper trading session
 * Automatically deploys strategy to TradingView via MCP
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingViewMCPService } from "@/lib/tradingview-mcp-service";

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
    const mcpService = getTradingViewMCPService();

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

    // Deploy to TradingView via MCP (non-blocking)
    let mcpStatus = { success: false, message: "MCP not available" };
    try {
      const isHealthy = await mcpService.healthCheck();
      if (isHealthy) {
        console.log(`[API] Deploying strategy to TradingView via MCP...`);
        mcpStatus = await mcpService.deployStrategy(strategy);
        if (mcpStatus.success) {
          await mcpService.startMonitoring(
            strategy_id,
            session.id,
            strategy.symbol
          );
        }
      }
    } catch (mcpError) {
      console.warn(
        "[API] MCP deployment failed (non-critical):",
        mcpError
      );
      // Continue anyway - MCP is optional
    }

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
        tradingview_status: mcpStatus.success ? "deployed" : "pending",
        tradingview_message: mcpStatus.message,
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
