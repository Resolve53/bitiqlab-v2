import { describe, expect, it } from "vitest";
import { mergeValidationConfig } from "../config";
import {
  assertNoSplitOverlap,
  chronologicalSplitIndices,
} from "../splits";

describe("chronological splits", () => {
  const config = mergeValidationConfig({
    trainPct: 0.6,
    validationPct: 0.2,
    testPct: 0.2,
  });

  it("uses oldest→newest contiguous segments with exact 60/20/20 floors", () => {
    const n = 100;
    const idx = chronologicalSplitIndices(n, config);
    expect(idx.trainStart).toBe(0);
    expect(idx.trainEnd).toBe(60);
    expect(idx.validationStart).toBe(60);
    expect(idx.validationEnd).toBe(80);
    expect(idx.testStart).toBe(80);
    expect(idx.testEnd).toBe(100);
  });

  it("has no overlap and no gap", () => {
    const idx = chronologicalSplitIndices(137, config);
    assertNoSplitOverlap(idx);
    expect(idx.trainEnd).toBe(idx.validationStart);
    expect(idx.validationEnd).toBe(idx.testStart);
    expect(idx.testEnd).toBe(137);
  });

  it("is deterministic (no randomization)", () => {
    const a = chronologicalSplitIndices(250, config);
    const b = chronologicalSplitIndices(250, config);
    expect(a).toEqual(b);
  });

  it("rejects pct sum != 1", () => {
    expect(() =>
      chronologicalSplitIndices(
        100,
        mergeValidationConfig({ trainPct: 0.5, validationPct: 0.2, testPct: 0.2 })
      )
    ).toThrow(/must equal 1/);
  });

  it("never places test before validation", () => {
    for (const n of [10, 33, 101, 500]) {
      const idx = chronologicalSplitIndices(n, config);
      expect(idx.trainStart).toBeLessThan(idx.trainEnd);
      expect(idx.validationStart).toBeLessThan(idx.validationEnd);
      expect(idx.testStart).toBeLessThan(idx.testEnd);
      expect(idx.testStart).toBeGreaterThanOrEqual(idx.validationEnd);
    }
  });
});
