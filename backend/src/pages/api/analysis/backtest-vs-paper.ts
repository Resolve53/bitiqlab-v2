/**
 * GET /api/analysis/backtest-vs-paper?strategy_id=xxx&session_id=yyy
 * Compare backtest results with live paper trading performance
 *
 * Query parameters:
 * - strategy_id: string (required)
 * - session_id: string (required)
 *
 * Response:
 * {
 *   status: "success";
 *   strategy_id: string;
 *   session_id: string;
 *   comparison: {
 *     backtest: { ... metrics ... };
 *     paper_trading: { ... metrics ... };
 *     divergence: {
 *       win_rate_diff: number;
 *       sharpe_diff: number;
 *       return_diff: number;
 *       max_drawdown_diff: number;
 *       summary: string;
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

  const { strategy_id, session_id } = req.query;

  if (!strategy_id || typeof strategy_id !== "string") {
    return sendError(res, "Missing or invalid strategy_id", 400, req);
  }

  if (!session_id || typeof session_id !== "string") {
    return sendError(res, "Missing or invalid session_id", 400, req);
  }

  try {
    const db = getDB();

    // Fetch strategy
    const strategy = await db.getStrategy(strategy_id);
    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    // Fetch trading session
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Verify strategy and session match
    if (session.strategy_id !== strategy_id) {
      return sendError(
        res,
        "Strategy ID does not match session strategy",
        400,
        req
      );
    }

    // Get backtest data from strategy
    const backtestMetrics = {
      win_rate: strategy.win_rate || 0,
      sharpe_ratio: strategy.current_sharpe || 0,
      total_return: strategy.total_return || 0,
      max_drawdown: strategy.max_drawdown || 0,
      total_trades: (strategy.winning_trades || 0) + (strategy.losing_trades || 0),
      profit_factor: 0, // Would need to calculate from backtest
    };

    // Calculate profit factor from backtest
    if (strategy.winning_trades && strategy.losing_trades) {
      // This is estimated; real profit factor needs actual P&L data
      backtestMetrics.profit_factor = strategy.winning_trades / Math.max(strategy.losing_trades, 1);
    }

    // Get paper trading data
    const paperTrades = await db.listPaperTrades(session_id);

    // Calculate paper trading metrics
    let totalPnL = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let returns: number[] = [];
    let equityHistory = [session.initial_balance];

    for (const trade of paperTrades) {
      const pnl = trade.pnl_percent || 0;
      const pnlAbs = trade.pnl_absolute || 0;

      if (pnl > 0.01) {
        winningTrades++;
      } else if (pnl < -0.01) {
        losingTrades++;
      }

      totalPnL += pnlAbs;
      returns.push(pnl);

      const lastEquity = equityHistory[equityHistory.length - 1];
      equityHistory.push(lastEquity + pnlAbs);
    }

    const paperWinRate = paperTrades.length > 0
      ? (winningTrades / paperTrades.length) * 100
      : 0;

    // Calculate Sharpe Ratio for paper trading
    let paperSharpe = 0;
    if (returns.length > 0) {
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      paperSharpe = stdDev !== 0 ? avgReturn / stdDev : 0;
    }

    // Calculate Max Drawdown for paper trading
    let paperMaxDrawdown = 0;
    let peak = equityHistory[0];
    for (let i = 1; i < equityHistory.length; i++) {
      const drawdown = peak - equityHistory[i];
      paperMaxDrawdown = Math.max(paperMaxDrawdown, drawdown);
      peak = Math.max(peak, equityHistory[i]);
    }

    const paperReturn = session.initial_balance > 0
      ? ((totalPnL / session.initial_balance) * 100)
      : 0;

    const paperMetrics = {
      win_rate: paperWinRate,
      sharpe_ratio: paperSharpe,
      total_return: paperReturn,
      max_drawdown: paperMaxDrawdown,
      total_trades: paperTrades.length,
      profit_factor: winningTrades > 0 && losingTrades > 0
        ? (winningTrades / losingTrades)
        : winningTrades > 0 ? Infinity : 0,
    };

    // Calculate divergence
    const winRateDiff = paperMetrics.win_rate - backtestMetrics.win_rate;
    const sharpeDiff = paperMetrics.sharpe_ratio - backtestMetrics.sharpe_ratio;
    const returnDiff = paperMetrics.total_return - backtestMetrics.total_return;
    const drawdownDiff = paperMetrics.max_drawdown - backtestMetrics.max_drawdown;

    let divergenceSummary = "";
    const issues: string[] = [];

    if (Math.abs(winRateDiff) > 20) {
      issues.push(
        `Win rate divergence: ${Math.abs(winRateDiff).toFixed(1)}% ` +
        (winRateDiff > 0 ? "better" : "worse") + " in paper trading"
      );
    }

    if (Math.abs(sharpeDiff) > 1) {
      issues.push(
        `Sharpe ratio divergence: ${Math.abs(sharpeDiff).toFixed(2)} ` +
        (sharpeDiff > 0 ? "better" : "worse") + " in paper trading"
      );
    }

    if (Math.abs(returnDiff) > 10) {
      issues.push(
        `Return divergence: ${Math.abs(returnDiff).toFixed(1)}% ` +
        (returnDiff > 0 ? "better" : "worse") + " in paper trading"
      );
    }

    if (drawdownDiff > 10) {
      issues.push(
        `Drawdown worse by ${drawdownDiff.toFixed(1)}% in paper trading`
      );
    }

    if (issues.length === 0) {
      divergenceSummary = "Paper trading performance aligns well with backtest";
    } else if (issues.length <= 2) {
      divergenceSummary = issues.join("; ");
    } else {
      divergenceSummary = `${issues.length} metric divergences detected - review data quality and execution`;
    }

    return sendSuccess(
      res,
      {
        status: "success",
        strategy_id,
        session_id,
        comparison: {
          backtest: {
            total_trades: backtestMetrics.total_trades,
            win_rate: parseFloat(backtestMetrics.win_rate.toFixed(2)),
            sharpe_ratio: parseFloat(backtestMetrics.sharpe_ratio.toFixed(2)),
            total_return: parseFloat(backtestMetrics.total_return.toFixed(2)),
            max_drawdown: parseFloat(backtestMetrics.max_drawdown.toFixed(2)),
            profit_factor: parseFloat(backtestMetrics.profit_factor.toFixed(2)),
          },
          paper_trading: {
            total_trades: paperMetrics.total_trades,
            win_rate: parseFloat(paperMetrics.win_rate.toFixed(2)),
            sharpe_ratio: parseFloat(paperMetrics.sharpe_ratio.toFixed(2)),
            total_return: parseFloat(paperMetrics.total_return.toFixed(2)),
            max_drawdown: parseFloat(paperMetrics.max_drawdown.toFixed(2)),
            profit_factor: parseFloat(
              (paperMetrics.profit_factor === Infinity
                ? 999
                : paperMetrics.profit_factor).toFixed(2)
            ),
          },
          divergence: {
            win_rate_diff: parseFloat(winRateDiff.toFixed(2)),
            sharpe_diff: parseFloat(sharpeDiff.toFixed(2)),
            return_diff: parseFloat(returnDiff.toFixed(2)),
            max_drawdown_diff: parseFloat(drawdownDiff.toFixed(2)),
            summary: divergenceSummary,
          },
        },
      },
      200,
      req
    );
  } catch (error) {
    console.error("[BACKTEST-VS-PAPER] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to compare backtest vs paper",
      500,
      req
    );
  }
});
