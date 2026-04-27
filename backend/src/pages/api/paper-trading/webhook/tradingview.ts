/**
 * POST /api/paper-trading/webhook/tradingview - Receive trading signals from TradingView
 * Allows TradingView alerts to directly trigger trades
 *
 * Setup in TradingView:
 * 1. Create a strategy or indicator
 * 2. Add alert with webhook URL: https://your-api.com/api/paper-trading/webhook/tradingview
 * 3. Alert message JSON format:
 * {
 *   "session_id": "abc-123",
 *   "signal": "BUY",
 *   "symbol": "BTCUSDT",
 *   "price": 67500,
 *   "confidence": 85,
 *   "reason": "RSI oversold"
 * }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";

interface TradingViewWebhookRequest {
  session_id: string;
  signal: "BUY" | "SELL";
  symbol: string;
  price?: number;
  confidence?: number;
  reason?: string;
  risk_percentage?: number;
}

interface WebhookResponse {
  status: string;
  order_id?: number;
  symbol: string;
  signal: string;
  message: string;
  timestamp: string;
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
    price,
    confidence,
    reason = "TradingView alert",
    risk_percentage = 2,
  }: TradingViewWebhookRequest = req.body;

  // Validate required fields
  if (!session_id || !signal || !symbol) {
    console.log("[WEBHOOK] Invalid request - missing required fields");
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
    console.log(`[WEBHOOK] TradingView signal received: ${signal} ${symbol}`);
    console.log(`[WEBHOOK] Session: ${session_id}, Reason: ${reason}`);

    const db = getDB();
    const tradingClient = getTradingClient(true);

    // Get trading session
    const session = await db.getTradingSession(session_id);
    if (!session) {
      console.log(`[WEBHOOK] Session not found: ${session_id}`);
      return sendError(res, "Trading session not found", 404, req);
    }

    // Get strategy
    const strategy = await db.getStrategy(session.strategy_id);
    if (!strategy) {
      console.log(`[WEBHOOK] Strategy not found: ${session.strategy_id}`);
      return sendError(res, "Strategy not found", 404, req);
    }

    // Get current price if not provided in webhook
    let currentPrice = price || 0;
    if (!price) {
      try {
        currentPrice = await tradingClient.getPrice(symbol);
        console.log(`[WEBHOOK] Price fetched from Binance: ${symbol} = $${currentPrice}`);
      } catch (priceError) {
        console.warn(`[WEBHOOK] Failed to get price, using webhook price if available`);
        if (!price) {
          return sendError(
            res,
            "Unable to determine current price. Provide price in webhook or ensure Binance is accessible.",
            400,
            req
          );
        }
      }
    }

    // Check for open position to prevent invalid SELL
    const trades = await db.listPaperTrades(session_id);
    let hasOpenPosition = false;
    let lastBuyQuantity = 0;

    for (const trade of trades) {
      if (trade.side === "BUY") {
        hasOpenPosition = true;
        lastBuyQuantity = trade.quantity;
      } else if (trade.side === "SELL") {
        hasOpenPosition = false;
      }
    }

    // Validate signal
    if (signal === "SELL" && !hasOpenPosition) {
      console.log(`[WEBHOOK] Cannot SELL without open position`);
      return sendError(
        res,
        "Cannot execute SELL signal - no open position",
        400,
        req
      );
    }

    // Calculate position size
    const riskAmount = session.initial_balance * (risk_percentage / 100);
    let quantity = 0;

    if (signal === "BUY") {
      quantity = riskAmount / currentPrice;
    } else {
      quantity = lastBuyQuantity;
    }

    // Round quantity
    quantity = Math.round(quantity * 10000) / 10000;

    if (quantity <= 0) {
      console.log(`[WEBHOOK] Invalid quantity calculated: ${quantity}`);
      return sendError(res, "Invalid order quantity calculated", 400, req);
    }

    console.log(`[WEBHOOK] Executing ${signal} order: ${quantity} ${symbol} @ $${currentPrice}`);

    // Place market order
    const order = await tradingClient.marketOrder(symbol, signal, quantity);

    console.log(`[WEBHOOK] ✓ Order executed successfully! Order ID: ${order.orderId}`);

    // Log trade to database
    await db.createPaperTrade({
      session_id,
      strategy_id: session.strategy_id,
      symbol,
      side: signal,
      entry_price: currentPrice,
      quantity,
      status: order.status,
      reason_entry: `TradingView: ${reason}`,
    });

    console.log(`[WEBHOOK] ✓ Trade recorded in database`);

    // Update session balance if SELL
    if (signal === "SELL") {
      const updatedTrades = await db.listPaperTrades(session_id);
      let totalProfit = 0;

      for (const trade of updatedTrades) {
        if (trade.side === "BUY") {
          // Find matching SELL
          const sellTrade = updatedTrades.find(
            (t) => t.side === "SELL" && t.symbol === trade.symbol
          );
          if (sellTrade) {
            totalProfit += (currentPrice - trade.entry_price) * trade.quantity;
          }
        }
      }

      await db.updateTradingSession(session_id, {
        current_balance: session.initial_balance + totalProfit,
        total_pnl: totalProfit,
      });

      console.log(`[WEBHOOK] ✓ Session balance updated`);
    }

    const response: WebhookResponse = {
      status: "success",
      order_id: order.orderId,
      symbol,
      signal,
      message: `${signal} order executed successfully`,
      timestamp: new Date().toISOString(),
    };

    console.log(`[WEBHOOK] ✓ Webhook processing complete`);

    return sendSuccess(res, response, 200, req);
  } catch (error) {
    console.error(`[WEBHOOK] ✗ Webhook error:`, error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to process webhook",
      500,
      req
    );
  }
});
