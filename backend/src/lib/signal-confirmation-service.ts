/**
 * Pre-execution confirmation gate: on-chain metrics + economic calendar
 * before any BUY (entry) is sent to Binance testnet.
 */

import { getOnChainMetrics } from "./on-chain-service";
import { getUpcomingHighImpactEvents } from "./calendar-service";
import { getDB } from "./db";

export type SignalSide = "BUY" | "SELL";

export interface SignalConfirmationConfig {
  enabled?: boolean;
  minOnChainScore?: number;
  blockHighImpactCalendar?: boolean;
  calendarBlockHoursAhead?: number;
  gateBuyOnly?: boolean;
}

export interface SignalConfirmationChecks {
  onChain: { passed: boolean; score: number; message: string };
  calendar: {
    passed: boolean;
    message: string;
    eventName?: string;
    hoursUntil?: number;
  };
}

export interface SignalConfirmationResult {
  approved: boolean;
  symbol: string;
  side: SignalSide;
  strategyId?: string;
  sessionId?: string;
  technicalReason?: string;
  checks: SignalConfirmationChecks;
  blockReason?: string;
  timestamp: string;
}

const recentBySession = new Map<string, SignalConfirmationResult[]>();
const MAX_RECENT_PER_SESSION = 50;

function getDefaultConfig(): Required<SignalConfirmationConfig> {
  return {
    enabled: process.env.SIGNAL_REQUIRE_CONFIRMATIONS !== "false",
    minOnChainScore: parseInt(process.env.SIGNAL_MIN_ONCHAIN_SCORE || "50", 10),
    blockHighImpactCalendar: process.env.SIGNAL_BLOCK_HIGH_IMPACT_CALENDAR !== "false",
    calendarBlockHoursAhead: parseInt(
      process.env.SIGNAL_CALENDAR_BLOCK_HOURS || "4",
      10
    ),
    gateBuyOnly: process.env.SIGNAL_GATE_BUY_ONLY !== "false",
  };
}

export function getRecentConfirmations(
  sessionId: string,
  limit = 20
): SignalConfirmationResult[] {
  return (recentBySession.get(sessionId) || []).slice(0, limit);
}

function recordDecision(
  sessionId: string | undefined,
  result: SignalConfirmationResult
): void {
  if (!sessionId) return;
  const list = recentBySession.get(sessionId) || [];
  list.unshift(result);
  recentBySession.set(sessionId, list.slice(0, MAX_RECENT_PER_SESSION));
}

async function persistSignal(
  strategyId: string | undefined,
  result: SignalConfirmationResult
): Promise<void> {
  if (!strategyId) return;
  try {
    const db = getDB();
    await db.createTradeSignal({
      strategy_id: strategyId,
      symbol: result.symbol,
      signal_type: result.side.toLowerCase(),
      signal_strength: result.checks.onChain.score,
      confidence_score: result.approved ? result.checks.onChain.score : 0,
      reasoning: result.approved
        ? `Confirmed: ${result.technicalReason || "signal"}`
        : result.blockReason || "Blocked by confirmation gate",
      on_chain_data: result.checks.onChain,
      macro_context: JSON.stringify(result.checks.calendar),
    });
  } catch (err) {
    console.warn("[SIGNAL-CONFIRM] Could not persist to trade_signals:", err);
  }
}

/**
 * Run on-chain + calendar checks before placing an entry order.
 * SELL exits skip confirmation by default (gateBuyOnly).
 */
export async function confirmSignalBeforeExecution(params: {
  symbol: string;
  side: SignalSide;
  strategyId?: string;
  sessionId?: string;
  technicalReason?: string;
  config?: SignalConfirmationConfig;
}): Promise<SignalConfirmationResult> {
  const cfg = { ...getDefaultConfig(), ...params.config };
  const timestamp = new Date().toISOString();

  const skipGate =
    !cfg.enabled || (cfg.gateBuyOnly && params.side === "SELL");

  if (skipGate) {
    const result: SignalConfirmationResult = {
      approved: true,
      symbol: params.symbol,
      side: params.side,
      strategyId: params.strategyId,
      sessionId: params.sessionId,
      technicalReason: params.technicalReason,
      checks: {
        onChain: { passed: true, score: 100, message: "Skipped (exit or gate disabled)" },
        calendar: { passed: true, message: "Skipped" },
      },
      timestamp,
    };
    recordDecision(params.sessionId, result);
    return result;
  }

  const [onChain, calendar] = await Promise.all([
    getOnChainMetrics(params.symbol),
    cfg.blockHighImpactCalendar
      ? getUpcomingHighImpactEvents(params.symbol, cfg.calendarBlockHoursAhead)
      : Promise.resolve({ hasBlockingEvent: false }),
  ]);

  const onChainPassed = onChain.combinedScore >= cfg.minOnChainScore;
  const onChainMessage = onChainPassed
    ? `On-chain score ${onChain.combinedScore}/100 (min ${cfg.minOnChainScore})`
    : `On-chain score ${onChain.combinedScore}/100 below minimum ${cfg.minOnChainScore}. ${onChain.recommendation}`;

  const calendarPassed = !calendar.hasBlockingEvent;
  const calendarMessage = calendarPassed
    ? `No high-impact macro events in next ${cfg.calendarBlockHoursAhead}h`
    : calendar.hasBlockingEvent
      ? `Blocked: ${calendar.eventName} (${calendar.importance})${calendar.hoursUntil != null ? ` in ~${calendar.hoursUntil}h` : " today"}`
      : "Calendar check failed";

  const checks: SignalConfirmationChecks = {
    onChain: {
      passed: onChainPassed,
      score: onChain.combinedScore,
      message: onChainMessage,
    },
    calendar: {
      passed: calendarPassed,
      message: calendarMessage,
      eventName: calendar.eventName,
      hoursUntil: calendar.hoursUntil,
    },
  };

  const approved = onChainPassed && calendarPassed;
  const blockReasons: string[] = [];
  if (!onChainPassed) blockReasons.push(onChainMessage);
  if (!calendarPassed) blockReasons.push(calendarMessage);

  const result: SignalConfirmationResult = {
    approved,
    symbol: params.symbol,
    side: params.side,
    strategyId: params.strategyId,
    sessionId: params.sessionId,
    technicalReason: params.technicalReason,
    checks,
    blockReason: approved ? undefined : blockReasons.join("; "),
    timestamp,
  };

  recordDecision(params.sessionId, result);
  await persistSignal(params.strategyId, result);

  if (!approved) {
    console.log(
      `[SIGNAL-CONFIRM] ✗ Blocked ${params.side} ${params.symbol}: ${result.blockReason}`
    );
  } else {
    console.log(
      `[SIGNAL-CONFIRM] ✓ Approved ${params.side} ${params.symbol} (on-chain ${onChain.combinedScore})`
    );
  }

  return result;
}
