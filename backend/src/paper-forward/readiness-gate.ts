/**
 * Deterministic paper-forward promotion-readiness gate.
 * Claude is not consulted. force=true is not a valid input here.
 */

import type { PaperForwardSession, ValidationGateStatus } from "./types";
import type { PaperForwardEvaluation } from "./forward-evaluation";
import {
  getPaperReadinessConfig,
  type PaperReadinessConfig,
} from "./readiness-config";

export type PaperReadinessStatus =
  | "NOT_READY"
  | "READY_FOR_REVIEW"
  | "REJECT";

export interface PaperReadinessCheck {
  id: string;
  passed: boolean;
  hard: boolean;
  sampleGated: boolean;
  detail: string;
  value?: unknown;
}

export interface PaperReadinessDecision {
  status: PaperReadinessStatus;
  reasons: string[];
  checks: Record<string, PaperReadinessCheck>;
  config: PaperReadinessConfig;
  evaluationSource: "paper_forward_simulated";
  historicalSourceExcluded: true;
}

export interface ReadinessContext {
  session: PaperForwardSession;
  evaluation: PaperForwardEvaluation;
  snapshotOk: boolean;
  snapshotError?: string;
  validationStatus: ValidationGateStatus | null;
  validationId: string | null;
  tickErrorCount?: number;
  config?: Partial<PaperReadinessConfig>;
}

function add(
  checks: Record<string, PaperReadinessCheck>,
  reasons: string[],
  check: PaperReadinessCheck
) {
  checks[check.id] = check;
  if (!check.passed) reasons.push(`${check.id}: ${check.detail}`);
}

