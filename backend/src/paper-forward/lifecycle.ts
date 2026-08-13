/**
 * Phase 4A paper session lifecycle transitions.
 */

import type { PaperLifecycleStatus } from "./types";

export class PaperLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaperLifecycleError";
  }
}

const TERMINAL: ReadonlySet<PaperLifecycleStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "ABORTED",
]);

/** Legal transitions (from → allowed to). */
export const LEGAL_TRANSITIONS: Record<
  PaperLifecycleStatus,
  ReadonlyArray<PaperLifecycleStatus>
> = {
  CREATED: ["RUNNING", "ABORTED", "FAILED"],
  RUNNING: ["PAUSED", "COMPLETED", "FAILED", "ABORTED"],
  PAUSED: ["RUNNING", "ABORTED", "FAILED", "COMPLETED"],
  COMPLETED: [],
  FAILED: [],
  ABORTED: [],
};

export function isTerminalLifecycle(status: PaperLifecycleStatus): boolean {
  return TERMINAL.has(status);
}

export function assertValidTransition(
  from: PaperLifecycleStatus,
  to: PaperLifecycleStatus
): void {
  const allowed = LEGAL_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new PaperLifecycleError(
      `Invalid paper session lifecycle transition: ${from} → ${to}`
    );
  }
}

export function legacyStatusForLifecycle(
  lifecycle: PaperLifecycleStatus
): string {
  switch (lifecycle) {
    case "CREATED":
      return "created";
    case "RUNNING":
      return "active";
    case "PAUSED":
      return "paused";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "ABORTED":
      return "aborted";
    default:
      return "created";
  }
}

export function timestampFieldForTransition(
  to: PaperLifecycleStatus
):
  | "started_at"
  | "paused_at"
  | "completed_at"
  | "failed_at"
  | "aborted_at"
  | null {
  switch (to) {
    case "RUNNING":
      return "started_at";
    case "PAUSED":
      return "paused_at";
    case "COMPLETED":
      return "completed_at";
    case "FAILED":
      return "failed_at";
    case "ABORTED":
      return "aborted_at";
    default:
      return null;
  }
}
