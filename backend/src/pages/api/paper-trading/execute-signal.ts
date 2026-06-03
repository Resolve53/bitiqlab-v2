/**
 * POST /api/paper-trading/execute-signal
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getSessionTradingContext } from "@/lib/session-trading-client";

interface ExecuteSignalRequest {
  session_id: string;
  signal: "BUY" | "SELL";
  symbol: string;
  reason?: string;
  risk_percentage?: number;
  market_type?: "spot" | "futures";
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
    market_type: requestMarketType,
  }: ExecuteSignalRequest = req.body;

  if (!session_id || !signal || !symbol) {
    return sendError(res, "Missing required fields: session_id, signal, symbol", 400, req);
  }

  if (!["BUY", "SELL"].includes(signal)) {
    return sendError(res, "Signal must be BUY or SELL", 400, req);
  }

  try {
    const db = getDB();
    const { client, marketType, leverage } = await getSessionTradingContext(session_id, {
      requestMarketType,
    });

    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    const currentPrice = await client.getPrice(symbol);
    const riskAmount = session.initial_balance * (risk_percentage / 100);
    let quantity = signal === "BUY" ? riskAmount / currentPrice : 0;

    if (signal === "SELL") {
      const trades = await db.listPaperTrades(session_id);
      let lastBuyQuantity = 0;
      for (const trade of trades) {
        if (trade.side === "BUY" && trade.symbol === symbol) lastBuyQuantity = trade.quantity;
        if (trade.side === "SELL" && trade.symbol === symbol) lastBuyQuantity = 0;
      }
      quantity = await client.resolveSellQuantity(symbol, lastBuyQuantity);
      if (quantity <= 0) {
        return sendError(res, "Cannot SELL without an open position", 400, req);
      }
    }

    quantity = await client.formatQuantity(symbol, quantity);
    if (quantity <= 0) {
      return sendError(res, "Invalid order quantity calculated", 400, req);
    }

    const order = await client.marketOrder(symbol, signal, quantity, {
      leverage: marketType === "futures" ? leverage : undefined,
    });

    await db.createPaperTrade({
      session_id,
      strategy_id: session.strategy_id,
      symbol,
      side: signal,
      entry_price: currentPrice,
      quantity,
      status: order.status,
      reason_entry: reason || "Strategy signal triggered",
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
        market_type: marketType,
        message: `${signal} ${marketType} order placed successfully`,
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
