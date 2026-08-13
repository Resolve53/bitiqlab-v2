/**
 * Explicit sample-size integrity flags — never invent confidence.
 */

import type { ValidationConfig } from "./config";
import type { SampleIntegrityFlags } from "./types";

export function evaluateSampleIntegrity(params: {
  totalTrades: number;
  validationTrades: number;
  testTrades: number;
  walkForwardWindows: number;
  config: ValidationConfig;
}): SampleIntegrityFlags {
  const insufficientTotalTrades =
    params.totalTrades < params.config.minimumTotalTrades;
  const insufficientValidationTrades =
    params.validationTrades < params.config.minimumValidationTrades;
  const insufficientTestTrades =
    params.testTrades < params.config.minimumTestTrades;
  const insufficientWalkForwardWindows =
    params.walkForwardWindows < params.config.minimumWalkForwardWindows;

  const flags: string[] = [];
  if (insufficientTotalTrades) {
    flags.push(
      `insufficient_total_trades (${params.totalTrades} < ${params.config.minimumTotalTrades})`
    );
  }
  if (insufficientValidationTrades) {
    flags.push(
      `insufficient_validation_trades (${params.validationTrades} < ${params.config.minimumValidationTrades})`
    );
  }
  if (insufficientTestTrades) {
    flags.push(
      `insufficient_test_trades (${params.testTrades} < ${params.config.minimumTestTrades})`
    );
  }
  if (insufficientWalkForwardWindows) {
    flags.push(
      `insufficient_walk_forward_windows (${params.walkForwardWindows} < ${params.config.minimumWalkForwardWindows})`
    );
  }

  return {
    insufficientTotalTrades,
    insufficientValidationTrades,
    insufficientTestTrades,
    insufficientWalkForwardWindows,
    flags,
  };
}
