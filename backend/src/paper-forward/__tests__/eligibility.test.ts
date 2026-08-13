import { describe, expect, it } from "vitest";
import { evaluateEligibilityFromRows } from "../eligibility";
import type {
  StrategyValidationRow,
  StrategyVersionRow,
} from "../types";

const version: StrategyVersionRow = {
  id: "ver-1",
  strategy_id: "strat-1",
  version: 3,
  snapshot_hash: "hash-abc",
  strategy_snapshot: {
    symbol: "BTCUSDT",
    timeframe: "1h",
    entry_rules: { schema_version: "truth_engine_v1" },
    exit_rules: { take_profit_percent: 4 },
  },
};

function validation(
  status: string,
  overrides: Partial<StrategyValidationRow> = {}
): StrategyValidationRow {
  return {
    id: "val-1",
    strategy_id: "strat-1",
    strategy_version: 3,
    strategy_snapshot: version.strategy_snapshot,
    status,
    gate: { status },
    report: {},
    symbol: "BTCUSDT",
    timeframe: "1h",
    ...overrides,
  };
}

describe("Phase 4A eligibility", () => {
  it("PASS validation → eligible", () => {
    const result = evaluateEligibilityFromRows({
      request: {
        strategyId: "strat-1",
        strategyVersionId: "ver-1",
        validationId: "val-1",
      },
      version,
      validation: validation("pass"),
    });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("CONDITIONAL with acknowledgement → eligible", () => {
    const result = evaluateEligibilityFromRows({
      request: {
        strategyId: "strat-1",
        strategyVersionId: "ver-1",
        validationId: "val-1",
        acknowledgeConditional: true,
      },
      version,
      validation: validation("conditional"),
    });
    expect(result.eligible).toBe(true);
    expect(result.requiresConditionalAcknowledgement).toBe(true);
  });

  it("CONDITIONAL without acknowledgement → reject", () => {
    const result = evaluateEligibilityFromRows({
      request: {
        strategyId: "strat-1",
        strategyVersionId: "ver-1",
        validationId: "val-1",
        acknowledgeConditional: false,
      },
      version,
      validation: validation("conditional"),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => /acknowledge/i.test(r))).toBe(true);
  });

  it("FAIL → reject", () => {
    const result = evaluateEligibilityFromRows({
      request: {
        strategyId: "strat-1",
        strategyVersionId: "ver-1",
        validationId: "val-1",
      },
      version,
      validation: validation("fail"),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => /FAIL/i.test(r))).toBe(true);
  });

  it("missing validation → reject", () => {
    const result = evaluateEligibilityFromRows({
      request: {
        strategyId: "strat-1",
        strategyVersionId: "ver-1",
        validationId: "val-missing",
      },
      version,
      validation: null,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => /not found|missing/i.test(r))).toBe(true);
  });

  it("mismatched validation/version → reject", () => {
    const result = evaluateEligibilityFromRows({
      request: {
        strategyId: "strat-1",
        strategyVersionId: "ver-1",
        validationId: "val-1",
      },
      version,
      validation: validation("pass", { strategy_version: 99 }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => /mismatch/i.test(r))).toBe(true);
  });
});
