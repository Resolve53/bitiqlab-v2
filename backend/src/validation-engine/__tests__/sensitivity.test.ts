import { describe, expect, it } from "vitest";
import { mergeValidationConfig } from "../config";
import {
  assertOriginalUnchanged,
  buildSensitivityVariants,
} from "../sensitivity";
import { rsiStrategy } from "./fixtures";

describe("parameter sensitivity", () => {
  const config = mergeValidationConfig();

  it("builds controlled nearby RSI / period / stop / take-profit variants", () => {
    const variants = buildSensitivityVariants(
      rsiStrategy.entry_rules,
      rsiStrategy.exit_rules,
      config
    );
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.length).toBeLessThanOrEqual(24);

    const rsiVals = variants
      .filter((v) => v.parameterPath.endsWith("value"))
      .map((v) => v.testedValue);
    expect(rsiVals).toEqual(expect.arrayContaining([28, 29, 31, 32]));

    const periods = variants
      .filter((v) => v.parameterPath.endsWith("period"))
      .map((v) => v.testedValue);
    expect(periods).toEqual(expect.arrayContaining([12, 13, 15, 16]));
  });

  it("leaves original rules unchanged", () => {
    const entrySnap = JSON.parse(JSON.stringify(rsiStrategy.entry_rules));
    const exitSnap = JSON.parse(JSON.stringify(rsiStrategy.exit_rules));
    buildSensitivityVariants(
      rsiStrategy.entry_rules,
      rsiStrategy.exit_rules,
      config
    );
    assertOriginalUnchanged(
      rsiStrategy.entry_rules,
      rsiStrategy.exit_rules,
      entrySnap,
      exitSnap
    );
    expect(rsiStrategy.entry_rules).toEqual(entrySnap);
    expect(rsiStrategy.exit_rules).toEqual(exitSnap);
  });

  it("each variant is independent (deep clone)", () => {
    const variants = buildSensitivityVariants(
      rsiStrategy.entry_rules,
      rsiStrategy.exit_rules,
      config
    );
    const a = variants[0];
    const b = variants[1];
    expect(a.strategy).not.toBe(b.strategy);
    // Mutating one clone must not affect another
    (a.strategy.exit_rules as { stop_loss_percent: number }).stop_loss_percent =
      999;
    expect(
      (b.strategy.exit_rules as { stop_loss_percent: number }).stop_loss_percent
    ).not.toBe(999);
  });
});
