/**
 * Legacy walk-forward helper — FAKE METRICS QUARANTINED.
 * Do not import for production backtesting.
 * Phase 2 will replace this with real walk-forward on the Truth Engine.
 */

export class WalkForwardNotAvailableError extends Error {
  constructor() {
    super(
      "Walk-forward validation is Phase 2. Fake simulateBacktest (Math.random) has been removed."
    );
    this.name = "WalkForwardNotAvailableError";
  }
}

export async function performWalkForwardAnalysis(): Promise<never> {
  throw new WalkForwardNotAvailableError();
}
