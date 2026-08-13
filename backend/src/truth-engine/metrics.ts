/**
 * Metrics from real completed trades only.
 * Sharpe/Sortino: daily equity return series; null if insufficient data.
 *
 * Methodology:
 * - Build a daily equity series from the equity timeline (last equity of each UTC day).
 * - Daily return r_t = E_t / E_{t-1} - 1
 * - Sharpe = mean(r) / std(r) * sqrt(365)  (crypto calendar days)
 * - Sortino = mean(r) / downsideStd(r) * sqrt(365) where downside uses r < 0
 * - Risk-free rate assumed 0 for Phase 1 (documented).
 * - If fewer than 2 daily returns, return null (never invent a number).
 */

import type {
  BacktestMetrics,
  BacktestTradeRecord,
  EquityPoint,
} from "./types";

export function calculateMetrics(params: {
  trades: BacktestTradeRecord[];
  equityTimeline: { timestamp: Date; equity: number }[];
  initialCapital: number;
  totalBars: number;
  barsInPosition: number;
}): BacktestMetrics {
  const { trades, equityTimeline, initialCapital, totalBars, barsInPosition } =
    params;

  const winning = trades.filter((t) => t.netPnl > 0);
  const losing = trades.filter((t) => t.netPnl < 0);
  const grossProfit = winning.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losing.reduce((s, t) => s + t.netPnl, 0));
  const netProfit = trades.reduce((s, t) => s + t.netPnl, 0);
  const finalEquity =
    equityTimeline.length > 0
      ? equityTimeline[equityTimeline.length - 1].equity
      : initialCapital;
  const totalReturn =
    initialCapital > 0 ? (finalEquity - initialCapital) / initialCapital : 0;

  const winRate = trades.length > 0 ? winning.length / trades.length : 0;
  // When there are wins but zero losses, profit factor is undefined → null
  const pf =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? null
        : trades.length === 0
          ? null
          : 0;

  const averageWin =
    winning.length > 0
      ? winning.reduce((s, t) => s + t.netPnl, 0) / winning.length
      : null;
  const averageLoss =
    losing.length > 0
      ? losing.reduce((s, t) => s + t.netPnl, 0) / losing.length
      : null;
  const expectancy =
    trades.length > 0 ? netProfit / trades.length : null;
  const averageRealizedR =
    trades.length > 0
      ? trades.reduce((s, t) => s + t.realizedR, 0) / trades.length
      : null;

  const { maxConsecutiveWins, maxConsecutiveLosses } =
    consecutiveStreaks(trades);

  const durations = trades.map(
    (t) => new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()
  );
  const averageTradeDurationMs =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

  const exposureTime = totalBars > 0 ? barsInPosition / totalBars : 0;
  const maxDrawdown = calcMaxDrawdown(equityTimeline.map((e) => e.equity));

  const equityCurve: EquityPoint[] = equityTimeline.map((e) => ({
    timestamp: e.timestamp.toISOString(),
    equity: e.equity,
    cumulativeReturn:
      initialCapital > 0 ? (e.equity - initialCapital) / initialCapital : 0,
  }));

  const { sharpeRatio, sortinoRatio } = calcRiskAdjusted(equityTimeline);

  return {
    totalTrades: trades.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    winRate,
    grossProfit,
    grossLoss,
    netProfit,
    totalReturn,
    profitFactor: pf,
    averageWin,
    averageLoss,
    expectancy,
    averageRealizedR,
    maxDrawdown,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    averageTradeDurationMs,
    exposureTime,
    finalEquity,
    sharpeRatio,
    sortinoRatio,
    equityCurve,
  };
}

function consecutiveStreaks(trades: BacktestTradeRecord[]): {
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
} {
  let maxW = 0;
  let maxL = 0;
  let curW = 0;
  let curL = 0;
  for (const t of trades) {
    if (t.netPnl > 0) {
      curW++;
      curL = 0;
      maxW = Math.max(maxW, curW);
    } else if (t.netPnl < 0) {
      curL++;
      curW = 0;
      maxL = Math.max(maxL, curL);
    } else {
      curW = 0;
      curL = 0;
    }
  }
  return { maxConsecutiveWins: maxW, maxConsecutiveLosses: maxL };
}

export function calcMaxDrawdown(equity: number[]): number {
  if (equity.length < 2) return 0;
  let peak = equity[0];
  let maxDd = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    if (peak > 0) {
      const dd = (peak - e) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

function dailyEquitySeries(
  timeline: { timestamp: Date; equity: number }[]
): number[] {
  if (timeline.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const p of timeline) {
    const key = p.timestamp.toISOString().slice(0, 10);
    byDay.set(key, p.equity); // last equity of that UTC day
  }
  const keys = [...byDay.keys()].sort();
  return keys.map((k) => byDay.get(k)!);
}

function calcRiskAdjusted(timeline: { timestamp: Date; equity: number }[]): {
  sharpeRatio: number | null;
  sortinoRatio: number | null;
} {
  const daily = dailyEquitySeries(timeline);
  if (daily.length < 3) {
    return { sharpeRatio: null, sortinoRatio: null };
  }
  const returns: number[] = [];
  for (let i = 1; i < daily.length; i++) {
    if (daily[i - 1] > 0) {
      returns.push(daily[i] / daily[i - 1] - 1);
    }
  }
  if (returns.length < 2) {
    return { sharpeRatio: null, sortinoRatio: null };
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVar =
    downsideReturns.length > 0
      ? downsideReturns.reduce((s, r) => s + r * r, 0) / returns.length
      : 0;
  const downsideStd = Math.sqrt(downsideVar);

  const ann = Math.sqrt(365);
  const sharpeRatio = std > 0 ? (mean / std) * ann : null;
  const sortinoRatio = downsideStd > 0 ? (mean / downsideStd) * ann : null;

  return { sharpeRatio, sortinoRatio };
}

/** Count bars where a position was open (approx from trades + bar timestamps). */
export function estimateBarsInPosition(
  trades: BacktestTradeRecord[],
  bars: { timestamp: Date }[]
): number {
  if (trades.length === 0 || bars.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].timestamp.getTime();
    const inPos = trades.some((tr) => {
      const a = new Date(tr.entryTime).getTime();
      const b = new Date(tr.exitTime).getTime();
      return t >= a && t <= b;
    });
    if (inPos) count++;
  }
  return count;
}
