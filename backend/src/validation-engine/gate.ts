/**
 * Deterministic promotion gate — every check visible.
 */

import type { ValidationConfig } from "./config";
import type {
  ChronologicalSplitResult,
  CostStressResult,
  CrossAssetResult,
  GateCheck,
  GateDecision,
  SampleIntegrityFlags,
  SensitivityResult,
  WalkForwardResult,
} from "./types";

export function evaluateGate(params: {
  chronological: ChronologicalSplitResult;
  walkForward: WalkForwardResult;
  sensitivity: SensitivityResult;
  costStress: CostStressResult;
  sampleIntegrity: SampleIntegrityFlags;
  crossAsset: CrossAssetResult;
  config: ValidationConfig;
}): GateDecision {
  const checks: Record<string, GateCheck> = {};
  const reasons: string[] = [];

  const add = (check: GateCheck) => {
    checks[check.id] = check;
    if (!check.passed) reasons.push(`${check.id}: ${check.detail}`);
  };

  const { chronological: c, walkForward: wf, sensitivity: sens, costStress, sampleIntegrity, config } =
    params;

  // Sample integrity — soft → conditional, not automatic fail (unless empty)
  add({
    id: "sample_total_trades",
    passed: !sampleIntegrity.insufficientTotalTrades,
    severity: "soft",
    detail: sampleIntegrity.insufficientTotalTrades
      ? `Total trades ${c.train.tradeCount + c.validation.tradeCount + c.test.tradeCount} below minimum ${config.minimumTotalTrades}`
      : "Adequate total trades",
    value: c.train.tradeCount + c.validation.tradeCount + c.test.tradeCount,
  });
  add({
    id: "sample_validation_trades",
    passed: !sampleIntegrity.insufficientValidationTrades,
    severity: "soft",
    detail: sampleIntegrity.insufficientValidationTrades
      ? `Validation trades ${c.validation.tradeCount} below minimum ${config.minimumValidationTrades}`
      : "Adequate validation trades",
    value: c.validation.tradeCount,
  });
  add({
    id: "sample_test_trades",
    passed: !sampleIntegrity.insufficientTestTrades,
    severity: "soft",
    detail: sampleIntegrity.insufficientTestTrades
      ? `Test trades ${c.test.tradeCount} below minimum ${config.minimumTestTrades}`
      : "Adequate test trades",
    value: c.test.tradeCount,
  });
  add({
    id: "sample_walk_forward_windows",
    passed: !sampleIntegrity.insufficientWalkForwardWindows,
    severity: "soft",
    detail: sampleIntegrity.insufficientWalkForwardWindows
      ? `Walk-forward windows ${wf.windowCount} below minimum ${config.minimumWalkForwardWindows}`
      : "Adequate walk-forward windows",
    value: wf.windowCount,
  });

  // Expectancy
  const valExp = c.validation.metrics.expectancy;
  const testExp = c.test.metrics.expectancy;
  add({
    id: "validation_expectancy",
    passed: valExp != null && valExp > config.minValidationExpectancy,
    severity: "hard",
    detail:
      valExp == null
        ? "Validation expectancy is null"
        : `Validation expectancy ${valExp} (need > ${config.minValidationExpectancy})`,
    value: valExp,
  });
  add({
    id: "test_expectancy",
    passed: testExp != null && testExp > config.minTestExpectancy,
    severity: "hard",
    detail:
      testExp == null
        ? "Test expectancy is null"
        : `Test expectancy ${testExp} (need > ${config.minTestExpectancy})`,
    value: testExp,
  });

  // Profit factor
  const valPf = c.validation.metrics.profitFactor;
  const testPf = c.test.metrics.profitFactor;
  add({
    id: "validation_profit_factor",
    passed: valPf != null && valPf >= config.minValidationProfitFactor,
    severity: "hard",
    detail:
      valPf == null
        ? "Validation profit factor is null"
        : `Validation PF ${valPf} (need ≥ ${config.minValidationProfitFactor})`,
    value: valPf,
  });
  add({
    id: "test_profit_factor",
    passed: testPf != null && testPf >= config.minTestProfitFactor,
    severity: "hard",
    detail:
      testPf == null
        ? "Test profit factor is null"
        : `Test PF ${testPf} (need ≥ ${config.minTestProfitFactor})`,
    value: testPf,
  });

  // Drawdown (use worst of val/test)
  const dd = Math.max(
    c.validation.metrics.maxDrawdown,
    c.test.metrics.maxDrawdown
  );
  add({
    id: "max_drawdown",
    passed: dd <= config.maxDrawdown,
    severity: "hard",
    detail: `Max(val,test) drawdown ${dd} (need ≤ ${config.maxDrawdown})`,
    value: dd,
  });

  // Walk-forward consistency
  add({
    id: "walk_forward_consistency",
    passed:
      wf.windowCount > 0 &&
      wf.profitableWindowPct >= config.minWalkForwardProfitableWindowPct,
    severity: "hard",
    detail:
      wf.windowCount === 0
        ? "No walk-forward windows"
        : `Profitable WF windows ${wf.profitableWindowPct} (need ≥ ${config.minWalkForwardProfitableWindowPct})`,
    value: wf.profitableWindowPct,
  });

  // Parameter sensitivity — zero variants is informational/soft, not a hard pass
  if (sens.variants.length === 0) {
    add({
      id: "parameter_sensitivity",
      passed: false,
      severity: "soft",
      detail:
        "No stressable numeric parameters found; parameter robustness not evaluated",
      value: { variantCount: 0, positiveExpectancyPct: null },
    });
  } else {
    add({
      id: "parameter_sensitivity",
      passed:
        sens.positiveExpectancyPct >=
        config.minSensitivityPositiveExpectancyPct,
      severity: "hard",
      detail: `Positive-expectancy variants ${sens.positiveExpectancyPct} (need ≥ ${config.minSensitivityPositiveExpectancyPct})`,
      value: {
        variantCount: sens.variants.length,
        positiveExpectancyPct: sens.positiveExpectancyPct,
      },
    });
  }

  // Cost stress at 1.5x
  const stress15 = costStress.cases.filter(
    (x) =>
      (x.commissionMultiplier === 1.5 && x.slippageMultiplier === 1) ||
      (x.commissionMultiplier === 1 && x.slippageMultiplier === 1.5)
  );
  const stress15Pass =
    stress15.length > 0 && stress15.every((x) => x.positiveExpectancy);
  add({
    id: "cost_stress_1_5",
    passed: stress15Pass,
    severity: "hard",
    detail: stress15Pass
      ? "Expectancy remains positive at fees×1.5 and slippage×1.5"
      : "Expectancy not positive under ×1.5 cost stress",
    value: stress15.map((x) => ({
      name: x.name,
      positiveExpectancy: x.positiveExpectancy,
    })),
  });

  // Cross-asset informational unless mandatory
  if (params.crossAsset.mandatory) {
    const allPass = params.crossAsset.assets.every((a) => a.pass);
    add({
      id: "cross_asset",
      passed: allPass,
      severity: "soft",
      detail: params.crossAsset.summary,
      value: params.crossAsset.assets.map((a) => ({
        symbol: a.symbol,
        pass: a.pass,
      })),
    });
  } else {
    add({
      id: "cross_asset",
      passed: true,
      severity: "soft",
      detail: `Informational only: ${params.crossAsset.summary}`,
      value: params.crossAsset.assets.map((a) => ({
        symbol: a.symbol,
        pass: a.pass,
        trades: a.tradeCount,
      })),
    });
  }

  const hardFails = Object.values(checks).filter(
    (c) => c.severity === "hard" && !c.passed
  );
  const softFails = Object.values(checks).filter(
    (c) => c.severity === "soft" && !c.passed
  );

  let status: GateDecision["status"];
  if (hardFails.length > 0) status = "fail";
  else if (softFails.length > 0) status = "conditional";
  else status = "pass";

  const hardTotal = Object.values(checks).filter((c) => c.severity === "hard")
    .length;
  const hardPass = Object.values(checks).filter(
    (c) => c.severity === "hard" && c.passed
  ).length;
  const score =
    hardTotal > 0 ? Math.round((hardPass / hardTotal) * 1000) / 1000 : null;

  return { status, reasons, checks, score };
}
