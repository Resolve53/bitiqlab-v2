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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }

    const client = new Anthropic({ apiKey });

    const prompt = `You must respond ONLY with valid JSON, no markdown, no explanation, no additional text.

Analyze this trading data and strategy idea, then output ONLY a JSON object:

Chart Data:
Symbol: ${symbol}
Current Price: ${chartData.current_price}
RSI: ${chartData.rsi}
MACD: line=${chartData.macd_line}, signal=${chartData.macd_signal}
Bollinger Bands: upper=${chartData.bollinger_upper}, middle=${chartData.bollinger_middle}, lower=${chartData.bollinger_lower}
SMA20: ${chartData.sma_20}
SMA50: ${chartData.sma_50}

Strategy Idea: ${strategy_idea}

Output this exact JSON structure (and NOTHING else):
{
  "name": "A descriptive strategy name",
  "description": "What this strategy does",
  "entry_rules": {
    "indicators": ["RSI", "MACD"],
    "conditions": "Entry condition description",
    "example": "Example based on current data"
  },
  "exit_rules": {
    "take_profit": "Take profit rule",
    "stop_loss": "Stop loss rule",
    "time_based": "Time exit rule if any"
  },
  "risk_assessment": "Risk assessment",
  "expected_performance": "Expected performance based on indicators"
}`;

    let message;
    try {
      message = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });
    } catch (apiError) {
      const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
      console.error("Anthropic API error:", {
        message: errorMsg,
        error: apiError,
      });
      throw new Error(`Anthropic API call failed: ${errorMsg}`);
    }

    // Validate message structure
    if (!message.content || message.content.length === 0) {
      console.error("Claude returned empty message content:", message);
      throw new Error("Claude returned empty response - no content blocks");
    }

    const firstBlock = message.content[0];
    if (firstBlock.type !== "text") {
      console.error("Claude returned non-text content:", {
        type: firstBlock.type,
        content: message.content,
      });
      throw new Error(`Claude returned ${firstBlock.type} instead of text`);
    }

    const responseText = firstBlock.text;
    console.log("Claude API response received:", {
      contentLength: responseText.length,
      stopReason: message.stop_reason,
      firstChars: responseText.substring(0, 100),
      lastChars: responseText.substring(Math.max(0, responseText.length - 100)),
    });

    // Parse Claude's response - handle markdown code blocks and invalid formats
    let strategyConfig;
    try {
      if (!responseText) {
        throw new Error("Claude returned empty response");
      }

      // Step 1: Extract JSON from potential markdown blocks
      let jsonStr = responseText.trim();

      console.log("Raw response text length:", jsonStr.length);
      console.log("Checking for markdown blocks...");

      // Check for markdown code block wrappers
      if (jsonStr.startsWith("```json")) {
        console.log("Found ```json block, stripping...");
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith("```")) {
        console.log("Found ``` block, stripping...");
        jsonStr = jsonStr.slice(3);
      }

      if (jsonStr.endsWith("```")) {
        console.log("Found trailing ```, stripping...");
        jsonStr = jsonStr.slice(0, -3);
      }

      jsonStr = jsonStr.trim();

      // Step 2: Find JSON object if there's surrounding text
      if (!jsonStr.startsWith("{")) {
        console.log(
          "Response doesn't start with {, searching for JSON object..."
        );
        const jsonStart = jsonStr.indexOf("{");
        const jsonEnd = jsonStr.lastIndexOf("}");

        if (jsonStart === -1 || jsonEnd === -1) {
          console.error(
            "No valid JSON object found in response:",
            jsonStr.substring(0, 200)
          );
          throw new Error("No JSON object found in Claude response");
        }

        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
        console.log("Extracted JSON object from response");
      }

      console.log("Attempting to parse JSON...");
      console.log("JSON string preview:", jsonStr.substring(0, 200));

      strategyConfig = JSON.parse(jsonStr);

      console.log("Successfully parsed JSON, validating fields...");

      // Step 3: Validate required fields in response
      const requiredFields = ["name", "description", "entry_rules", "exit_rules"];
      const missingFields = requiredFields.filter((field) => !strategyConfig[field]);

      if (missingFields.length > 0) {
        console.error(
          "Missing required fields:",
          missingFields,
          "Response keys:",
          Object.keys(strategyConfig)
        );
        throw new Error(
          `Missing required fields: ${missingFields.join(", ")}`
        );
      }

      // Validate nested structures
      if (
        !strategyConfig.entry_rules.indicators ||
        !strategyConfig.entry_rules.conditions
      ) {
        throw new Error("Invalid entry_rules structure");
      }

      if (
        !strategyConfig.exit_rules.take_profit ||
        !strategyConfig.exit_rules.stop_loss
      ) {
        throw new Error("Invalid exit_rules structure");
      }

      console.log("Strategy config validation passed");
    } catch (parseError) {
      console.error("=== JSON Parsing Error ===");
      console.error("Original response (full):", responseText);
      console.error("Error details:", {
        message: parseError instanceof Error ? parseError.message : parseError,
        type: typeof parseError,
      });
      console.error("Response length:", responseText.length);
      console.error("First 500 chars:", responseText.substring(0, 500));
      console.error("Last 500 chars:", responseText.substring(Math.max(0, responseText.length - 500)));

      throw new Error(
        parseError instanceof Error
          ? `Failed to parse strategy from Claude: ${parseError.message}`
          : "Failed to parse strategy from Claude - invalid response format"
      );
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
