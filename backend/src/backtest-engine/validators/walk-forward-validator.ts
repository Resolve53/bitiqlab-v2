/**
 * QUARANTINED — Phase 1/legacy walk-forward helpers.
 *
 * Production validation MUST use `@/validation-engine` via
 * `POST /api/backtest/validate`. Do not restore fake/random metrics here.
 */

export interface WalkForwardConfig {
  strategy_id: string;
  version: number;
  data_period_months: number;
  window_size_months: number;
  train_percent: number;
}

export class WalkForwardQuarantinedError extends Error {
  constructor() {
    super(
      "Legacy WalkForwardValidator is quarantined. Use Phase 2 Validation Engine (POST /api/backtest/validate / @/validation-engine)."
    );
    this.name = "WalkForwardQuarantinedError";
  }
}

/**
 * @deprecated Quarantined — throws on use.
 */
export class WalkForwardValidator {
  constructor(_config: WalkForwardConfig) {}

  async validate(..._args: unknown[]): Promise<never> {
    throw new WalkForwardQuarantinedError();
  }
}

/**
 * @deprecated Quarantined — throws on use.
 */
export class OutOfSampleValidator {
  static async validate(..._args: unknown[]): Promise<never> {
    throw new WalkForwardQuarantinedError();
  }
}
