/**
 * Shared Claude strategy generation (used by /api/research/generate and legacy claude-generate)
 */

import { StrategyGenerator } from "@/autoresearch/wrapper";
import { getDB } from "@/lib/db";
import { getPriceCache } from "@/lib/price-cache";

export interface GenerateStrategyInput {
  prompt: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  created_by?: string;
}

export interface GenerateStrategyResult {
  strategy: Record<string, unknown>;
  analysis: {
    risk_assessment: string;
    expected_performance: string;
    model: string;
    chart_data?: Record<string, unknown>;
  };
  message: string;
}

function buildAnalysis(
  strategy: Record<string, unknown>,
  prompt: string,
  symbol: string,
  timeframe: string
) {
  const exitRules = (strategy.exit_rules || {}) as Record<string, unknown>;
  const sl = exitRules.stop_loss_percent ?? 2;
  const tp = exitRules.take_profit_percent ?? 5;
  const description = (strategy.description as string) || "";

  return {
    risk_assessment:
      description ||
      `Claude-generated ${symbol} ${timeframe} strategy. Risk per trade capped with ${sl}% stop loss. Validate rules in paper trading before live use.`,
    expected_performance: `Designed around your idea: "${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}". Target ${tp}% take-profit vs ${sl}% stop-loss — backtest and paper trade to confirm edge.`,
    model: process.env.STRATEGY_CLAUDE_MODEL || "claude-opus-4-1",
  };
}

export async function generateStrategyFromPrompt(
  input: GenerateStrategyInput
): Promise<GenerateStrategyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured on the backend. Add it to Railway environment variables."
    );
  }

  const { prompt, symbol, timeframe, market_type, created_by = "system" } = input;

  const generator = new StrategyGenerator(apiKey);
  const generated = (await generator.generate({
    prompt,
    symbol,
    timeframe,
    market_type,
  })) as Record<string, unknown>;

  const db = getDB();
  const savedStrategy = await db.createStrategy({
    name: (generated.name as string) || `${symbol} Strategy`,
    description: generated.description as string | undefined,
    symbol,
    timeframe,
    market_type,
    entry_rules: generated.entry_rules as Record<string, unknown> | undefined,
    exit_rules: generated.exit_rules as Record<string, unknown> | undefined,
    created_by,
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
    message: "Strategy generated with Claude",
  };
}
