/**
 * Phase 4A — Paper Forward Safety Foundation
 * Session create + lifecycle only. No live-forward execution.
 */

export {
  PAPER_FORWARD_ENGINE_VERSION,
  LEGACY_PAPER_EXECUTION_DISABLED,
  getTradingSafetyState,
  assertPaperForwardEnabled,
  assertNoExchangeOrdersInPhase4A,
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
  getPaperSession,
} from "./session-service";
