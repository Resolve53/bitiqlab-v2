/**
 * GET /api/paper-trading/[session_id]/status - Get trading session status and P&L
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";

interface MonitorConfig {
  coin_count: number;
  custom_coins: string[];
  scan_frequency: number;
  position_size_per_coin: number;
  max_concurrent_positions: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  trading_type: "spot" | "futures";
}

interface SessionStats {
  session_id: string;
  strategy_id: string;
  strategy_name: string;
  status: string;
  exchange: string;
  is_testnet: boolean;
  initial_balance: number;
  current_balance: number;
  total_pl: number;
  pl_percentage: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  trades: Array<{
    id: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    timestamp: string;
    pnl?: number;
  }>;
  open_positions: Array<{
    symbol: string;
    side: string;
    quantity: number;
    entry_price: number;
    current_price: number;
    unrealized_pl: number;
  }>;
  multi_coin_config?: MonitorConfig;
  coins_being_monitored?: string[];
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id } = req.query as { session_id: string };

  if (!session_id) {
    return sendError(res, "Missing session_id parameter", 400, req);
  }

  try {
    const db = getDB();
    const client = getTradingClient(true); // Use testnet

    // Get trading session
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Get strategy details
    const strategy = await db.getStrategy(session.strategy_id);

    // Get multi-coin monitor config if it exists
    let multiCoinConfig: MonitorConfig | null = null;
    try {
      multiCoinConfig = await db.getMultiCoinConfig(session_id);
    } catch (error) {
      console.warn(`Could not fetch multi-coin config: ${error}`);
    }

    // Get all trades for this session
    const trades = await db.listPaperTrades(session_id);

    // Calculate P&L and statistics
    let totalPL = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    const tradesList: SessionStats["trades"] = [];
    const positions: Record<
      string,
      { symbol: string; buyPrice: number; quantity: number; entryTime: Date }
    > = {};

    for (const trade of trades) {
      if (trade.side === "BUY") {
        positions[trade.symbol] = {
          symbol: trade.symbol,
          buyPrice: trade.entry_price,
          quantity: trade.quantity,
          entryTime: new Date(trade.entry_time || trade.created_at),
        };
      } else if (trade.side === "SELL" && positions[trade.symbol]) {
        const position = positions[trade.symbol];
        const exitPrice = trade.exit_price || trade.entry_price;
        const pnl = (exitPrice - position.buyPrice) * position.quantity;
        totalPL += pnl;

        if (pnl > 0) {
          winningTrades++;
        } else if (pnl < 0) {
          losingTrades++;
        }

        tradesList.push({
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          price: exitPrice,
          timestamp: trade.exit_time || trade.created_at,
          pnl,
        });

        delete positions[trade.symbol];
      } else {
        tradesList.push({
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          price: trade.entry_price,
          timestamp: trade.entry_time || trade.created_at,
        });
      }
    }

    // Calculate unrealized P&L for open positions
    const openPositions: SessionStats["open_positions"] = [];
    for (const [symbol, position] of Object.entries(positions)) {
      try {
        const currentPrice = await client.getPrice(symbol);
        const unrealizedPL =
          (currentPrice - position.buyPrice) * position.quantity;

        openPositions.push({
          symbol,
          side: "BUY",
          quantity: position.quantity,
          entry_price: position.buyPrice,
          current_price: currentPrice,
          unrealized_pl: unrealizedPL,
        });
      } catch (error) {
        console.error(`Error fetching price for ${symbol}:`, error);
      }
    }

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const currentBalance = session.initial_balance + totalPL;
    const plPercentage = (totalPL / session.initial_balance) * 100;

    const stats: SessionStats = {
      session_id: session.id,
      strategy_id: session.strategy_id,
      strategy_name: strategy?.name || "Unknown",
      status: session.status || "active",
      exchange: session.exchange,
      is_testnet: session.is_testnet,
      initial_balance: session.initial_balance,
      current_balance: currentBalance,
      total_pl: Math.round(totalPL * 100) / 100,
      pl_percentage: Math.round(plPercentage * 100) / 100,
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: Math.round(winRate * 100) / 100,
      trades: tradesList,
      open_positions: openPositions,
      ...(multiCoinConfig && {
        multi_coin_config: {
          coin_count: multiCoinConfig.coin_count,
          custom_coins: multiCoinConfig.custom_coins,
          scan_frequency: multiCoinConfig.scan_frequency,
          position_size_per_coin: Number(multiCoinConfig.position_size_per_coin),
          max_concurrent_positions: multiCoinConfig.max_concurrent_positions,
          stop_loss_percent: Number(multiCoinConfig.stop_loss_percent),
          take_profit_percent: Number(multiCoinConfig.take_profit_percent),
          trading_type: multiCoinConfig.trading_type,
        },
        coins_being_monitored: multiCoinConfig.custom_coins,
      }),
    };

    return sendSuccess(res, stats, 200, req);
  } catch (error) {
    console.error("Get session status error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to get session status",
      500,
      req
    );
  }
});
