/**
 * Rolling walk-forward windows on chronological bars.
 * Train then validation; step forward. No test-set usage.
 */

import type { OHLCVBar } from "@/truth-engine";
import type { ValidationConfig } from "./config";

export interface WalkForwardWindowIndices {
  windowIndex: number;
  trainStart: number;
  trainEnd: number; // exclusive
  validationStart: number;
  validationEnd: number; // exclusive
}

export function buildWalkForwardWindows(
  barCount: number,
  config: Pick<
    ValidationConfig,
    | "walkForwardTrainBars"
    | "walkForwardValidationBars"
    | "walkForwardStepBars"
  >
): WalkForwardWindowIndices[] {
  const trainLen = config.walkForwardTrainBars;
  const valLen = config.walkForwardValidationBars;
  const step = config.walkForwardStepBars;
  if (!(trainLen > 0 && valLen > 0 && step > 0)) {
    throw new Error("Walk-forward train/validation/step lengths must be > 0");
  }

  const windows: WalkForwardWindowIndices[] = [];
  let start = 0;
  let i = 0;
  while (start + trainLen + valLen <= barCount) {
    const trainStart = start;
    const trainEnd = start + trainLen;
    const validationStart = trainEnd;
    const validationEnd = trainEnd + valLen;
    windows.push({
      windowIndex: i,
      trainStart,
      trainEnd,
      validationStart,
      validationEnd,
    });
    // Leakage guard: validation starts exactly where train ends
    if (validationStart !== trainEnd) {
      throw new Error("Walk-forward window leakage: validation overlaps train");
    }
    start += step;
    i += 1;
  }
  return windows;
}

export function sliceWindow(
  bars: OHLCVBar[],
  start: number,
  end: number
): OHLCVBar[] {
  return bars.slice(start, end);
}
