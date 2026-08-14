/**
 * Phase 4C paper-forward readiness / scheduler config.
 * Deterministic code thresholds — not Claude. Override via env.
 */

export const DEFAULT_PAPER_READINESS_CONFIG = {
  /** Minimum closed simulated trades before READY_FOR_REVIEW. */
  minClosedTrades: 20,
  /** Minimum processed CLOSED candles. */
  minClosedCandles: 100,
  /** Minimum elapsed time since session started_at. */
  minElapsedHours: 24,
  /** Mean net P&L per closed trade (quote currency). */
  minExpectancy: 0,
  /** Gross profit / |gross loss|. Null PF with wins and zero losses passes. */
  minProfitFactor: 1.2,
  /** Peak-to-trough equity drawdown as a fraction (0.20 = 20%). */
  maxDrawdown: 0.2,
  /** Wins / closed trades. */
  minWinRate: 0.4,
  /** First-half and second-half trade expectancy must both be >= this. */
  minHalfExpectancy: 0,
  maxConsecutiveLosses: 10,
  /** Consecutive scheduler tick failures before FAIL CLOSED. */
  maxTickErrors: 5,
  /** RUNNING with no successful tick for this long is marked stale. */
  staleAfterHours: 6,
  /** Scheduler lock lease. Expired leases are stealable after deploy/crash. */
  lockLeaseMs: 120_000,
  maxSessionsPerSchedulerRun: 25,
} as const;

export type PaperReadinessConfig = {
  [K in keyof typeof DEFAULT_PAPER_READINESS_CONFIG]: number;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getPaperReadinessConfig(
  overrides: Partial<PaperReadinessConfig> = {}
): PaperReadinessConfig {
  const base: PaperReadinessConfig = {
    minClosedTrades: envNumber(
      "PAPER_FORWARD_MIN_TRADES",
      DEFAULT_PAPER_READINESS_CONFIG.minClosedTrades
    ),
    minClosedCandles: envNumber(
      "PAPER_FORWARD_MIN_CANDLES",
      DEFAULT_PAPER_READINESS_CONFIG.minClosedCandles
    ),
    minElapsedHours: envNumber(
      "PAPER_FORWARD_MIN_ELAPSED_HOURS",
      DEFAULT_PAPER_READINESS_CONFIG.minElapsedHours
    ),
    minExpectancy: envNumber(
      "PAPER_FORWARD_MIN_EXPECTANCY",
      DEFAULT_PAPER_READINESS_CONFIG.minExpectancy
    ),
    minProfitFactor: envNumber(
      "PAPER_FORWARD_MIN_PROFIT_FACTOR",
      DEFAULT_PAPER_READINESS_CONFIG.minProfitFactor
    ),
    maxDrawdown: envNumber(
      "PAPER_FORWARD_MAX_DRAWDOWN",
      DEFAULT_PAPER_READINESS_CONFIG.maxDrawdown
    ),
    minWinRate: envNumber(
      "PAPER_FORWARD_MIN_WIN_RATE",
      DEFAULT_PAPER_READINESS_CONFIG.minWinRate
    ),
    minHalfExpectancy: envNumber(
      "PAPER_FORWARD_MIN_HALF_EXPECTANCY",
      DEFAULT_PAPER_READINESS_CONFIG.minHalfExpectancy
    ),
    maxConsecutiveLosses: envNumber(
      "PAPER_FORWARD_MAX_CONSECUTIVE_LOSSES",
      DEFAULT_PAPER_READINESS_CONFIG.maxConsecutiveLosses
    ),
    maxTickErrors: envNumber(
      "PAPER_FORWARD_MAX_TICK_ERRORS",
      DEFAULT_PAPER_READINESS_CONFIG.maxTickErrors
    ),
    staleAfterHours: envNumber(
      "PAPER_FORWARD_STALE_AFTER_HOURS",
      DEFAULT_PAPER_READINESS_CONFIG.staleAfterHours
    ),
    lockLeaseMs: envNumber(
      "PAPER_FORWARD_LOCK_LEASE_MS",
      DEFAULT_PAPER_READINESS_CONFIG.lockLeaseMs
    ),
    maxSessionsPerSchedulerRun: envNumber(
      "PAPER_FORWARD_SCHEDULER_MAX_SESSIONS",
      DEFAULT_PAPER_READINESS_CONFIG.maxSessionsPerSchedulerRun
    ),
  };
  return { ...base, ...overrides };
}

export const PAPER_FORWARD_OPS_ENGINE_VERSION = "paper_forward_ops_v1_phase4c";
