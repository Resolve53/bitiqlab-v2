/**
 * Chronological train / validation / test splits.
 * Never randomizes candles. No overlap between segments.
 */

import type { OHLCVBar } from "@/truth-engine";
import type { ValidationConfig } from "./config";

export interface BarSplitIndices {
  trainStart: number;
  trainEnd: number; // exclusive
  validationStart: number;
  validationEnd: number; // exclusive
  testStart: number;
  testEnd: number; // exclusive
}

export function chronologicalSplitIndices(
  barCount: number,
  config: Pick<ValidationConfig, "trainPct" | "validationPct" | "testPct">
): BarSplitIndices {
  if (barCount < 3) {
    throw new Error(
      `Insufficient bars for chronological split (${barCount}). Need at least 3.`
    );
  }
  const sum = config.trainPct + config.validationPct + config.testPct;
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(
      `trainPct+validationPct+testPct must equal 1 (got ${sum})`
    );
  }

  let trainEnd = Math.floor(barCount * config.trainPct);
  let validationEnd = Math.floor(
    barCount * (config.trainPct + config.validationPct)
  );

  // Ensure each segment has ≥1 bar
  trainEnd = Math.max(1, Math.min(trainEnd, barCount - 2));
  validationEnd = Math.max(trainEnd + 1, Math.min(validationEnd, barCount - 1));

  return {
    trainStart: 0,
    trainEnd,
    validationStart: trainEnd,
    validationEnd,
    testStart: validationEnd,
    testEnd: barCount,
  };
}

export function sliceBars(
  bars: OHLCVBar[],
  start: number,
  end: number
): OHLCVBar[] {
  return bars.slice(start, end);
}

export function assertNoSplitOverlap(idx: BarSplitIndices): void {
  if (idx.trainEnd !== idx.validationStart) {
    throw new Error("Train/validation boundary overlap or gap");
  }
  if (idx.validationEnd !== idx.testStart) {
    throw new Error("Validation/test boundary overlap or gap");
  }
  if (!(idx.trainStart < idx.trainEnd && idx.validationStart < idx.validationEnd && idx.testStart < idx.testEnd)) {
    throw new Error("Invalid chronological split indices");
  }
}
