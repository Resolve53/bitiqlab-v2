/**
 * POST /api/research/claude-generate - Generate strategy using Claude AI
 * Claude analyzes TradingView data and creates entry/exit rules
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { Anthropic } from "@anthropic-ai/sdk";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler, handleCORSPreflight } from "@/lib/utils";
import { BinanceDataFetcher, calculateIndicators } from "@/lib/binance-fetcher";

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
    return sendError(res, "Method not allowed", 405);
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
      400
    );
  }

  try {
    // Fetch real OHLCV data from Binance
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 90); // 90 days of data

    const fetcher = new BinanceDataFetcher();
    const ohlcvData = await fetcher.getOHLCV(symbol, timeframe, startDate, endDate);
    const indicators = calculateIndicators(ohlcvData);

    // Format data for Claude
    const chartData = {
      symbol,
      timeframe,
      current_price: indicators.current_price,
      rsi: indicators.rsi.toFixed(2),
      macd_line: indicators.macd.line.toFixed(2),
      macd_signal: indicators.macd.signal.toFixed(2),
      macd_histogram: indicators.macd.histogram.toFixed(2),
      bollinger_upper: indicators.bollinger_bands.upper.toFixed(2),
      bollinger_middle: indicators.bollinger_bands.middle.toFixed(2),
      bollinger_lower: indicators.bollinger_bands.lower.toFixed(2),
      sma_20: indicators.sma_20.toFixed(2),
      sma_50: indicators.sma_50.toFixed(2),
      recent_price_trend: indicators.price_history.slice(-5),
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

    // Parse Claude's response
    let strategyConfig;
    try {
      strategyConfig = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse Claude response:", responseText);
      throw new Error("Failed to parse strategy from Claude");
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
      201
    );
  } catch (error) {
    console.error("Claude strategy generation error:", error);
    sendError(
      res,
      error instanceof Error ? error.message : "Failed to generate strategy",
      500
    );
  }
});
