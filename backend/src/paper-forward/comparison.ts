/**
 * Historical (Phase 2 validation) vs paper-forward (Phase 4B simulated trades).
 * Metrics are NEVER blended. Side-by-side only.
 */

import type { PaperForwardEvaluation } from "./forward-evaluation";
import type { PaperReadinessDecision } from "./readiness-gate";

export const HISTORICAL_SOURCE = "phase2_historical_validation" as const;
export const FORWARD_SOURCE = "paper_forward_simulated" as const;

export interface HistoricalMetricsSlice {
  source: typeof HISTORICAL_SOURCE;
  validationId: string | null;
  status: string | null;
  gate: unknown;
  validationSplit: Record<string, unknown> | null;
  testSplit: Record<string, unknown> | null;
  validationTradeCount: number | null;
  validationBarCount: number | null;
  notice: string;
}

export interface ForwardMetricsSlice {
  source: typeof FORWARD_SOURCE;
  evaluation: PaperForwardEvaluation | null;
  readiness: PaperReadinessDecision | null;
  notice: string;
}

export interface HistoricalVsForwardComparison {
  blended: false;
  historical: HistoricalMetricsSlice;
  forward: ForwardMetricsSlice;
  disclaimer: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickMetrics(segment: unknown): Record<string, unknown> | null {
  const rec = asRecord(segment);
  if (!rec) return null;
  const metrics = asRecord(rec.metrics);
  if (!metrics) return null;
  return {
    totalTrades: metrics.totalTrades,
    winRate: metrics.winRate,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    totalReturn: metrics.totalReturn,
    maxDrawdown: metrics.maxDrawdown,
    sharpeRatio: metrics.sharpeRatio,
    netProfit: metrics.netProfit,
  };
}

export function extractHistoricalSlice(
  validation: any | null,
  validationId: string | null
): HistoricalMetricsSlice {
  const report = asRecord(validation?.report);
  const chronological = asRecord(report?.chronological);
  const valSeg = chronological?.validation;
  const testSeg = chronological?.test;
  const valRec = asRecord(valSeg);
  return {
    source: HISTORICAL_SOURCE,
    validationId: validationId || validation?.id || null,
    status: validation?.status ?? null,
    gate: validation?.gate ?? null,
    validationSplit: pickMetrics(valSeg),
    testSplit: pickMetrics(testSeg),
    validationTradeCount:
      valRec?.tradeCount != null ? Number(valRec.tradeCount) : null,
    validationBarCount:
      valRec?.barCount != null ? Number(valRec.barCount) : null,
    notice:
      "HISTORICAL — Phase 2 validation / backtest metrics. Not paper-forward. Do not treat as live or simulated-forward performance.",
  };
}

export function buildHistoricalVsForwardComparison(params: {
  validation: any | null;
  validationId: string | null;
  evaluation: PaperForwardEvaluation | null;
  readiness: PaperReadinessDecision | null;
}): HistoricalVsForwardComparison {
  return {
    blended: false,
    historical: extractHistoricalSlice(params.validation, params.validationId),
    forward: {
      source: FORWARD_SOURCE,
      evaluation: params.evaluation,
      readiness: params.readiness,
      notice:
        "FORWARD — Phase 4B simulated paper trades only. Never copied from historical validation.",
    },
    disclaimer:
      "Historical and paper-forward metrics are stored and displayed separately. They are never averaged, blended, or substituted for each other.",
  };
}
