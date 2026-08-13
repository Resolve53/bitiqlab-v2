/**
 * Out-of-sample degradation metrics (explicit ratios / deltas).
 * Null when a denominator is invalid.
 */

import type { DegradationReport, MetricsSummary } from "./types";

function ratio(
  num: number | null | undefined,
  den: number | null | undefined
): number | null {
  if (num == null || den == null) return null;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function delta(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  if (a == null || b == null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

export function computeDegradation(
  train: MetricsSummary,
  outOfSample: MetricsSummary
): DegradationReport {
  return {
    expectancyRetention: ratio(outOfSample.expectancy, train.expectancy),
    profitFactorRetention: ratio(outOfSample.profitFactor, train.profitFactor),
    totalReturnDelta: delta(outOfSample.totalReturn, train.totalReturn),
    maxDrawdownDelta: delta(outOfSample.maxDrawdown, train.maxDrawdown),
    sharpeRetention: ratio(outOfSample.sharpeRatio, train.sharpeRatio),
    winRateDelta: delta(outOfSample.winRate, train.winRate),
  };
}
