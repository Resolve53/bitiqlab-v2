/**
 * Shared Claude strategy generation (used by /api/research/generate and legacy claude-generate)
 *
 * Flow:
 * Claude tool-use → Truth Engine validation → (optional one correction) → save
 * Never saves strategies the Truth Engine cannot execute.
 */

import { StrategyGenerator } from "@/autoresearch/wrapper";
import {
  PHASE1_SYMBOLS,
  PHASE1_TIMEFRAMES,
  toPersistedRules,
  validateGeneratedStrategyForSave,
  STRATEGY_SCHEMA_VERSION,
  type ClaudeExecutableStrategy,
} from "@/lib/claude-strategy-schema";
import { getDB } from "@/lib/db";
import { getPriceCache } from "@/lib/price-cache";
import { StrategyValidationError } from "@/truth-engine";

export interface GenerateStrategyInput {
  prompt: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  created_by?: string;
  /** Test injection — skip live Anthropic */
  generator?: StrategyGenerator;
}

export interface GenerateStrategyResult {
  strategy: Record<string, unknown>;
  analysis: {
    risk_assessment: string;
    expected_performance: string;
    model: string;
    schema_version: string;
    executable: true;
    chart_data?: Record<string, unknown>;
  };
  message: string;
}

function assertPhase1Market(symbol: string, timeframe: string, market_type: string) {
  const sym = symbol.toUpperCase();
  if (!(PHASE1_SYMBOLS as readonly string[]).includes(sym)) {
    throw new Error(
      `Unsupported symbol "${symbol}". Phase 1 supports: ${PHASE1_SYMBOLS.join(", ")}`
    );
  }
  if (!(PHASE1_TIMEFRAMES as readonly string[]).includes(timeframe)) {
    throw new Error(
      `Unsupported timeframe "${timeframe}". Phase 1 supports: ${PHASE1_TIMEFRAMES.join(
        ", "
      )}`
    );
  }
  if (market_type !== "spot" && market_type !== "futures") {
    throw new Error("Invalid market_type. Must be 'spot' or 'futures'");
  }
}

function buildAnalysis(
  strategy: ClaudeExecutableStrategy,
  prompt: string,
  symbol: string,
  timeframe: string
) {
  const sl = strategy.stop_loss_percent;
  const tp = strategy.take_profit_percent ?? "n/a";
  const description = strategy.description || "";

  return {
    risk_assessment:
      description ||
      `Claude-generated ${symbol} ${timeframe} strategy. Risk ${strategy.risk_per_trade_pct}% per trade with ${sl}% stop loss.`,
    expected_performance: `Designed around your idea: "${prompt.slice(0, 120)}${
      prompt.length > 120 ? "…" : ""
    }". Target TP ${tp}% vs SL ${sl}% — Truth Engine validated before save.`,
    model: process.env.STRATEGY_CLAUDE_MODEL || "claude-opus-4-1",
    schema_version: STRATEGY_SCHEMA_VERSION,
    executable: true as const,
  };
}

function tryValidate(
  generated: ClaudeExecutableStrategy
): { ok: true; definition: ReturnType<typeof validateGeneratedStrategyForSave> } | {
  ok: false;
  error: string;
} {
  try {
    const { entry_rules, exit_rules } = toPersistedRules(generated);
    const definition = validateGeneratedStrategyForSave({
      name: generated.name,
      symbol: generated.symbol,
      timeframe: generated.timeframe,
      market_type: generated.market_type,
      entry_rules,
      exit_rules,
      leverage: generated.leverage,
    });
    return { ok: true, definition };
  } catch (err) {
    const message =
      err instanceof StrategyValidationError || err instanceof Error
        ? err.message
        : "Strategy validation failed";
    return { ok: false, error: message };
  }
}

export async function generateStrategyFromPrompt(
  input: GenerateStrategyInput
): Promise<GenerateStrategyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !input.generator) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured on the backend. Add it to Railway environment variables."
    );
  }

  const {
    prompt,
    symbol: rawSymbol,
    timeframe,
    market_type,
    created_by = "system",
  } = input;

  const symbol = rawSymbol.toUpperCase();
  assertPhase1Market(symbol, timeframe, market_type);

  const generator =
    input.generator || new StrategyGenerator(apiKey as string);

  let generated = await generator.generate({
    prompt,
    symbol,
    timeframe,
    market_type,
  });

  // Force caller market params (Claude may echo differently)
  generated = {
    ...generated,
    symbol,
    timeframe,
    market_type: market_type === "futures" ? "futures" : "spot",
  };

  let validation = tryValidate(generated);

  if (!validation.ok) {
    const corrected = await generator.generateCorrected(
      { prompt, symbol, timeframe, market_type },
      generated,
      validation.error
    );
    generated = {
      ...corrected,
      symbol,
      timeframe,
      market_type: market_type === "futures" ? "futures" : "spot",
    };
    validation = tryValidate(generated);
  }

  if (!validation.ok) {
    throw new Error(
      `Strategy generation failed Truth Engine validation and was not saved: ${validation.error}`
    );
  }

  const { entry_rules, exit_rules } = toPersistedRules(generated);

  // Guard: never persist empty/null executable rules
  if (
    !entry_rules.entries ||
    !Array.isArray(entry_rules.entries) ||
    entry_rules.entries.length === 0
  ) {
    throw new Error(
      "Refusing to save strategy with null/empty entries after generation"
    );
  }

  const db = getDB();
  const savedStrategy = await db.createStrategy({
    name: generated.name || `${symbol} Strategy`,
    description: generated.description || undefined,
    symbol,
    timeframe,
    market_type,
    entry_rules,
    exit_rules,
    created_by,
    ai_enhancement: {
      schema_version: STRATEGY_SCHEMA_VERSION,
      executable: true,
      risk_per_trade_pct: generated.risk_per_trade_pct,
      leverage: generated.leverage,
      source: "claude_tool_submit_executable_strategy",
    },
  });

  // Re-validate persisted row shape (round-trip semantics)
  validateGeneratedStrategyForSave({
    id: savedStrategy.id,
    name: savedStrategy.name,
    symbol: savedStrategy.symbol,
    timeframe: savedStrategy.timeframe,
    market_type: savedStrategy.market_type,
    entry_rules: savedStrategy.entry_rules,
    exit_rules: savedStrategy.exit_rules,
  });

  await db.createStrategyAuditLog({
    strategy_id: savedStrategy.id,
    action: "GENERATE",
    new_values: savedStrategy,
    changed_by: created_by,
  });

  let chart_data: Record<string, unknown> | undefined;
  try {
    const cache = getPriceCache();
    await cache.updatePrices([symbol]);
    const priceData = cache.getPrice(symbol);
    if (priceData) {
      chart_data = {
        symbol,
        timeframe,
        current_price: priceData.price,
        source: "binance",
      };
    }
  } catch {
    // Chart snapshot optional
  }

  const analysis = {
    ...buildAnalysis(generated, prompt, symbol, timeframe),
    chart_data,
  };

  return {
    strategy: savedStrategy as unknown as Record<string, unknown>,
    analysis,
    message: "Strategy generated, Truth Engine validated, and saved",
  };
}
