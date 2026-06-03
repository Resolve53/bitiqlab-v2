/**
 * POST /api/paper-trading/tradingview-webhook
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getSessionTradingContext } from "@/lib/session-trading-client";

interface TradingViewWebhookPayload {
  session_id: string;
  signal: "BUY" | "SELL";
  symbol: string;
  reason?: string;
  price?: number;
  market_type?: "spot" | "futures";
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const webhookSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers["x-tradingview-signature"];
    if (!signature || signature !== webhookSecret) {
      return sendError(res, "Unauthorized: Invalid webhook signature", 401, req);
    }
  }

  const payload: TradingViewWebhookPayload = req.body;
  if (!payload.session_id || !payload.signal || !payload.symbol) {
    return sendError(res, "Invalid webhook payload", 400, req);
  }

  try {
    const db = getDB();
    const { client, marketType, leverage } = await getSessionTradingContext(
      payload.session_id,
      { requestMarketType: payload.market_type }
    );
    const session = await db.getTradingSession(payload.session_id);
    if (!session) return sendError(res, "Trading session not found", 404, req);

    const currentPrice = payload.price || (await client.getPrice(payload.symbol));
    const riskAmount = session.initial_balance * 0.02;
    let quantity =
      payload.signal === "BUY"
        ? riskAmount / currentPrice
        : await client.resolveSellQuantity(
            payload.symbol,
            (
              await db.listPaperTrades(payload.session_id)
            )
              .filter((t) => t.side === "BUY" && t.symbol === payload.symbol)
              .pop()?.quantity || 0
          );

    if (quantity <= 0) {
      return sendError(res, "Invalid quantity", 400, req);
    }

    quantity = await client.formatQuantity(payload.symbol, quantity);
    const order = await client.marketOrder(
      payload.symbol,
      payload.signal,
      quantity,
      { leverage: marketType === "futures" ? leverage : undefined }
    );

    await db.createPaperTrade({
      session_id: payload.session_id,
      strategy_id: session.strategy_id,
      symbol: payload.symbol,
      side: payload.signal,
      entry_price: currentPrice,
      quantity,
      status: order.status,
      reason_entry: payload.reason || "TradingView signal",
    });

    return sendSuccess(
      res,
      {
        order_id: order.orderId,
        market_type: marketType,
        message: `${payload.signal} ${marketType} order executed`,
      },
      200,
      req
    );
  } catch (error) {
    return sendError(
      res,
      error instanceof Error ? error.message : "Webhook failed",
      500,
      req
    );
  }
});
