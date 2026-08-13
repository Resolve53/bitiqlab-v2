import { describe, expect, it } from "vitest";
import { mergeValidationConfig } from "../config";
import { buildWalkForwardWindows } from "../walk-forward";

describe("walk-forward windows", () => {
  const config = mergeValidationConfig({
    walkForwardTrainBars: 40,
    walkForwardValidationBars: 10,
    walkForwardStepBars: 10,
  });

  it("moves windows forward by step without train/val overlap", () => {
    const windows = buildWalkForwardWindows(100, config);
    expect(windows.length).toBeGreaterThanOrEqual(3);
    for (const w of windows) {
      expect(w.validationStart).toBe(w.trainEnd);
      expect(w.trainEnd - w.trainStart).toBe(40);
      expect(w.validationEnd - w.validationStart).toBe(10);
    }
    // Step movement
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].trainStart - windows[i - 1].trainStart).toBe(10);
    }
  });

  it("does not extend past barCount (no leakage past series end)", () => {
    const n = 95;
    const windows = buildWalkForwardWindows(n, config);
    for (const w of windows) {
      expect(w.validationEnd).toBeLessThanOrEqual(n);
      expect(w.trainStart).toBeGreaterThanOrEqual(0);
    }
  });

  it("aggregate window count is deterministic", () => {
    expect(buildWalkForwardWindows(200, config)).toEqual(
      buildWalkForwardWindows(200, config)
    );
  });
});
