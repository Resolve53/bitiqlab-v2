/**
 * Claude pre-trade scoring: chart + technical context before order execution.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getEvaluator } from "./strategy-evaluator";
import type { StrategySignal } from "./strategy-evaluator";

export interface PreTradeChartContext {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  technicalConfidence?: number;
  technicalReason?: string;
  indicators?: StrategySignal["indicators"];
  onChainScore?: number;
  onChainMessage?: string;
  calendarMessage?: string;
}

export interface PreTradeScoreResult {
  score: number;
  approved: boolean;
  recommendation: "execute" | "reject" | "caution";
  analysis: string;
  skipped: boolean;
  message: string;
}

const scoreCache = new Map<string, { result: PreTradeScoreResult; expiry: number }>();

function cacheKey(ctx: PreTradeChartContext): string {
  return `${ctx.symbol}:${ctx.timeframe}:${Math.round(ctx.currentPrice)}`;
}

function getCacheTtlMs(): number {
  return parseInt(process.env.SIGNAL_CLAUDE_CACHE_SECONDS || "90", 10) * 1000;
}

function getMinScore(): number {
  return parseInt(process.env.SIGNAL_MIN_CLAUDE_SCORE || "65", 10);
}

function getModel(): string {
  return process.env.SIGNAL_CLAUDE_MODEL || process.env.LLM_MODEL || "claude-sonnet-4-20250514";
}

function isClaudeEnabled(): boolean {
  return (
    process.env.SIGNAL_REQUIRE_CLAUDE_SCORE !== "false" &&
    !!process.env.ANTHROPIC_API_KEY
  );
}

function failOpenOnError(): boolean {
  return process.env.SIGNAL_CLAUDE_FAIL_OPEN !== "false";
}

export async function buildChartContext(
  symbol: string,
  timeframe: string,
  currentPrice: number,
  entryRules?: unknown,
  technicalReason?: string,
  technicalConfidence?: number
): Promise<PreTradeChartContext> {
  const evaluator = getEvaluator();
  let entryRulesNorm: { indicators?: string[]; conditions?: string[] } = {
    indicators: ["rsi", "macd"],
  };
  if (entryRules) {
    if (Array.isArray(entryRules)) {
      entryRulesNorm = { conditions: entryRules.map(String) };
    } else if (typeof entryRules === "object") {
      entryRulesNorm = entryRules as { indicators?: string[]; conditions?: string[] };
    }
  }

  const signal = await evaluator.evaluateEntry(
    symbol,
    timeframe,
    entryRulesNorm,
    currentPrice
  );

  return {
    symbol,
    timeframe,
    currentPrice,
    technicalConfidence: technicalConfidence ?? signal.confidence,
    technicalReason: technicalReason ?? signal.reason,
    indicators: signal.indicators,
  };
}

export async function scorePreTradeSignal(
  context: PreTradeChartContext
): Promise<PreTradeScoreResult> {
  if (!isClaudeEnabled()) {
    return {
      score: 50,
      approved: true,
      recommendation: "caution",
      analysis: "Claude pre-trade scoring disabled or API key missing",
      skipped: true,
      message: "Claude check skipped",
    };
  }

  const key = cacheKey(context);
  const cached = scoreCache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.result;
  }

  try {
    const client = new Anthropic();
    const ind = context.indicators;

    const prompt = `You are a cryptocurrency trade risk analyst. Decide if we should execute this ${context.symbol} BUY entry on ${context.timeframe} timeframe RIGHT NOW.

MARKET DATA:
- Symbol: ${context.symbol}
- Timeframe: ${context.timeframe}
- Current Price: $${context.currentPrice.toFixed(2)}
- Technical Confidence: ${context.technicalConfidence ?? "unknown"}%
- Technical Reason: ${context.technicalReason || "none"}
${ind?.rsi != null ? `- RSI: ${ind.rsi.toFixed(2)}` : ""}
${ind?.macd ? `- MACD line: ${ind.macd.line.toFixed(4)}, signal: ${ind.macd.signal.toFixed(4)}, histogram: ${ind.macd.histogram.toFixed(4)}` : ""}
${ind?.bollinger_bands ? `- Bollinger: upper ${ind.bollinger_bands.upper.toFixed(2)}, lower ${ind.bollinger_bands.lower.toFixed(2)}` : ""}
${ind?.sma_20 != null ? `- SMA20: ${ind.sma_20.toFixed(2)}, SMA50: ${ind.sma_50?.toFixed(2) ?? "n/a"}` : ""}

ALREADY PASSED GATES:
- On-chain: ${context.onChainMessage || `score ${context.onChainScore ?? "n/a"}/100`}
- Calendar: ${context.calendarMessage || "clear"}

Respond with entry quality for execution NOW (not hindsight).

FORMAT EXACTLY:
SCORE: [0-100]
RECOMMENDATION: execute|reject|caution
ANALYSIS: [2-3 sentences]`;

    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = parsePreTradeResponse(text);
    const minScore = getMinScore();
    const approved =
      parsed.recommendation !== "reject" && parsed.score >= minScore;

    const result: PreTradeScoreResult = {
      score: parsed.score,
      approved,
      recommendation: parsed.recommendation,
      analysis: parsed.analysis,
      skipped: false,
      message: approved
        ? `Claude score ${parsed.score}/100 (min ${minScore}) — ${parsed.recommendation}`
        : `Claude blocked: score ${parsed.score}/100 (min ${minScore}), ${parsed.recommendation}. ${parsed.analysis}`,
    };

    scoreCache.set(key, { result, expiry: Date.now() + getCacheTtlMs() });
    return result;
  } catch (error) {
    console.error("[PRE-TRADE-SCORER] Claude error:", error);
    const fallback: PreTradeScoreResult = {
      score: 50,
      approved: failOpenOnError(),
      recommendation: "caution",
      analysis: "Claude API unavailable",
      skipped: true,
      message: failOpenOnError()
        ? "Claude error — fail-open allowed trade"
        : "Claude error — trade blocked (fail-closed)",
    };
    return fallback;
  }
}

function parsePreTradeResponse(text: string): {
  score: number;
  recommendation: "execute" | "reject" | "caution";
  analysis: string;
} {
  const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
  const recMatch = text.match(/RECOMMENDATION:\s*(execute|reject|caution)/i);
  const analysisMatch = text.match(/ANALYSIS:\s*(.+)/is);

  const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10))) : 50;
  const recRaw = recMatch?.[1]?.toLowerCase() || "caution";
  const recommendation =
    recRaw === "execute" || recRaw === "reject" || recRaw === "caution"
      ? recRaw
      : "caution";

  return {
    score,
    recommendation,
    analysis: analysisMatch?.[1]?.trim().slice(0, 500) || "No analysis provided",
  };
}
