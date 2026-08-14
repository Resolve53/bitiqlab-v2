/**
 * Phase 4A — Paper Forward Safety Foundation
 * Phase 4B — Simulated paper-forward execution (no exchange orders)
 */

export {
  PAPER_FORWARD_ENGINE_VERSION,
  PAPER_FORWARD_EXEC_ENGINE_VERSION,
  LEGACY_PAPER_EXECUTION_DISABLED,
  PAPER_SIMULATED_NOTICE,
  getTradingSafetyState,
  assertPaperForwardEnabled,
  assertNoExchangeOrdersInPhase4A,
  assertNoExchangeOrders,
} from "@/lib/trading-safety";

export * from "./types";
export * from "./lifecycle";
export * from "./eligibility";
export * from "./persistence-errors";
export {
  createPaperForwardSession,
  startPaperSession,
  pausePaperSession,
  resumePaperSession,
  abortPaperSession,
  failPaperSession,
  getPaperSession,
} from "./session-service";
export { tickPaperSession, PaperTickError } from "./tick";
export { PaperSnapshotError, verifyImmutableSnapshot } from "./snapshot";
export { processClosedBars, initialPaperState } from "./sim-executor";
export { buildPaperMetrics } from "./paper-metrics";
