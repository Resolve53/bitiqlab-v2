/**
 * Phase 4C forward evaluation — ONLY Phase 4B simulated trades.
 * Never copies historical backtest / Phase 2 validation metrics.
 */

import { calcMaxDrawdown } from "@/truth-engine/metrics";
import type { PaperForwardSession, PaperForwardTradeRow } from "./types";

export interface EquityCurvePoint {
  timestamp: string;
  equity: number;
  realizedPnl: number;
  source: "paper_forward_simulated";
}

export interface PaperForwardEvaluation {
  source: "paper_forward_simulated";
  startingCapital: number;
  currentEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  firstHalfExpectancy: number | null;
  secondHalfExpectancy: number | null;
  elapsedMs: number;
  elapsedHours: number;
  closedCandlesProcessed: number;
  lastProcessedCandleTs: string | null;
  equityCurve: EquityCurvePoint[];
  evaluatedAt: string;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function maxConsecutiveLosses(pnls: number[]): number {
  let max = 0;
  let cur = 0;
  for (const p of pnls) {
    if (p < 0) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

export function halfExpectancy(pnls: number[]): {
  first: number | null;
  second: number | null;
} {
  if (pnls.length < 2) return { first: null, second: null };
  const mid = Math.floor(pnls.length / 2);
  const a = pnls.slice(0, mid);
  const b = pnls.slice(mid);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  return { first: avg(a), second: avg(b) };
}

export function evaluatePaperForward(params: {
  session: PaperForwardSession;
  trades: PaperForwardTradeRow[];
  closedCandlesProcessed: number;
  now?: Date;
}): PaperForwardEvaluation {
  const now = params.now ?? new Date();
  const initial = num(params.session.initial_balance, 0);
  const closed = params.trades
    .filter((t) => t.status === "closed")
    .slice()
    .sort(
      (a, b) =>
        new Date(a.exit_candle_ts || a.created_at || 0).getTime() -
        new Date(b.exit_candle_ts || b.created_at || 0).getTime()
    );
  const open = params.trades.filter((t) => t.status === "open");
  const pnls = closed.map((t) => num(t.realized_pnl));
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const realizedPnl = pnls.reduce((s, p) => s + p, 0);
  const feesPaid = params.trades.reduce((s, t) => s + num(t.fee), 0);
  const unrealizedPnl = num(params.session.unrealized_pnl);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
  const expectancy =
    closed.length > 0 ? realizedPnl / closed.length : null;
  const profitFactor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? null
        : closed.length === 0
          ? null
          : 0;
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;

  const startIso =
    params.session.started_at ||
    params.session.start_time ||
    params.session.created_at ||
    now.toISOString();
  const endIso =
    params.session.completed_at ||
    params.session.failed_at ||
    params.session.aborted_at ||
    now.toISOString();
  const elapsedMs = Math.max(
    0,
    new Date(endIso).getTime() - new Date(startIso).getTime()
  );

  const equityCurve: EquityCurvePoint[] = [
    {
      timestamp: startIso,
      equity: initial,
      realizedPnl: 0,
      source: "paper_forward_simulated",
    },
  ];
  let equity = initial;
  let cum = 0;
  for (const t of closed) {
    const pnl = num(t.realized_pnl);
    equity += pnl;
    cum += pnl;
    equityCurve.push({
      timestamp: t.exit_candle_ts || t.created_at || endIso,
      equity,
      realizedPnl: cum,
      source: "paper_forward_simulated",
    });
  }
  const marked = equity + unrealizedPnl;
  if (unrealizedPnl !== 0) {
    equityCurve.push({
      timestamp: params.session.last_processed_candle_ts || endIso,
      equity: marked,
      realizedPnl: cum,
      source: "paper_forward_simulated",
    });
  }

  const halves = halfExpectancy(pnls);
  const maxDd = calcMaxDrawdown(equityCurve.map((p) => p.equity));

  return {
    source: "paper_forward_simulated",
    startingCapital: initial,
    currentEquity: marked,
    realizedPnl,
    unrealizedPnl,
    feesPaid,
    closedTrades: closed.length,
    openTrades: open.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    expectancy,
    profitFactor,
    maxDrawdown: maxDd,
    maxConsecutiveLosses: maxConsecutiveLosses(pnls),
    firstHalfExpectancy: halves.first,
    secondHalfExpectancy: halves.second,
    elapsedMs,
    elapsedHours: elapsedMs / 3_600_000,
    closedCandlesProcessed: params.closedCandlesProcessed,
    lastProcessedCandleTs: params.session.last_processed_candle_ts ?? null,
    equityCurve,
    evaluatedAt: now.toISOString(),
  };
}
