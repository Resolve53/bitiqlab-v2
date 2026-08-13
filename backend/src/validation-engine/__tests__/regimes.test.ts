import { describe, expect, it } from "vitest";
import { mergeValidationConfig } from "../config";
import { classifyTrendRegimes, classifyVolRegimes } from "../regimes";
import { makeBars } from "./fixtures";

describe("regime classification", () => {
  const config = mergeValidationConfig({
    regimeSmaPeriod: 10,
    regimeSlopeLookback: 3,
    regimeAtrPeriod: 5,
  });

  it("is deterministic on the same bars", () => {
    const bars = makeBars(80, { drift: 0.5, amp: 0.02 });
    const t1 = classifyTrendRegimes(bars, config);
    const t2 = classifyTrendRegimes(bars, config);
    const v1 = classifyVolRegimes(bars, config);
    const v2 = classifyVolRegimes(bars, config);
    expect(t1).toEqual(t2);
    expect(v1).toEqual(v2);
  });

  it("labels strong uptrend mostly trending_up after warmup", () => {
    const bars = makeBars(60, { drift: 1.5, amp: 0.001, range: 0.002 });
    const trends = classifyTrendRegimes(bars, config);
    const afterWarmup = trends.slice(config.regimeSmaPeriod + config.regimeSlopeLookback);
    const up = afterWarmup.filter((t) => t === "trending_up").length;
    expect(up).toBeGreaterThan(afterWarmup.length * 0.5);
  });

  it("does not use future bars (prefix stability)", () => {
    const bars = makeBars(50, { drift: 0.3, amp: 0.05 });
    const full = classifyTrendRegimes(bars, config);
    const prefix = classifyTrendRegimes(bars.slice(0, 40), config);
    expect(full.slice(0, 40)).toEqual(prefix);
  });
});
