/**
 * Runtime guards: TEST must never enter the research loop.
 */

import type { OHLCVBar } from "@/truth-engine";
import type { MetricsSummary } from "@/validation-engine";
import type { TrainDiagnostics } from "./types";

export class TestLeakageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestLeakageError";
  }
}

export function assertTrainDiagnosticsOnly(
  diagnostics: TrainDiagnostics
): void {
  if (diagnostics.segment !== "train") {
    throw new TestLeakageError(
      `Claude context must be TRAIN-only (got segment=${diagnostics.segment})`
    );
  }
}

export function assertBarsAreSubset(
  subset: OHLCVBar[],
  full: OHLCVBar[],
  startIdx: number,
  endIdx: number,
  label: string
): void {
  if (subset.length !== endIdx - startIdx) {
    throw new TestLeakageError(
      `${label} bar count mismatch vs frozen split indices`
    );
  }
  if (subset.length > 0) {
    if (
      subset[0].timestamp.getTime() !== full[startIdx].timestamp.getTime() ||
      subset[subset.length - 1].timestamp.getTime() !==
        full[endIdx - 1].timestamp.getTime()
    ) {
      throw new TestLeakageError(
        `${label} timestamps do not match frozen split boundaries`
      );
    }
  }
}

/** Ensure an object destined for Claude does not contain test keys/metrics. */
export function assertNoTestPayload(payload: unknown, path = "$"): void {
  if (payload == null || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoTestPayload(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (
      key === "test" ||
      key === "testmetrics" ||
      key === "chronologicaltestmetrics" ||
      key === "testbars" ||
      key.startsWith("test_") ||
      key.includes("testsegment")
    ) {
      throw new TestLeakageError(
        `Forbidden TEST field in Claude/loop payload at ${path}.${k}`
      );
    }
    // Nested chronological.test would be leakage
    if (k === "chronological" && v && typeof v === "object") {
      if ("test" in (v as object)) {
        throw new TestLeakageError(
          `Forbidden chronological.test in payload at ${path}.chronological`
        );
      }
    }
    assertNoTestPayload(v, `${path}.${k}`);
  }
}

export function assertNotTestSegment(
  segment: "train" | "validation" | "test"
): asserts segment is "train" | "validation" {
  if (segment === "test") {
    throw new TestLeakageError(
      "TEST segment cannot be used during research candidate evaluation"
    );
  }
}

export function stripTestFromGateLike(obj: unknown): unknown {
  // Utility for tests — research must not need this if guards work
  return obj;
}

export type LoopMetricsBag = {
  train?: MetricsSummary;
  validation?: MetricsSummary;
  test?: MetricsSummary;
};

export function assertSelectionMetricsHaveNoTest(
  bag: LoopMetricsBag
): void {
  if (bag.test != null) {
    throw new TestLeakageError(
      "Selection metrics bag must not include TEST metrics"
    );
  }
}
