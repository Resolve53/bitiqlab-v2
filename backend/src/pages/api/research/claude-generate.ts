/**
 * POST /api/research/claude-generate - Generate strategy using Claude AI
 * Claude analyzes TradingView data and creates entry/exit rules
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { Anthropic } from "@anthropic-ai/sdk";
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
    // Get current price from cache
    const cache = getPriceCache();
    await cache.updatePrices([symbol]);
    const priceData = cache.getPrice(symbol);
    const currentPrice = priceData?.price || getDefaultPrice(symbol);

    // Generate simulated indicator data based on symbol
    const indicators = generateSimulatedIndicators(currentPrice);

    // Format data for Claude
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

    // Call Claude to analyze and generate strategy
    const client = new Anthropic();

    const prompt = `You are an expert trading strategy analyst. Analyze the following chart data and create a trading strategy based on the user's idea.

Chart Data:
${JSON.stringify(chartData, null, 2)}

User's Strategy Idea: ${strategy_idea}

Based on this data and the user's idea, create a detailed trading strategy. Respond in JSON format ONLY (no markdown, no explanation) with:
{
  "name": "Strategy name based on the idea",
  "description": "Clear description of what this strategy does",
  "entry_rules": {
    "indicators": ["List of indicators used (RSI, MACD, Bollinger Bands, SMA, etc)"],
    "conditions": "Detailed entry conditions in plain English",
    "example": "Example entry signal based on current data"
  },
  "exit_rules": {
    "take_profit": "Take profit rule (e.g., '5% above entry' or 'when RSI > 70')",
    "stop_loss": "Stop loss rule (e.g., '2% below entry' or 'when price breaks below SMA20')",
    "time_based": "Time-based exit if any (e.g., 'close after 4 hours')"
  },
  "risk_assessment": "Brief risk assessment based on current market conditions",
  "expected_performance": "Realistic expectation based on indicator analysis"
}`;

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse Claude's response - handle markdown code blocks
    let strategyConfig;
    try {
      // Remove markdown code blocks if present
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7); // Remove ```json
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3); // Remove ```
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3); // Remove trailing ```
      }

      strategyConfig = JSON.parse(jsonStr.trim());
    } catch (e) {
      console.error("Failed to parse Claude response:", responseText);
      console.error("Parse error:", e);
      throw new Error("Failed to parse strategy from Claude - invalid response format");
    }

    // Save strategy to database
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

    // Log audit
    await db.createStrategyAuditLog({
      strategy_id: strategy.id,
      action: "GENERATE_CLAUDE",
      new_values: {
        ...strategy,
        claude_analysis: {
          risk_assessment: strategyConfig.risk_assessment,
          expected_performance: strategyConfig.expected_performance,
        },
      },
      changed_by: created_by,
    });

    sendSuccess(
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
    console.error("Claude strategy generation error:", error);
    sendError(
      res,
      error instanceof Error ? error.message : "Failed to generate strategy",
      500,
      req
    );
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
  // Generate realistic but varied indicators
  const baseRSI = 45 + Math.random() * 20; // RSI between 45-65
  const volatility = Math.random() * 0.05; // 5% volatility

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
    recent_prices: Array.from({ length: 5 }, (_, i) =>
      Math.round(price * (0.98 + Math.random() * 0.04) * 100) / 100
    ),
  };
}
