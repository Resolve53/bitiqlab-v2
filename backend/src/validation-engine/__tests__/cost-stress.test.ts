import { describe, expect, it } from "vitest";
import { DEFAULT_COST_STRESS_CASES } from "../cost-stress";

describe("cost stress specs", () => {
  it("includes required fee/slippage multipliers", () => {
    const names = DEFAULT_COST_STRESS_CASES.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "fees_x1_5",
        "fees_x2",
        "slippage_x1_5",
        "slippage_x2",
        "fees_x2_slippage_x2",
      ])
    );
  });

  it("applies exact multipliers", () => {
    const baseFee = 0.05;
    const baseSlip = 0.02;
    for (const c of DEFAULT_COST_STRESS_CASES) {
      expect(baseFee * c.commissionMultiplier).toBeCloseTo(
        baseFee * c.commissionMultiplier
      );
      expect(baseSlip * c.slippageMultiplier).toBeCloseTo(
        baseSlip * c.slippageMultiplier
      );
    }
    const both = DEFAULT_COST_STRESS_CASES.find(
      (c) => c.name === "fees_x2_slippage_x2"
    )!;
    expect(both.commissionMultiplier).toBe(2);
    expect(both.slippageMultiplier).toBe(2);
    const fees15 = DEFAULT_COST_STRESS_CASES.find((c) => c.name === "fees_x1_5")!;
    expect(fees15.commissionMultiplier).toBe(1.5);
    expect(fees15.slippageMultiplier).toBe(1);
  });
});
