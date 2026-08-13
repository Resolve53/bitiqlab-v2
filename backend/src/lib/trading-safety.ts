/**
 * Central trading safety configuration (Phase 4A).
 *
 * ENABLE_LIVE_TRADING — defaults FALSE. Phase 4A never enables live trading.
 * ENABLE_PAPER_TRADING — feature gate for creating Phase 4A paper sessions.
 *   Defaults TRUE when unset (paper sessions allowed once migrations applied).
 *   Set to "false" to refuse new paper session creation server-side.
 *
 * These flags are enforced server-side. Frontend hiding buttons is not a control.
 */

export const PAPER_FORWARD_ENGINE_VERSION = "paper_forward_v1_phase4a";

export const LEGACY_PAPER_EXECUTION_DISABLED =
  "Legacy paper execution is disabled. Phase 4 live-forward engine is not enabled yet.";

export const LIVE_TRADING_DISABLED =
  "Live trading is disabled. ENABLE_LIVE_TRADING is false and Phase 4A does not place exchange orders.";

export const PAPER_FORWARD_FEATURE_DISABLED =
  "Paper-forward session creation is disabled (ENABLE_PAPER_TRADING=false).";

export const PROMOTION_FORCE_DISABLED =
  "Force promotion is disabled. Evidence gates cannot be bypassed.";

export const PROMOTION_AUTO_DISABLED =
  "Automatic Bitiq promotion is disabled in Phase 4A. Human review of paper-forward evidence is required in a later phase.";

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
  // Phase 4A hard rule: never treat live as enabled regardless of env typos in future.
  // Still read the flag so ops can see intent, but assertLiveTradingAllowed always fails in 4A.
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
 * Phase 4A: live trading is never allowed.
 * Call before any path that could place non-testnet / live exchange orders.
 */
export function assertLiveTradingAllowed(): void {
  throw new Error(LIVE_TRADING_DISABLED);
}

export function assertNoExchangeOrdersInPhase4A(): void {
  throw new Error(LEGACY_PAPER_EXECUTION_DISABLED);
}

export function getTradingSafetyState() {
  return {
    engineVersion: PAPER_FORWARD_ENGINE_VERSION,
    enablePaperTrading: isPaperTradingEnabled(),
    enableLiveTrading: false, // Phase 4A hard-forced off
    envEnableLiveTradingRaw: process.env.ENABLE_LIVE_TRADING ?? "(unset→false)",
    envEnablePaperTradingRaw: process.env.ENABLE_PAPER_TRADING ?? "(unset→true)",
    exchangeOrdersAllowed: false,
    liveForwardExecutionEnabled: false,
    phase: "4A" as const,
  };
}
