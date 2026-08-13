import { describe, expect, it } from "vitest";
import {
  assertNoTestPayload,
  assertSelectionMetricsHaveNoTest,
  assertTrainDiagnosticsOnly,
  TestLeakageError,
} from "../isolation";
import { metrics } from "./fixtures";

describe("TEST isolation guards", () => {
  it("allows TRAIN diagnostics", () => {
    expect(() =>
      assertTrainDiagnosticsOnly({
        metrics: metrics({}),
        tradeCount: 10,
        barCount: 100,
        segment: "train",
      })
    ).not.toThrow();
  });

  it("rejects non-train diagnostics for Claude", () => {
    expect(() =>
      assertTrainDiagnosticsOnly({
        metrics: metrics({}),
        tradeCount: 10,
        barCount: 100,
        segment: "train",
      })
    ).not.toThrow();
    expect(() =>
      assertTrainDiagnosticsOnly({
        metrics: metrics({}),
        tradeCount: 10,
        barCount: 100,
        segment: "test" as "train",
      })
    ).toThrow(TestLeakageError);
  });

  it("rejects payloads containing test keys", () => {
    expect(() =>
      assertNoTestPayload({
        trainDiagnostics: { segment: "train" },
        chronological: { test: { expectancy: 1 } },
      })
    ).toThrow(/chronological.test/);
  });

  it("rejects selection bags with test metrics", () => {
    expect(() =>
      assertSelectionMetricsHaveNoTest({
        train: metrics({}),
        validation: metrics({}),
        test: metrics({}),
      })
    ).toThrow(TestLeakageError);
  });
});
