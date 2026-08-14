/**
 * Central trading safety configuration (Phase 4A foundation + Phase 4B paper sim).
 *
 * ENABLE_LIVE_TRADING — defaults FALSE. Phase 4B never enables live trading
 * and never places real exchange orders (paper fills are simulated only).
 * ENABLE_PAPER_TRADING — feature gate for creating paper sessions.
 *   Defaults TRUE when unset (paper sessions allowed once migrations applied).
 *   Set to "false" to refuse new paper session creation server-side.
 *
 * These flags are enforced server-side. Frontend hiding buttons is not a control.
 */

export const PAPER_FORWARD_ENGINE_VERSION = "paper_forward_v1_phase4b";

/** Execution-engine version recorded on paper events/trades (simulated fills). */
export const PAPER_FORWARD_EXEC_ENGINE_VERSION = "paper_forward_exec_v1_phase4b";

export const LEGACY_PAPER_EXECUTION_DISABLED =
  "Legacy paper execution is disabled. Use Phase 4B paper-forward simulated execution.";

export const LIVE_TRADING_DISABLED =
  "Live trading is disabled. ENABLE_LIVE_TRADING is false and Phase 4B does not place exchange orders.";

export const PAPER_FORWARD_FEATURE_DISABLED =
  "Paper-forward session creation is disabled (ENABLE_PAPER_TRADING=false).";

export const PAPER_SIMULATED_NOTICE =
  "PAPER / SIMULATED — no real capital, no exchange orders. ENABLE_LIVE_TRADING remains false.";

export const PROMOTION_FORCE_DISABLED =
  "Force promotion is disabled. Evidence gates cannot be bypassed.";

export const PROMOTION_AUTO_DISABLED =
  "Automatic Bitiq promotion is disabled in Phase 4B. Human review of paper-forward evidence is required in a later phase.";

export const STATUS_APPROVED_VIA_PATCH_DISABLED =
  "Setting status to 'approved' via PATCH is disabled. Approval requires evidence gates (not UI status alone).";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function isLiveTradingEnabled(): boolean {
  // Hard rule: never treat live as enabled for execution. Flag is observability only.
  return envFlag("ENABLE_LIVE_TRADING", false);
}

export function isPaperTradingEnabled(): boolean {
  return envFlag("ENABLE_PAPER_TRADING", true);
}

export function assertPaperForwardEnabled(): void {
  if (!isPaperTradingEnabled()) {
    throw new Error(PAPER_FORWARD_FEATURE_DISABLED);
  }
}

/**
 * Live / exchange order placement is never allowed in Phase 4B.
 * Call before any path that could place non-testnet / live exchange orders.
 */
export function assertLiveTradingAllowed(): void {
  throw new Error(LIVE_TRADING_DISABLED);
}

export function assertNoExchangeOrdersInPhase4A(): void {
  throw new Error(LEGACY_PAPER_EXECUTION_DISABLED);
}

/** Alias kept for Phase 4B call sites that refuse exchange execution. */
export function assertNoExchangeOrders(): void {
  throw new Error(LIVE_TRADING_DISABLED);
}

export function getTradingSafetyState() {
  return {
    engineVersion: PAPER_FORWARD_ENGINE_VERSION,
    execEngineVersion: PAPER_FORWARD_EXEC_ENGINE_VERSION,
    enablePaperTrading: isPaperTradingEnabled(),
    enableLiveTrading: false, // hard-forced off regardless of env
    envEnableLiveTradingRaw: process.env.ENABLE_LIVE_TRADING ?? "(unset→false)",
    envEnablePaperTradingRaw: process.env.ENABLE_PAPER_TRADING ?? "(unset→true)",
    exchangeOrdersAllowed: false,
    liveForwardExecutionEnabled: false,
    paperSimExecutionEnabled: true,
    phase: "4B" as const,
    notice: PAPER_SIMULATED_NOTICE,
  };
}
