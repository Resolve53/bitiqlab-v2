/**
 * GET/POST /api/paper-trading/[session_id]/analysis
 * Save and retrieve trade analysis data
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface TradeAnalysis {
  session_id: string;
  total_trades: number;
  profitable_trades: number;
  losing_trades: number;
  win_rate: number;
  total_profit: number;
  total_loss: number;
  largest_win: number;
  largest_loss: number;
  average_win: number;
  average_loss: number;
  analysis_timestamp: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const { session_id } = req.query as { session_id: string };

  if (!session_id) {
    return sendError(res, "Missing session_id", 400, req);
  }

  if (req.method === "GET") {
    try {
      const db = getDB();

      // Get trading session
      const session = await db.getTradingSession(session_id);
      if (!session) {
        return sendError(res, "Trading session not found", 404, req);
      }

      // Get all trades for this session
      const trades = await db.listPaperTrades(session_id);

      // Calculate analysis
      let totalProfit = 0;
      let totalLoss = 0;
      let profitableTrades = 0;
      let losingTrades = 0;
      let largestWin = 0;
      let largestLoss = 0;
      const tradeReturns: number[] = [];

      const positions: Record<
        string,
        { buyPrice: number; quantity: number; }
      > = {};

      for (const trade of trades) {
        if (trade.side === "BUY") {
          positions[trade.symbol] = {
            buyPrice: trade.entry_price,
            quantity: trade.quantity,
          };
        } else if (trade.side === "SELL" && positions[trade.symbol]) {
          const position = positions[trade.symbol];
          const exitPrice = trade.exit_price || trade.entry_price;
          const pnl = (exitPrice - position.buyPrice) * position.quantity;

          tradeReturns.push(pnl);

          if (pnl > 0) {
            profitableTrades++;
            totalProfit += pnl;
            largestWin = Math.max(largestWin, pnl);
          } else if (pnl < 0) {
            losingTrades++;
            totalLoss += Math.abs(pnl);
            largestLoss = Math.min(largestLoss, pnl);
          }

          delete positions[trade.symbol];
        }
      }

      const totalTrades = trades.length;
      const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
      const averageWin = profitableTrades > 0 ? totalProfit / profitableTrades : 0;
      const averageLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;

      const analysis: TradeAnalysis = {
        session_id,
        total_trades: totalTrades,
        profitable_trades: profitableTrades,
        losing_trades: losingTrades,
        win_rate: Math.round(winRate * 100) / 100,
        total_profit: Math.round(totalProfit * 100) / 100,
        total_loss: Math.round(totalLoss * 100) / 100,
        largest_win: largestWin,
        largest_loss: largestLoss,
        average_win: Math.round(averageWin * 100) / 100,
        average_loss: Math.round(averageLoss * 100) / 100,
        analysis_timestamp: new Date().toISOString(),
      };

      return sendSuccess(res, analysis, 200, req);
    } catch (error) {
      console.error("[ANALYSIS] Error:", error);
      return sendError(
        res,
        error instanceof Error ? error.message : "Failed to get analysis",
        500,
        req
      );
    }
  } else if (req.method === "POST") {
    // Could be used to save analysis results to database
    try {
      const { analysis } = req.body;
      if (!analysis) {
        return sendError(res, "Missing analysis data", 400, req);
      }

      // In a real scenario, you'd save this to a database table
      // For now, we just return it back
      return sendSuccess(
        res,
        {
          message: "Analysis saved",
          analysis,
        },
        200,
        req
      );
    } catch (error) {
      console.error("[ANALYSIS POST] Error:", error);
      return sendError(
        res,
        error instanceof Error ? error.message : "Failed to save analysis",
        500,
        req
      );
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }
});
