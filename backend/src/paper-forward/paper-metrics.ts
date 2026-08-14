/**
 * Paper-forward metrics from simulated trades only.
 * Never copy historical backtest metrics into paper performance.
 */

import { calcMaxDrawdown } from "@/truth-engine/metrics";
import type { PaperExecutionState, PaperSessionMetrics } from "./types";

export function buildPaperMetrics(params: {
  initialCapital: number;
  state: PaperExecutionState;
  unrealizedPnl: number;
  lastProcessedCandleTs: string | null;
  equityTimeline?: number[];
}): PaperSessionMetrics {
  const { initialCapital, state, unrealizedPnl, lastProcessedCandleTs } = params;
  const currentEquity = state.equity + unrealizedPnl;
  const maxDrawdown =
    params.equityTimeline && params.equityTimeline.length >= 2
      ? Math.max(state.maxDrawdown, calcMaxDrawdown(params.equityTimeline))
      : state.maxDrawdown;
  const winRate =
    state.totalTrades > 0 ? state.wins / state.totalTrades : 0;

  return {
    startingCapital: initialCapital,
    currentEquity,
    realizedPnl: state.realizedPnl,
    unrealizedPnl,
    totalTrades: state.totalTrades,
    wins: state.wins,
    losses: state.losses,
    winRate,
    maxDrawdown,
    feesPaid: state.feesPaid,
    lastProcessedCandleTs,
    source: "paper_forward_simulated",
  };
}
