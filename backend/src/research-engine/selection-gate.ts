/**
 * Deterministic KEEP/REJECT — Claude never decides.
 * Uses VALIDATION metrics only (+ optional cost stress on validation).
 */

import type { MetricsSummary } from "@/validation-engine";
import type { ResearchConfig } from "./config";
import type {
  RobustnessMetrics,
  SelectionCheck,
  SelectionResult,
} from "./types";

export function evaluateSelection(params: {
  baselineValidation: MetricsSummary;
  candidateTrain: MetricsSummary;
  candidateValidation: MetricsSummary;
  baselineTrain: MetricsSummary;
  robustness: RobustnessMetrics | null;
  config: ResearchConfig;
  isDuplicate: boolean;
  duplicateOf?: string | null;
}): SelectionResult {
  const checks: Record<string, SelectionCheck> = {};
  const reasons: string[] = [];

  const add = (check: SelectionCheck) => {
    checks[check.id] = check;
    if (!check.passed) reasons.push(`${check.id}: ${check.detail}`);
  };

  const cVal = params.candidateValidation;
  const bVal = params.baselineValidation;
  const cTrain = params.candidateTrain;
  const bTrain = params.baselineTrain;

  add({
    id: "not_duplicate",
    passed: !params.isDuplicate,
    detail: params.isDuplicate
      ? `Duplicate of ${params.duplicateOf ?? "prior candidate"}`
      : "Unique candidate hash",
  });

  add({
    id: "validation_sample",
    passed: cVal.totalTrades >= params.config.minimumValidationTrades,
    detail: `Validation trades ${cVal.totalTrades} (need ≥ ${params.config.minimumValidationTrades})`,
    value: cVal.totalTrades,
  });

  add({
    id: "validation_expectancy",
    passed:
      cVal.expectancy != null &&
      cVal.expectancy > params.config.minValidationExpectancy,
    detail:
      cVal.expectancy == null
        ? "Validation expectancy is null"
        : `Validation expectancy ${cVal.expectancy} (need > ${params.config.minValidationExpectancy})`,
    value: cVal.expectancy,
  });

  add({
    id: "validation_profit_factor",
    passed:
      cVal.profitFactor != null &&
      cVal.profitFactor >= params.config.minValidationProfitFactor,
    detail:
      cVal.profitFactor == null
        ? "Validation PF is null"
        : `Validation PF ${cVal.profitFactor} (need ≥ ${params.config.minValidationProfitFactor})`,
    value: cVal.profitFactor,
  });

  add({
    id: "validation_max_drawdown",
    passed: cVal.maxDrawdown <= params.config.maxDrawdown,
    detail: `Validation DD ${cVal.maxDrawdown} (need ≤ ${params.config.maxDrawdown})`,
    value: cVal.maxDrawdown,
  });

  // Must not be TRAIN-only improvement
  const trainBetter =
    cTrain.expectancy != null &&
    bTrain.expectancy != null &&
    cTrain.expectancy > bTrain.expectancy;
  const valBetterOrEqual =
    cVal.expectancy != null &&
    bVal.expectancy != null &&
    cVal.expectancy >=
      bVal.expectancy + params.config.minExpectancyImprovement;
  const valDegraded =
    cVal.expectancy != null &&
    bVal.expectancy != null &&
    cVal.expectancy < bVal.expectancy;

  add({
    id: "not_train_only_improvement",
    passed: !(trainBetter && valDegraded),
    detail:
      trainBetter && valDegraded
        ? "TRAIN improved but VALIDATION degraded — reject"
        : "Not a TRAIN-only improvement",
  });

  add({
    id: "beats_baseline_expectancy",
    passed: valBetterOrEqual,
    detail:
      cVal.expectancy == null || bVal.expectancy == null
        ? "Cannot compare expectancy to baseline"
        : `Candidate VAL expectancy ${cVal.expectancy} vs baseline ${bVal.expectancy}`,
    value: { candidate: cVal.expectancy, baseline: bVal.expectancy },
  });

  // Catastrophic DD increase
  const ddIncrease = cVal.maxDrawdown - bVal.maxDrawdown;
  add({
    id: "no_catastrophic_drawdown",
    passed: ddIncrease <= params.config.maxDrawdownIncreaseAbs,
    detail: `DD increase ${ddIncrease} (max allowed ${params.config.maxDrawdownIncreaseAbs})`,
    value: { candidate: cVal.maxDrawdown, baseline: bVal.maxDrawdown },
  });

  // Do not KEEP on win-rate / Sharpe alone — we simply never check them as primary
  add({
    id: "not_winrate_or_sharpe_primary",
    passed: true,
    detail:
      "Selection ignores win-rate and Sharpe as primary KEEP criteria (documented)",
  });

  if (params.config.requireCostStress15Positive) {
    const ok =
      params.robustness?.costStress15.positiveExpectancy === true;
    add({
      id: "cost_stress_1_5",
      passed: ok,
      detail: ok
        ? "Cost ×1.5 expectancy positive on VALIDATION"
        : "Cost ×1.5 expectancy not positive on VALIDATION",
      value: params.robustness?.costStress15 ?? null,
    });
  }

  const failed = Object.values(checks).filter((c) => !c.passed);
  return {
    decision: failed.length === 0 ? "KEEP" : "REJECT",
    reasons: reasons,
    checks,
  };
}
