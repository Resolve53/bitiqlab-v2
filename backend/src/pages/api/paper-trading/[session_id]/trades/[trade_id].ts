/**
 * GET /api/paper-trading/[session_id]/trades/[trade_id]
 * Get detailed information about a single trade
 *
 * Response:
 * {
 *   status: "success";
 *   trade: {
 *     id: string;
 *     session_id: string;
 *     strategy_id: string;
 *     symbol: string;
 *     side: "BUY" | "SELL";
 *     entry_price: number;
 *     entry_time: Date;
 *     exit_price: number;
 *     exit_time: Date;
 *     exit_reason: string;
 *     quantity: number;
 *     pnl_percent: number;
 *     pnl_absolute: number;
 *     duration_minutes: number;
 *     max_favorable_excursion: number;
 *     max_adverse_excursion: number;
 *     r_r_actual: number;
 *     analysis: {
 *       win_or_loss: "Win" | "Loss" | "Break-even";
 *       efficiency: number; // MFE / MAE ratio
 *       risk_reward_achieved: number;
 *       price_action_summary: string;
 *     };
 *   };
 * }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getDB } from "@/lib/db";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id, trade_id } = req.query;

  if (!session_id || typeof session_id !== "string") {
    return sendError(res, "Invalid session_id", 400, req);
  }

  if (!trade_id || typeof trade_id !== "string") {
    return sendError(res, "Invalid trade_id", 400, req);
  }

  try {
    const db = getDB();

    // Verify session exists
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Get all trades and find the one matching trade_id
    const allTrades = await db.listPaperTrades(session_id);
    const trade = allTrades.find((t) => t.id === trade_id);

    if (!trade) {
      return sendError(res, "Trade not found", 404, req);
    }

    // Calculate additional metrics
    const entryTime = new Date(trade.entry_time).getTime();
    const exitTime = new Date(trade.exit_time).getTime();
    const duration_minutes = (exitTime - entryTime) / (1000 * 60);

    const mfe = trade.max_favorable_excursion || 0;
    const mae = trade.max_adverse_excursion || 0;
    const efficiency = mae !== 0 ? mfe / Math.abs(mae) : mfe === 0 ? 0 : Infinity;

    const winOrLoss =
      trade.pnl_percent > 0.01 ? "Win" : trade.pnl_percent < -0.01 ? "Loss" : "Break-even";

    // Describe price action
    let priceActionSummary = "";
    if (trade.side === "BUY") {
      if (mfe > 0 && mae < 0) {
        priceActionSummary = `Price moved up $${mfe.toFixed(2)} from entry before dropping to exit`;
      } else if (mfe > 0) {
        priceActionSummary = `Price moved up $${mfe.toFixed(2)} from entry`;
      } else if (mae < 0) {
        priceActionSummary = `Price dropped $${Math.abs(mae).toFixed(2)} from entry`;
      }
    } else {
      if (mfe > 0 && mae < 0) {
        priceActionSummary = `Price moved down $${mfe.toFixed(2)} from entry before rising to exit`;
      } else if (mfe > 0) {
        priceActionSummary = `Price moved down $${mfe.toFixed(2)} from entry`;
      } else if (mae < 0) {
        priceActionSummary = `Price rose $${Math.abs(mae).toFixed(2)} from entry`;
      }
    }

    const tradeDetail = {
      ...trade,
      duration_minutes,
      analysis: {
        win_or_loss: winOrLoss,
        efficiency: efficiency,
        risk_reward_achieved: trade.r_r_actual || 0,
        price_action_summary: priceActionSummary,
      },
    };

    return sendSuccess(
      res,
      {
        status: "success",
        trade: tradeDetail,
      },
      200,
      req
    );
  } catch (error) {
    console.error("[TRADE-DETAIL] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to get trade details",
      500,
      req
    );
  }
});
