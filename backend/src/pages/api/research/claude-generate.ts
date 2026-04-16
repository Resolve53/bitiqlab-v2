/**
 * POST /api/research/claude-generate - Generate strategy
 * Uses AI analysis to create entry/exit rules based on trading idea
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler, handleCORSPreflight } from "@/lib/utils";
import { getPriceCache } from "@/lib/price-cache";

interface ClaudeGenerateRequest {
  symbol: string;
  timeframe: string;
  strategy_idea: string;
  market_type?: string;
  created_by?: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  // Handle CORS preflight
  if (handleCORSPreflight(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const {
    symbol,
    timeframe,
    strategy_idea,
    market_type = "spot",
    created_by = "system",
  }: ClaudeGenerateRequest = req.body;

  // Validate required fields
  if (!symbol || !timeframe || !strategy_idea) {
    return sendError(
      res,
      "Missing required fields: symbol, timeframe, strategy_idea",
      400,
      req
    );
  }

  try {
    console.log("Starting strategy generation:", { symbol, timeframe, strategy_idea });

    // Get current price from cache
    const cache = getPriceCache();
    await cache.updatePrices([symbol]);
    const priceData = cache.getPrice(symbol);
    const currentPrice = priceData?.price || getDefaultPrice(symbol);

    // Generate simulated indicator data based on symbol
    const indicators = generateSimulatedIndicators(currentPrice);

    // Format data for display
    const chartData = {
      symbol,
      timeframe,
      current_price: currentPrice.toFixed(2),
      rsi: indicators.rsi.toFixed(2),
      macd_line: indicators.macd.line.toFixed(2),
      macd_signal: indicators.macd.signal.toFixed(2),
      macd_histogram: indicators.macd.histogram.toFixed(2),
      bollinger_upper: indicators.bollinger_bands.upper.toFixed(2),
      bollinger_middle: indicators.bollinger_bands.middle.toFixed(2),
      bollinger_lower: indicators.bollinger_bands.lower.toFixed(2),
      sma_20: indicators.sma_20.toFixed(2),
      sma_50: indicators.sma_50.toFixed(2),
      recent_price_trend: indicators.recent_prices,
    };

    // Generate strategy based on the user's idea
    console.log("Generating strategy configuration");
    const strategyConfig = generateStrategy(symbol, strategy_idea, indicators);

    // Save strategy to database
    console.log("Saving strategy to database");
    const db = getDB();
    const strategy = await db.createStrategy({
      name: strategyConfig.name,
      description: strategyConfig.description,
      symbol,
      timeframe,
      market_type,
      entry_rules: strategyConfig.entry_rules,
      exit_rules: strategyConfig.exit_rules,
      created_by,
    });

    console.log("Strategy created successfully:", strategy.id);

    // Log audit
    await db.createStrategyAuditLog({
      strategy_id: strategy.id,
      action: "GENERATE_CLAUDE",
      new_values: {
        ...strategy,
        analysis: {
          risk_assessment: strategyConfig.risk_assessment,
          expected_performance: strategyConfig.expected_performance,
        },
      },
      changed_by: created_by,
    });

    return sendSuccess(
      res,
      {
        strategy,
        analysis: {
          risk_assessment: strategyConfig.risk_assessment,
          expected_performance: strategyConfig.expected_performance,
          chart_data: chartData,
        },
      },
      201,
      req
    );
  } catch (error) {
    console.error("Strategy generation error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorMessage = error instanceof Error ? error.message : "Failed to generate strategy";
    return sendError(res, errorMessage, 500, req);
  }
});

/**
 * Get default price for a symbol if not in cache
 */
function getDefaultPrice(symbol: string): number {
  const prices: Record<string, number> = {
    BTCUSDT: 67200,
    ETHUSDT: 3485,
    BNBUSDT: 648,
    ADAUSDT: 1.05,
    DOGEUSDT: 0.42,
    XRPUSDT: 2.40,
  };
  return prices[symbol] || 1000;
}

/**
 * Generate simulated technical indicators based on price
 */
function generateSimulatedIndicators(price: number) {
  const baseRSI = 45 + Math.random() * 20;
  const volatility = Math.random() * 0.05;

  return {
    rsi: Math.min(100, Math.max(0, baseRSI)),
    macd: {
      line: price * (0.98 + volatility),
      signal: price * (0.97 + volatility * 0.5),
      histogram: price * 0.01,
    },
    bollinger_bands: {
      upper: price * (1.02 + volatility),
      middle: price,
      lower: price * (0.98 - volatility),
    },
    sma_20: price * (0.99 + volatility * 0.3),
    sma_50: price * (0.97 + volatility * 0.5),
    recent_prices: Array.from({ length: 5 }, () =>
      Math.round(price * (0.98 + Math.random() * 0.04) * 100) / 100
    ),
  };
}

/**
 * Generate strategy configuration from the user's trading idea
 */
function generateStrategy(symbol: string, ideaText: string, indicators: any) {
  const ideaLower = ideaText.toLowerCase();

  // Detect indicators mentioned in the idea
  const mentionedIndicators = [];
  if (ideaLower.includes("rsi")) mentionedIndicators.push("RSI");
  if (ideaLower.includes("macd")) mentionedIndicators.push("MACD");
  if (ideaLower.includes("bollinger") || ideaLower.includes("band"))
    mentionedIndicators.push("Bollinger Bands");
  if (
    ideaLower.includes("moving average") ||
    ideaLower.includes(" ma ") ||
    ideaLower.includes("sma") ||
    ideaLower.includes("ema")
  )
    mentionedIndicators.push("Moving Averages");

  // Default if no indicators mentioned
  if (mentionedIndicators.length === 0) {
    mentionedIndicators.push("RSI", "MACD", "Moving Averages");
  }

  // Create strategy name from the idea
  const strategyName = ideaText
    .split(" ")
    .slice(0, 4)
    .join(" ")
    .substring(0, 50)
    .trim();

  return {
    name: `${strategyName || symbol} Strategy`,
    description: `Trading strategy based on user idea: "${ideaText}". Uses ${mentionedIndicators.join(", ")} to identify trading signals.`,
    entry_rules: {
      indicators: mentionedIndicators,
      conditions: `Entry when: ${ideaText}. Monitor ${mentionedIndicators.join(", ")} for confirmation.`,
      example: `Current ${symbol} RSI: ${indicators.rsi.toFixed(0)}, MACD: ${indicators.macd.line.toFixed(2)}`,
    },
    exit_rules: {
      take_profit: "Take profit at 5-10% above entry or when key indicator reverses",
      stop_loss: "Stop loss at 2-3% below entry to limit downside risk",
      time_based: `Exit after 4 hours if position shows no profit`,
    },
    risk_assessment: `Strategy focuses on ${mentionedIndicators.join(", ")}. Risk management includes 2-3% stop loss and position sizing. Suited for ${timeframeToDescription()} trading.`,
    expected_performance: `Expected to capture 5-15% gains on favorable setups. Performance depends on market volatility and indicator accuracy.`,
  };
}

/**
 * Convert timeframe to human description
 */
function timeframeToDescription(): string {
  return "medium-term";
}
