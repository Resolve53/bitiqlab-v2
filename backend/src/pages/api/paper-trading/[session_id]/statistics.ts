/**
 * GET /api/paper-trading/[session_id]/statistics
 * Get aggregated statistics for a trading session
 *
 * Response:
 * {
 *   status: "success";
 *   session_id: string;
 *   statistics: {
 *     // Basic metrics
 *     total_trades: number;
 *     winning_trades: number;
 *     losing_trades: number;
 *     win_rate: number; // percentage
 *
 *     // P&L metrics
 *     total_pnl: number; // absolute
 *     total_pnl_percent: number;
 *     avg_win: number;
 *     avg_loss: number;
 *     largest_win: number;
 *     largest_loss: number;
 *
 *     // Risk metrics
 *     profit_factor: number; // sum wins / sum losses
 *     expectancy: number; // average profit per trade
 *     sharpe_ratio: number;
 *     max_drawdown: number;
 *     max_drawdown_percent: number;
 *
 *     // Duration metrics
 *     avg_duration_minutes: number;
 *     shortest_duration_minutes: number;
 *     longest_duration_minutes: number;
 *
 *     // MFE/MAE metrics
 *     avg_mfe: number;
 *     avg_mae: number;
 *     avg_efficiency: number; // MFE / MAE
 *
 *     // By symbol breakdown
 *     by_symbol: {
 *       [symbol]: {
 *         total_trades: number;
 *         win_rate: number;
 *         total_pnl: number;
 *       }
 *     }
 *   };
 * }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getDB } from "@/lib/db";

interface SymbolStats {
  total_trades: number;
  win_rate: number;
  total_pnl: number;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { session_id } = req.query;

  if (!session_id || typeof session_id !== "string") {
    return sendError(res, "Invalid session_id", 400, req);
  }

  try {
    const db = getDB();

    // Verify session exists
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Get all trades
    const trades = await db.listPaperTrades(session_id);

    if (trades.length === 0) {
      return sendSuccess(
        res,
        {
          status: "success",
          session_id,
          statistics: {
            total_trades: 0,
            winning_trades: 0,
            losing_trades: 0,
            win_rate: 0,
            total_pnl: 0,
            total_pnl_percent: 0,
            avg_win: 0,
            avg_loss: 0,
            largest_win: 0,
            largest_loss: 0,
            profit_factor: 0,
            expectancy: 0,
            sharpe_ratio: 0,
            max_drawdown: 0,
            max_drawdown_percent: 0,
            avg_duration_minutes: 0,
            shortest_duration_minutes: 0,
            longest_duration_minutes: 0,
            avg_mfe: 0,
            avg_mae: 0,
            avg_efficiency: 0,
            by_symbol: {},
          },
        },
        200,
        req
      );
    }

    // Calculate metrics
    let totalPnL = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let breakEvenTrades = 0;
    let sumWins = 0;
    let sumLosses = 0;
    let largestWin = 0;
    let largestLoss = 0;
    let totalDuration = 0;
    let shortestDuration = Infinity;
    let longestDuration = 0;
    let sumMFE = 0;
    let sumMAE = 0;
    let sumEfficiency = 0;
    let efficiencyCount = 0;
    const equityHistory: number[] = [session.initial_balance];
    const bySymbol: Record<string, SymbolStats> = {};

    for (const trade of trades) {
      const pnl = trade.pnl_percent || 0;
      const pnlAbs = trade.pnl_absolute || 0;

      // Count wins/losses
      if (pnl > 0.01) {
        winningTrades++;
        sumWins += pnlAbs;
        largestWin = Math.max(largestWin, pnlAbs);
      } else if (pnl < -0.01) {
        losingTrades++;
        sumLosses += Math.abs(pnlAbs);
        largestLoss = Math.min(largestLoss, pnlAbs);
      } else {
        breakEvenTrades++;
      }

      totalPnL += pnlAbs;

      // Duration metrics
      const duration =
        (new Date(trade.exit_time).getTime() - new Date(trade.entry_time).getTime()) /
        (1000 * 60);
      totalDuration += duration;
      shortestDuration = Math.min(shortestDuration, duration);
      longestDuration = Math.max(longestDuration, duration);

      // MFE/MAE metrics
      const mfe = trade.max_favorable_excursion || 0;
      const mae = trade.max_adverse_excursion || 0;
      sumMFE += mfe;
      sumMAE += Math.abs(mae);

      if (mae !== 0) {
        const efficiency = mfe / Math.abs(mae);
        sumEfficiency += efficiency;
        efficiencyCount++;
      }

      // Build equity curve
      const lastEquity = equityHistory[equityHistory.length - 1];
      equityHistory.push(lastEquity + pnlAbs);

      // By symbol tracking
      if (!bySymbol[trade.symbol]) {
        bySymbol[trade.symbol] = {
          total_trades: 0,
          win_rate: 0,
          total_pnl: 0,
        };
      }
      bySymbol[trade.symbol].total_trades++;
      bySymbol[trade.symbol].total_pnl += pnlAbs;
    }

    // Calculate derived metrics
    const totalTrades = trades.length;
    const winRate = (winningTrades / totalTrades) * 100;
    const avgWin = winningTrades > 0 ? sumWins / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? sumLosses / losingTrades : 0;
    const profitFactor = sumLosses !== 0 ? sumWins / sumLosses : sumWins > 0 ? Infinity : 0;
    const expectancy = totalPnL / totalTrades;
    const avgDuration = totalDuration / totalTrades;
    const avgMFE = sumMFE / totalTrades;
    const avgMAE = sumMAE / totalTrades;
    const avgEfficiency = efficiencyCount > 0 ? sumEfficiency / efficiencyCount : 0;

    // Calculate Sharpe Ratio
    const returns = trades.map((trade) => trade.pnl_percent || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev !== 0 ? avgReturn / stdDev : 0;

    // Calculate Max Drawdown
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = equityHistory[0];
    for (let i = 1; i < equityHistory.length; i++) {
      const drawdown = peak - equityHistory[i];
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = (drawdown / peak) * 100;
      }
      peak = Math.max(peak, equityHistory[i]);
    }

    // Update by_symbol win rates
    for (const symbol in bySymbol) {
      const symbolTrades = trades.filter((t) => t.symbol === symbol);
      const symbolWins = symbolTrades.filter((t) => (t.pnl_percent || 0) > 0.01).length;
      bySymbol[symbol].win_rate = (symbolWins / symbolTrades.length) * 100;
    }

    return sendSuccess(
      res,
      {
        status: "success",
        session_id,
        statistics: {
          total_trades: totalTrades,
          winning_trades: winningTrades,
          losing_trades: losingTrades,
          break_even_trades: breakEvenTrades,
          win_rate: parseFloat(winRate.toFixed(2)),

          total_pnl: parseFloat(totalPnL.toFixed(2)),
          total_pnl_percent: parseFloat(
            ((totalPnL / session.initial_balance) * 100).toFixed(2)
          ),
          avg_win: parseFloat(avgWin.toFixed(2)),
          avg_loss: parseFloat(avgLoss.toFixed(2)),
          largest_win: parseFloat(largestWin.toFixed(2)),
          largest_loss: parseFloat(largestLoss.toFixed(2)),

          profit_factor: parseFloat(profitFactor.toFixed(2)),
          expectancy: parseFloat(expectancy.toFixed(2)),
          sharpe_ratio: parseFloat(sharpeRatio.toFixed(2)),
          max_drawdown: parseFloat(maxDrawdown.toFixed(2)),
          max_drawdown_percent: parseFloat(maxDrawdownPercent.toFixed(2)),

          avg_duration_minutes: parseFloat(avgDuration.toFixed(2)),
          shortest_duration_minutes: parseFloat(shortestDuration.toFixed(2)),
          longest_duration_minutes: parseFloat(longestDuration.toFixed(2)),

          avg_mfe: parseFloat(avgMFE.toFixed(2)),
          avg_mae: parseFloat(avgMAE.toFixed(2)),
          avg_efficiency: parseFloat(avgEfficiency.toFixed(2)),

          by_symbol: bySymbol,
        },
      },
      200,
      req
    );
  } catch (error) {
    console.error("[STATISTICS] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to calculate statistics",
      500,
      req
    );
  }
});
