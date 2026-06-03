/**
 * POST /api/paper-trading/start - Start paper trading session
 * Creates session with $5k demo capital and top-20 multi-coin monitor by default.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingViewMCPService } from "@/lib/tradingview-mcp-service";
import {
  PAPER_TRADING_DEFAULT_CAPITAL,
  buildDefaultMultiCoinConfig,
} from "@/lib/trading-constants";

interface StartRequest {
  strategy_id: string;
  version?: number;
  initial_balance?: number;
  use_testnet?: boolean;
  created_by?: string;
  enable_multi_coin?: boolean;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const {
    strategy_id,
    initial_balance,
    use_testnet,
    created_by,
    enable_multi_coin = true,
  }: StartRequest = req.body;

  if (!strategy_id) {
    return sendError(res, "Missing required field: strategy_id", 400, req);
  }

  try {
    const db = getDB();
    const mcpService = getTradingViewMCPService();
    const strategy = await db.getStrategy(strategy_id);
    const capital = initial_balance ?? PAPER_TRADING_DEFAULT_CAPITAL;

    const session = await db.createTradingSession({
      strategy_id,
      session_name: `Paper Trading - ${strategy.name}`,
      initial_balance: capital,
      exchange: "binance",
      is_testnet: use_testnet !== false,
    });

    let multiCoinConfig = null;
    if (enable_multi_coin !== false) {
      const marketType =
        strategy.market_type === "futures" ? "futures" : "spot";
      multiCoinConfig = buildDefaultMultiCoinConfig(capital, marketType);
      try {
        await db.saveMultiCoinConfig(session.id, strategy_id, multiCoinConfig);
      } catch (mcErr) {
        console.warn("[API] Multi-coin config save failed:", mcErr);
      }
    }

    await db.updateStrategy(strategy_id, { status: "testing" });

    let mcpStatus = { success: false, message: "MCP not available" };
    try {
      const isHealthy = await mcpService.healthCheck();
      if (isHealthy) {
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
      console.warn("[API] MCP deployment failed (non-critical):", mcpError);
    }

    await db.createStrategyAuditLog({
      strategy_id,
      action: "START_PAPER_TRADING",
      new_values: { session, multi_coin: multiCoinConfig },
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
        multi_coin_enabled: Boolean(multiCoinConfig),
        coins_monitored: multiCoinConfig?.custom_coins?.length ?? 0,
        message: multiCoinConfig
          ? `Paper trading started with $${capital} on Binance testnet. Monitoring top ${multiCoinConfig.coin_count} coins.`
          : "Paper trading session started",
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
