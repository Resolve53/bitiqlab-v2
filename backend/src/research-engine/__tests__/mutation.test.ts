import { describe, expect, it } from "vitest";
import { applyMutation } from "../mutation-applier";
import { parseStructuredMutation } from "../mutation-schema";
import { buildStrategyDefinition } from "@/truth-engine";
import { parentSnapshot } from "./fixtures";

describe("mutation applier", () => {
  it("accepts one atomic threshold change", () => {
    const parent = parentSnapshot();
    const before = JSON.stringify(parent);
    const candidate = applyMutation(parent, {
      mutation_type: "indicator_threshold",
      path: "entry_rules.condition.value",
      old_value: 100,
      new_value: 98,
      hypothesis: "Slightly earlier entries",
    });
    expect(JSON.stringify(parent)).toBe(before);
    expect(
      (candidate.entry_rules as { condition: { value: number } }).condition
        .value
    ).toBe(98);
    buildStrategyDefinition({
      ...candidate,
      market_type: candidate.market_type,
    });
  });

  it("rejects wrong old_value", () => {
    expect(() =>
      applyMutation(parentSnapshot(), {
        mutation_type: "indicator_threshold",
        path: "entry_rules.condition.value",
        old_value: 999,
        new_value: 98,
        hypothesis: "bad",
      })
    ).toThrow(/old_value mismatch/);
  });

  it("rejects invalid path", () => {
    expect(() =>
      applyMutation(parentSnapshot(), {
        mutation_type: "indicator_threshold",
        path: "entry_rules.condition.nope",
        old_value: undefined,
        new_value: 1,
        hypothesis: "bad",
      })
    ).toThrow();
  });

  it("rejects direction change via path abuse", () => {
    const parent = parentSnapshot();
    // Inject direction on entry_rules for this test
    (parent.entry_rules as { direction: string }).direction = "long";
    expect(() =>
      applyMutation(parent, {
        mutation_type: "indicator_threshold",
        path: "entry_rules.direction",
        old_value: "long",
        new_value: "short",
        hypothesis: "flip",
      })
    ).toThrow();
  });

  it("rejects stop_loss that is non-positive", () => {
    expect(() =>
      applyMutation(parentSnapshot(), {
        mutation_type: "stop_loss_percent",
        path: "exit_rules.stop_loss_percent",
        old_value: 2,
        new_value: -1,
        hypothesis: "bad sl",
      })
    ).toThrow(/positive/);
  });

  it("rejects unsupported indicator on add_condition", () => {
    const parent = parentSnapshot();
    // Convert condition to group so add_condition is valid path target
    (parent.entry_rules as { condition: unknown }).condition = {
      type: "group",
      op: "and",
      rules: [
        {
          type: "indicator",
          indicator: "price",
          field: "close",
          operator: ">",
          value: 100,
        },
      ],
    };
    expect(() =>
      applyMutation(parent, {
        mutation_type: "add_condition",
        path: "entry_rules.condition",
        old_value: null,
        new_value: null,
        hypothesis: "add bad",
        condition: {
          type: "indicator",
          indicator: "magic_ai",
          operator: ">",
          value: 1,
        },
      })
    ).toThrow(/Unsupported indicator/);
  });

  it("parseStructuredMutation rejects multiple-type garbage", () => {
    expect(() =>
      parseStructuredMutation({
        mutation_type: "rewrite_everything",
        path: "x",
        old_value: 1,
        new_value: 2,
        hypothesis: "nope",
      })
    ).toThrow(/Unsupported mutation_type/);
  });

  it("symbol/timeframe stay locked on candidate", () => {
    const parent = parentSnapshot();
    const candidate = applyMutation(parent, {
      mutation_type: "take_profit_percent",
      path: "exit_rules.take_profit_percent",
      old_value: 4,
      new_value: 5,
      hypothesis: "wider tp",
    });
    expect(candidate.symbol).toBe(parent.symbol);
    expect(candidate.timeframe).toBe(parent.timeframe);
  });
});
