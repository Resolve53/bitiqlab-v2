import { describe, expect, it } from "vitest";
import {
  assertValidTransition,
  isTerminalLifecycle,
  LEGAL_TRANSITIONS,
  PaperLifecycleError,
} from "../lifecycle";

describe("Phase 4A lifecycle", () => {
  it("allows CREATED→RUNNING", () => {
    expect(() => assertValidTransition("CREATED", "RUNNING")).not.toThrow();
  });

  it("allows RUNNING→PAUSED and PAUSED→RUNNING", () => {
    expect(() => assertValidTransition("RUNNING", "PAUSED")).not.toThrow();
    expect(() => assertValidTransition("PAUSED", "RUNNING")).not.toThrow();
  });

  it("allows RUNNING→ABORTED", () => {
    expect(() => assertValidTransition("RUNNING", "ABORTED")).not.toThrow();
  });

  it("forbids terminal restart", () => {
    for (const terminal of ["COMPLETED", "FAILED", "ABORTED"] as const) {
      expect(isTerminalLifecycle(terminal)).toBe(true);
      expect(LEGAL_TRANSITIONS[terminal]).toEqual([]);
      expect(() => assertValidTransition(terminal, "RUNNING")).toThrow(
        PaperLifecycleError
      );
    }
  });

  it("rejects invalid transitions", () => {
    expect(() => assertValidTransition("CREATED", "PAUSED")).toThrow(
      /Invalid paper session lifecycle/
    );
    expect(() => assertValidTransition("PAUSED", "CREATED")).toThrow();
  });
});
