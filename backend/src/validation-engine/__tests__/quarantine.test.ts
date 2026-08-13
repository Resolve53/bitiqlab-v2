import { describe, expect, it } from "vitest";
import {
  OutOfSampleValidator,
  WalkForwardValidator,
} from "@/backtest-engine/validators/walk-forward-validator";
import { performWalkForwardAnalysis } from "@/lib/walk-forward-validator";

describe("legacy fake validation quarantine", () => {
  it("lib walk-forward helper throws", async () => {
    await expect(performWalkForwardAnalysis()).rejects.toThrow(/quarantined/i);
  });

  it("backtest-engine WalkForwardValidator throws", async () => {
    const v = new WalkForwardValidator({
      strategy_id: "x",
      version: 1,
      data_period_months: 12,
      window_size_months: 3,
      train_percent: 0.6,
    });
    await expect(v.validate()).rejects.toThrow(/quarantined/i);
  });

  it("OutOfSampleValidator throws", async () => {
    await expect(OutOfSampleValidator.validate()).rejects.toThrow(
      /quarantined/i
    );
  });
});
