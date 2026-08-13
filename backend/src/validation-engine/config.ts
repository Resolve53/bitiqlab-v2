/**
 * Phase 2 Validation Engine — configurable defaults.
 * These are baselines, not eternal truths. Override via ValidationConfig.
 */

export const DEFAULT_VALIDATION_CONFIG = {
  trainPct: 0.6,
  validationPct: 0.2,
  testPct: 0.2,

  // Walk-forward (bars)
  walkForwardTrainBars: 200,
  walkForwardValidationBars: 50,
  walkForwardStepBars: 50,

  // Sample integrity
  minimumTotalTrades: 100,
  minimumValidationTrades: 20,
  minimumTestTrades: 20,
  minimumWalkForwardWindows: 3,

  // Gate thresholds
  minValidationExpectancy: 0,
  minTestExpectancy: 0,
  minValidationProfitFactor: 1.2,
  minTestProfitFactor: 1.2,
  maxDrawdown: 0.2,
  minWalkForwardProfitableWindowPct: 0.6,
  minSensitivityPositiveExpectancyPct: 0.5,
  costStressRequirePositiveExpectancyAt: 1.5, // fees×1.5 and/or slippage×1.5

  // Sensitivity deltas
  rsiValueDeltas: [-2, -1, 1, 2] as number[],
  periodDeltas: [-2, -1, 1, 2] as number[],
  stopLossPctDeltas: [-0.5, -0.25, 0.25, 0.5] as number[],
  takeProfitPctDeltas: [-0.5, -0.25, 0.25, 0.5] as number[],
  riskPctDeltas: [-0.25, 0.25] as number[],

  // Regime
  regimeSmaPeriod: 50,
  regimeAtrPeriod: 14,
  regimeSlopeLookback: 5,

  // Cross-asset
  crossAssetSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as string[],
  crossAssetMandatory: false,
};

export type ValidationConfig = {
  trainPct: number;
  validationPct: number;
  testPct: number;
  walkForwardTrainBars: number;
  walkForwardValidationBars: number;
  walkForwardStepBars: number;
  minimumTotalTrades: number;
  minimumValidationTrades: number;
  minimumTestTrades: number;
  minimumWalkForwardWindows: number;
  minValidationExpectancy: number;
  minTestExpectancy: number;
  minValidationProfitFactor: number;
  minTestProfitFactor: number;
  maxDrawdown: number;
  minWalkForwardProfitableWindowPct: number;
  minSensitivityPositiveExpectancyPct: number;
  costStressRequirePositiveExpectancyAt: number;
  rsiValueDeltas: number[];
  periodDeltas: number[];
  stopLossPctDeltas: number[];
  takeProfitPctDeltas: number[];
  riskPctDeltas: number[];
  regimeSmaPeriod: number;
  regimeAtrPeriod: number;
  regimeSlopeLookback: number;
  crossAssetSymbols: string[];
  crossAssetMandatory: boolean;
};

export function mergeValidationConfig(
  partial?: Partial<ValidationConfig>
): ValidationConfig {
  return {
    ...DEFAULT_VALIDATION_CONFIG,
    ...partial,
    crossAssetSymbols: partial?.crossAssetSymbols
      ? [...partial.crossAssetSymbols]
      : [...DEFAULT_VALIDATION_CONFIG.crossAssetSymbols],
    rsiValueDeltas: partial?.rsiValueDeltas
      ? [...partial.rsiValueDeltas]
      : [...DEFAULT_VALIDATION_CONFIG.rsiValueDeltas],
    periodDeltas: partial?.periodDeltas
      ? [...partial.periodDeltas]
      : [...DEFAULT_VALIDATION_CONFIG.periodDeltas],
    stopLossPctDeltas: partial?.stopLossPctDeltas
      ? [...partial.stopLossPctDeltas]
      : [...DEFAULT_VALIDATION_CONFIG.stopLossPctDeltas],
    takeProfitPctDeltas: partial?.takeProfitPctDeltas
      ? [...partial.takeProfitPctDeltas]
      : [...DEFAULT_VALIDATION_CONFIG.takeProfitPctDeltas],
    riskPctDeltas: partial?.riskPctDeltas
      ? [...partial.riskPctDeltas]
      : [...DEFAULT_VALIDATION_CONFIG.riskPctDeltas],
  };
}
