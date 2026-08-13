/**
 * Legacy walk-forward helper — FAKE METRICS QUARANTINED.
 * Do not import for production validation.
 * Use @/validation-engine (Phase 2) instead.
 */

export class WalkForwardNotAvailableError extends Error {
  constructor() {
    super(
      "Legacy walk-forward helper is quarantined. Use POST /api/backtest/validate (Phase 2 Validation Engine) which runs real Truth Engine walk-forward. Fake simulateBacktest (Math.random) has been removed."
    );
    this.name = "WalkForwardNotAvailableError";
  }
}

export async function performWalkForwardAnalysis(): Promise<never> {
  throw new WalkForwardNotAvailableError();
}