export function evaluatePaperReadiness(
  ctx: ReadinessContext
): PaperReadinessDecision {
  const config = getPaperReadinessConfig(ctx.config);
  const checks: Record<string, PaperReadinessCheck> = {};
  const reasons: string[] = [];
  const ev = ctx.evaluation;

  const sampleOk =
    ev.closedTrades >= config.minClosedTrades &&
    ev.closedCandlesProcessed >= config.minClosedCandles &&
    ev.elapsedHours >= config.minElapsedHours;

  add(checks, reasons, {
    id: "sample_trades",
    passed: ev.closedTrades >= config.minClosedTrades,
    hard: false,
    sampleGated: false,
    detail: `Closed simulated trades ${ev.closedTrades} (min ${config.minClosedTrades})`,
    value: ev.closedTrades,
  });
  add(checks, reasons, {
    id: "sample_candles",
    passed: ev.closedCandlesProcessed >= config.minClosedCandles,
    hard: false,
    sampleGated: false,
    detail: `Closed candles processed ${ev.closedCandlesProcessed} (min ${config.minClosedCandles})`,
    value: ev.closedCandlesProcessed,
  });
  add(checks, reasons, {
    id: "sample_duration",
    passed: ev.elapsedHours >= config.minElapsedHours,
    hard: false,
    sampleGated: false,
    detail: `Elapsed ${ev.elapsedHours.toFixed(2)}h (min ${config.minElapsedHours}h)`,
    value: ev.elapsedHours,
  });

  add(checks, reasons, {
    id: "session_integrity",
    passed: ctx.session.lifecycle_status !== "FAILED",
    hard: true,
    sampleGated: false,
    detail:
      ctx.session.lifecycle_status === "FAILED"
        ? `Session FAILED: ${ctx.session.failure_reason || "unknown"}`
        : `Lifecycle ${ctx.session.lifecycle_status}`,
    value: ctx.session.lifecycle_status,
  });

  add(checks, reasons, {
    id: "snapshot_integrity",
    passed: ctx.snapshotOk,
    hard: true,
    sampleGated: false,
    detail: ctx.snapshotOk
      ? "Frozen snapshot hash verified"
      : ctx.snapshotError || "Snapshot hash mismatch or corrupt",
    value: ctx.session.snapshot_hash,
  });

  const valOk =
    ctx.validationStatus === "pass" ||
    (ctx.validationStatus === "conditional" &&
      Boolean(ctx.session.conditional_acknowledged));
  add(checks, reasons, {
    id: "validation_provenance",
    passed: Boolean(ctx.validationId) && valOk,
    hard: true,
    sampleGated: false,
    detail: !ctx.validationId
      ? "Missing validation_id"
      : ctx.validationStatus === "fail"
        ? "FAIL validation cannot be paper-promoted"
        : ctx.validationStatus === "conditional" &&
            !ctx.session.conditional_acknowledged
          ? "CONDITIONAL validation lacks acknowledgement"
          : `Validation ${ctx.validationStatus}`,
    value: ctx.validationStatus,
  });

  add(checks, reasons, {
    id: "tick_errors",
    passed: (ctx.tickErrorCount ?? 0) < config.maxTickErrors,
    hard: true,
    sampleGated: false,
    detail: `Tick error count ${ctx.tickErrorCount ?? 0} (max ${config.maxTickErrors})`,
    value: ctx.tickErrorCount ?? 0,
  });

  add(checks, reasons, {
    id: "drawdown",
    passed: ev.maxDrawdown <= config.maxDrawdown,
    hard: true,
    sampleGated: false,
    detail: `Max drawdown ${(ev.maxDrawdown * 100).toFixed(2)}% (max ${(config.maxDrawdown * 100).toFixed(0)}%)`,
    value: ev.maxDrawdown,
  });

  const expectancyPass =
    ev.expectancy != null && ev.expectancy >= config.minExpectancy;
  add(checks, reasons, {
    id: "expectancy",
    passed: sampleOk ? expectancyPass : true,
    hard: true,
    sampleGated: true,
    detail:
      ev.expectancy == null
        ? "Expectancy undefined (no closed trades)"
        : `Expectancy ${ev.expectancy.toFixed(4)} (min ${config.minExpectancy})`,
    value: ev.expectancy,
  });

  const pfPass =
    ev.profitFactor == null
      ? ev.closedTrades > 0 && (ev.expectancy ?? 0) > 0
      : ev.profitFactor >= config.minProfitFactor;
  add(checks, reasons, {
    id: "profit_factor",
    passed: sampleOk ? pfPass : true,
    hard: true,
    sampleGated: true,
    detail:
      ev.profitFactor == null
        ? "Profit factor undefined (no losses or no trades)"
        : `Profit factor ${ev.profitFactor.toFixed(3)} (min ${config.minProfitFactor})`,
    value: ev.profitFactor,
  });

  add(checks, reasons, {
    id: "win_rate",
    passed: sampleOk ? ev.winRate >= config.minWinRate : true,
    hard: true,
    sampleGated: true,
    detail: `Win rate ${(ev.winRate * 100).toFixed(1)}% (min ${(config.minWinRate * 100).toFixed(0)}%)`,
    value: ev.winRate,
  });

  const consistencyPass =
    ev.firstHalfExpectancy != null &&
    ev.secondHalfExpectancy != null &&
    ev.firstHalfExpectancy >= config.minHalfExpectancy &&
    ev.secondHalfExpectancy >= config.minHalfExpectancy;
  add(checks, reasons, {
    id: "consistency_halves",
    passed: sampleOk ? consistencyPass : true,
    hard: true,
    sampleGated: true,
    detail: `Half expectancies ${ev.firstHalfExpectancy ?? "n/a"} / ${ev.secondHalfExpectancy ?? "n/a"} (min ${config.minHalfExpectancy})`,
    value: {
      first: ev.firstHalfExpectancy,
      second: ev.secondHalfExpectancy,
    },
  });

  add(checks, reasons, {
    id: "consecutive_losses",
    passed: sampleOk
      ? ev.maxConsecutiveLosses <= config.maxConsecutiveLosses
      : true,
    hard: true,
    sampleGated: true,
    detail: `Max consecutive losses ${ev.maxConsecutiveLosses} (max ${config.maxConsecutiveLosses})`,
    value: ev.maxConsecutiveLosses,
  });

  const hardFail = Object.values(checks).some((c) => c.hard && !c.passed);
  const sampleFail = Object.values(checks).some(
    (c) => !c.hard && !c.passed
  );

  let status: PaperReadinessStatus;
  if (hardFail) status = "REJECT";
  else if (sampleFail || !sampleOk) status = "NOT_READY";
  else status = "READY_FOR_REVIEW";

  return {
    status,
    reasons: Object.values(checks)
      .filter((c) => !c.passed)
      .map((c) => `${c.id}: ${c.detail}`),
    checks,
    config,
    evaluationSource: "paper_forward_simulated",
    historicalSourceExcluded: true,
  };
}
