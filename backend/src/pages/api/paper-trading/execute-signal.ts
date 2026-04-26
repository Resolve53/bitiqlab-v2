/**
 * POST /api/paper-trading/execute-signal - Execute a trading signal
 * Places a market order based on strategy signals
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";

interface ExecuteSignalRequest {
  session_id: string;
  signal: "BUY" | "SELL";
  symbol: string;
  reason?: string;
  risk_percentage?: number;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const {
    session_id,
    signal,
    symbol,
    reason,
    risk_percentage = 2,
  }: ExecuteSignalRequest = req.body;

  // Validate required fields
  if (!session_id || !signal || !symbol) {
    return sendError(
      res,
      "Missing required fields: session_id, signal, symbol",
      400,
      req
    );
  }

  if (!["BUY", "SELL"].includes(signal)) {
    return sendError(res, "Signal must be BUY or SELL", 400, req);
  }

  try {
    const db = getDB();
    const client = getTradingClient(true); // Use testnet

    // Get trading session
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Get current account balance
    const usdtBalance = await client.getBalance("USDT");
    if (usdtBalance === 0) {
      return sendError(
        res,
        "Insufficient USDT balance in testnet account",
        400,
        req
      );
    }

    // Get current price
    const currentPrice = await client.getPrice(symbol);

    // Calculate position size based on risk percentage
    const riskAmount = session.initial_balance * (risk_percentage / 100);
    let quantity = 0;

    if (signal === "BUY") {
      // For BUY: position size = risk amount / price
      quantity = riskAmount / currentPrice;
    } else {
      // For SELL: we need to have the position first
      // Check if we have an open position by looking at recent orders
      const openOrders = await client.getOpenOrders(symbol);
      if (openOrders.length === 0) {
        return sendError(
          res,
          "Cannot SELL without an open position. No BUY orders found.",
          400,
          req
        );
      }

      // Use the quantity from the most recent BUY order
      const buyOrders = openOrders.filter((o) => o.side === "BUY");
      if (buyOrders.length === 0) {
        return sendError(res, "No open BUY position to SELL", 400, req);
      }

      quantity = parseFloat(buyOrders[buyOrders.length - 1].origQty);
    }

    // Round quantity to 4 decimal places (Binance requirement)
    quantity = Math.round(quantity * 10000) / 10000;

    if (quantity <= 0) {
      return sendError(res, "Invalid order quantity calculated", 400, req);
    }

    // Place market order on Binance testnet
    const order = await client.marketOrder(symbol, signal, quantity);

    // Log the trade in database
    await db.createPaperTrade({
      session_id,
      strategy_id: session.strategy_id,
      symbol,
      side: signal,
      entry_price: currentPrice,
      quantity: quantity,
      status: order.status,
      reason_entry: reason || "Strategy signal triggered",
    });

    // Update session with latest P&L
    const trades = await db.listPaperTrades(session_id);
    let totalProfit = 0;
    let buyPrice = 0;
    let boughtQuantity = 0;

    for (const trade of trades) {
      if (trade.side === "BUY") {
        buyPrice = trade.entry_price;
        boughtQuantity = trade.quantity;
      } else if (trade.side === "SELL" && boughtQuantity > 0) {
        const profit = (trade.exit_price - buyPrice) * boughtQuantity;
        totalProfit += profit;
      }
    }

    await db.updateTradingSession(session_id, {
      current_balance: session.initial_balance + totalProfit,
      total_pnl: totalProfit,
    });

    return sendSuccess(
      res,
      {
        order_id: order.orderId,
        signal,
        symbol,
        quantity,
        price: currentPrice,
        status: order.status,
        message: `${signal} order placed successfully`,
      },
      201,
      req
    );
  } catch (error) {
    console.error("Execute signal error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to execute signal",
      500,
      req
    );
  }
});
