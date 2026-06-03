/**
 * Pre-execution confirmation gate:
 * 1. On-chain metrics
 * 2. Economic calendar
 * 3. Claude pre-trade score (chart + context)
 */

import { getOnChainMetrics } from "./on-chain-service";
import { getUpcomingHighImpactEvents } from "./calendar-service";
import { getDB } from "./db";
import {
  buildChartContext,
  scorePreTradeSignal,
  type PreTradeChartContext,
} from "./pre-trade-scorer";

export type SignalSide = "BUY" | "SELL";

export interface SignalConfirmationConfig {
  enabled?: boolean;
  minOnChainScore?: number;
  blockHighImpactCalendar?: boolean;
  calendarBlockHoursAhead?: number;
  gateBuyOnly?: boolean;
  requireClaudeScore?: boolean;
  minClaudeScore?: number;
}

export interface SignalConfirmationChecks {
  onChain: { passed: boolean; score: number; message: string };
  calendar: {
    passed: boolean;
    message: string;
    eventName?: string;
    hoursUntil?: number;
  };
  claude: {
    passed: boolean;
    score: number;
    message: string;
    recommendation?: string;
    analysis?: string;
    skipped?: boolean;
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

function getDefaultConfig(): Required<
  Pick<
    SignalConfirmationConfig,
    | "enabled"
    | "minOnChainScore"
    | "blockHighImpactCalendar"
    | "calendarBlockHoursAhead"
    | "gateBuyOnly"
    | "requireClaudeScore"
    | "minClaudeScore"
  >
> {
  return {
    enabled: process.env.SIGNAL_REQUIRE_CONFIRMATIONS !== "false",
    minOnChainScore: parseInt(process.env.SIGNAL_MIN_ONCHAIN_SCORE || "50", 10),
    blockHighImpactCalendar: process.env.SIGNAL_BLOCK_HIGH_IMPACT_CALENDAR !== "false",
    calendarBlockHoursAhead: parseInt(
      process.env.SIGNAL_CALENDAR_BLOCK_HOURS || "4",
      10
    ),
    gateBuyOnly: process.env.SIGNAL_GATE_BUY_ONLY !== "false",
    requireClaudeScore: process.env.SIGNAL_REQUIRE_CLAUDE_SCORE !== "false",
    minClaudeScore: parseInt(process.env.SIGNAL_MIN_CLAUDE_SCORE || "65", 10),
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
      confidence_score: result.approved ? result.checks.claude.score : 0,
      reasoning: result.approved
        ? `Confirmed: ${result.technicalReason || "signal"}`
        : result.blockReason || "Blocked by confirmation gate",
      on_chain_data: {
        onChain: result.checks.onChain,
        claude: result.checks.claude,
      },
      macro_context: JSON.stringify(result.checks.calendar),
      technical_indicators: {
        claudeScore: result.checks.claude.score,
        claudeRecommendation: result.checks.claude.recommendation,
      },
    });
  } catch (err) {
    console.warn("[SIGNAL-CONFIRM] Could not persist to trade_signals:", err);
  }
}

/**
 * Run on-chain, calendar, and Claude checks before placing an entry order.
 */
export async function confirmSignalBeforeExecution(params: {
  symbol: string;
  side: SignalSide;
  strategyId?: string;
  sessionId?: string;
  technicalReason?: string;
  technicalConfidence?: number;
  timeframe?: string;
  currentPrice?: number;
  entryRules?: unknown;
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
        claude: { passed: true, score: 100, message: "Skipped", skipped: true },
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
      : Promise.resolve({ hasBlockingEvent: false } as Awaited<ReturnType<typeof getUpcomingHighImpactEvents>>),
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

  let claudeCheck: SignalConfirmationChecks["claude"] = {
    passed: true,
    score: 0,
    message: "Claude check skipped",
    skipped: true,
  };

  let claudePassed = true;

  if (cfg.requireClaudeScore && onChainPassed && calendarPassed) {
    try {
      const timeframe = params.timeframe || "1h";
      let currentPrice = params.currentPrice ?? 0;
      if (!currentPrice) {
        const { getTradingClient } = await import("./binance-trading");
        currentPrice = await getTradingClient(true).getPrice(params.symbol);
      }

      const chartCtx: PreTradeChartContext = await buildChartContext(
        params.symbol,
        timeframe,
        currentPrice,
        params.entryRules,
        params.technicalReason,
        params.technicalConfidence
      );
      chartCtx.onChainScore = onChain.combinedScore;
      chartCtx.onChainMessage = onChainMessage;
      chartCtx.calendarMessage = calendarMessage;

      const claudeResult = await scorePreTradeSignal(chartCtx);
      claudePassed =
        claudeResult.skipped || (claudeResult.approved && claudeResult.score >= cfg.minClaudeScore);

      claudeCheck = {
        passed: claudePassed,
        score: claudeResult.score,
        message: claudeResult.message,
        recommendation: claudeResult.recommendation,
        analysis: claudeResult.analysis,
        skipped: claudeResult.skipped,
      };
    } catch (err) {
      const failOpen = process.env.SIGNAL_CLAUDE_FAIL_OPEN !== "false";
      claudePassed = failOpen;
      claudeCheck = {
        passed: failOpen,
        score: 0,
        message: `Claude check error: ${err instanceof Error ? err.message : "unknown"}`,
        skipped: true,
      };
    }
  } else if (!cfg.requireClaudeScore) {
    claudeCheck = {
      passed: true,
      score: 0,
      message: "Claude pre-trade scoring disabled",
      skipped: true,
    };
  } else if (cfg.requireClaudeScore) {
    claudeCheck = {
      passed: true,
      score: 0,
      message: "Claude not run — on-chain or calendar gate failed first",
      skipped: true,
    };
  }

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
    claude: claudeCheck,
  };

  const approved = onChainPassed && calendarPassed && claudePassed;
  const blockReasons: string[] = [];
  if (!onChainPassed) blockReasons.push(onChainMessage);
  if (!calendarPassed) blockReasons.push(calendarMessage);
  if (!claudePassed && cfg.requireClaudeScore) blockReasons.push(claudeCheck.message);

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
      `[SIGNAL-CONFIRM] ✓ Approved ${params.side} ${params.symbol} (on-chain ${onChain.combinedScore}, claude ${claudeCheck.score})`
    );
  }

  return result;
}
