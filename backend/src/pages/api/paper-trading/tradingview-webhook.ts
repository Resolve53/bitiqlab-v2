/**
 * POST /api/paper-trading/tradingview-webhook
 * Receive signals from TradingView Pine Script and execute trades
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";

interface TradingViewWebhookPayload {
  session_id: string;
  signal: "BUY" | "SELL";
  symbol: string;
  reason?: string;
  price?: number;
  time?: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  // Validate webhook signature (optional but recommended for security)
  const webhookSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers["x-tradingview-signature"];
    if (!signature || signature !== webhookSecret) {
      return sendError(
        res,
        "Unauthorized: Invalid webhook signature",
        401,
        req
      );
    }
  }

  const payload: TradingViewWebhookPayload = req.body;

  // Validate payload
  if (!payload.session_id || !payload.signal || !payload.symbol) {
    return sendError(
      res,
      "Invalid webhook payload. Required: session_id, signal, symbol",
      400,
      req
    );
  }

  if (!["BUY", "SELL"].includes(payload.signal)) {
    return sendError(res, "Signal must be BUY or SELL", 400, req);
  }

  try {
    console.log(`[TradingView Webhook] Received ${payload.signal} signal for ${payload.symbol}`);

    const db = getDB();
    const client = getTradingClient(true); // Use testnet

    // Get trading session
    const session = await db.getTradingSession(payload.session_id);
    if (!session) {
      console.error(`[TradingView Webhook] Session not found: ${payload.session_id}`);
      return sendError(res, "Trading session not found", 404, req);
    }

    // Get current account balance
    const usdtBalance = await client.getBalance("USDT");
    if (usdtBalance === 0) {
      console.error("[TradingView Webhook] Insufficient USDT balance");
      return sendError(
        res,
        "Insufficient USDT balance in testnet account",
        400,
        req
      );
    }

    // Get current price
    const currentPrice = payload.price || (await client.getPrice(payload.symbol));

    // Calculate position size based on risk percentage
    const riskAmount = session.initial_balance * 0.02; // 2% risk
    let quantity = 0;

    if (payload.signal === "BUY") {
      quantity = riskAmount / currentPrice;
    } else {
      // For SELL: check if we have an open position
      const openOrders = await client.getOpenOrders(payload.symbol);
      const buyOrders = openOrders.filter((o) => o.side === "BUY");

      if (buyOrders.length === 0) {
        console.warn("[TradingView Webhook] No open BUY position to SELL");
        return sendError(
          res,
          "Cannot SELL without an open position",
          400,
          req
        );
      }

      quantity = parseFloat(buyOrders[buyOrders.length - 1].origQty);
    }

    // Round quantity to 4 decimal places
    quantity = Math.round(quantity * 10000) / 10000;

    if (quantity <= 0) {
      return sendError(res, "Invalid order quantity calculated", 400, req);
    }

    // Place market order on Binance testnet
    console.log(`[TradingView Webhook] Placing ${payload.signal} order: ${quantity} ${payload.symbol}`);
    const order = await client.marketOrder(payload.symbol, payload.signal, quantity);

    // Log the trade in database
    await db.createPaperTrade({
      session_id: payload.session_id,
      strategy_id: session.strategy_id,
      symbol: payload.symbol,
      side: payload.signal,
      entry_price: currentPrice,
      quantity: quantity,
      status: order.status,
      reason_entry: payload.reason || "TradingView signal",
    });

    // Update session P&L
    const trades = await db.listPaperTrades(payload.session_id);
    let totalProfit = 0;
    let buyPrice = 0;
    let boughtQuantity = 0;

    for (const trade of trades) {
      if (trade.side === "BUY") {
        buyPrice = trade.entry_price;
        boughtQuantity = trade.quantity;
      } else if (trade.side === "SELL" && boughtQuantity > 0) {
        const profit = (trade.entry_price - buyPrice) * boughtQuantity; // Current price as exit
        totalProfit += profit;
      }
    }

    await db.updateTradingSession(payload.session_id, {
      current_balance: session.initial_balance + totalProfit,
      total_pnl: totalProfit,
    });

    console.log(`[TradingView Webhook] ✓ Order executed: ${order.orderId}`);

    return sendSuccess(
      res,
      {
        order_id: order.orderId,
        signal: payload.signal,
        symbol: payload.symbol,
        quantity,
        price: currentPrice,
        status: order.status,
        session_id: payload.session_id,
        message: `${payload.signal} order executed from TradingView signal`,
      },
      200,
      req
    );
  } catch (error) {
    console.error("[TradingView Webhook] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to execute webhook signal",
      500,
      req
    );
  }
});
