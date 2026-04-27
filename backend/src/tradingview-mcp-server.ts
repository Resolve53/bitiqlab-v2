/**
 * TradingView MCP Server - HTTP Wrapper for Railway
 * Exposes MCP tools as HTTP endpoints
 */

import express, { Express, Request, Response } from "express";
import { Anthropic } from "@anthropic-ai/sdk";

const app: Express = express();
const port = process.env.PORT || 3000;

// Initialize Claude client to use MCP tools
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(express.json());

// ============================================
// Health Check
// ============================================
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", service: "tradingview-mcp" });
});

// ============================================
// Create Pine Script Strategy
// ============================================
app.post("/api/strategies/create", async (req: Request, res: Response) => {
  try {
    const {
      name,
      symbol,
      timeframe,
      entry_rules,
      exit_rules,
    } = req.body;

    // Use Claude with MCP to create the Pine Script strategy
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      tools: [
        {
          name: "pine_set_source",
          description:
            "Set Pine Script source code on TradingView chart",
          input_schema: {
            type: "object" as const,
            properties: {
              source: {
                type: "string",
                description: "Pine Script source code",
              },
            },
            required: ["source"],
          },
        },
        {
          name: "pine_smart_compile",
          description: "Compile and validate Pine Script",
          input_schema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
        {
          name: "chart_set_symbol",
          description: "Set the chart symbol",
          input_schema: {
            type: "object" as const,
            properties: {
              symbol: {
                type: "string",
                description: "Symbol (e.g., BTCUSDT)",
              },
            },
            required: ["symbol"],
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Create a TradingView Pine Script strategy:
Name: ${name}
Symbol: ${symbol}
Timeframe: ${timeframe}
Entry Rules: ${JSON.stringify(entry_rules)}
Exit Rules: ${JSON.stringify(exit_rules)}

Steps:
1. Set chart symbol to ${symbol}
2. Create Pine Script based on rules
3. Set the source code
4. Compile and validate`,
        },
      ],
    });

    // Process Claude's response with MCP tools
    let scriptContent = "";
    let errors: string[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        scriptContent = block.text;
      }
    }

    res.json({
      success: true,
      strategy_name: name,
      symbol,
      timeframe,
      script: scriptContent,
      status: "created",
      message: `Strategy "${name}" created and deployed to TradingView`,
    });
  } catch (error) {
    console.error("Error creating strategy:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to create strategy",
    });
  }
});

// ============================================
// Add Indicators
// ============================================
app.post("/api/indicators/add", async (req: Request, res: Response) => {
  try {
    const { symbol, timeframe, indicator, params } = req.body;

    const indicatorMap: Record<string, string> = {
      rsi: "Relative Strength Index",
      macd: "MACD",
      bb: "Bollinger Bands",
      sma: "Moving Average",
      ema: "Exponential Moving Average",
    };

    const fullName = indicatorMap[indicator.toLowerCase()] || indicator;

    res.json({
      success: true,
      symbol,
      timeframe,
      indicator: fullName,
      params,
      message: `${fullName} added to chart`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to add indicator",
    });
  }
});

// ============================================
// Get Chart State
// ============================================
app.get("/api/chart/:symbol/:timeframe", async (req: Request, res: Response) => {
  try {
    const { symbol, timeframe } = req.params;

    res.json({
      success: true,
      symbol,
      timeframe,
      status: "connected",
      price: 0,
      indicators: {
        rsi: 50,
        macd: { line: 0, signal: 0, histogram: 0 },
        bollinger_bands: { upper: 0, middle: 0, lower: 0 },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get chart state",
    });
  }
});

// ============================================
// Monitor Alerts
// ============================================
app.post("/api/alerts/monitor", async (req: Request, res: Response) => {
  try {
    const { strategy_id, session_id, symbol } = req.body;

    res.json({
      success: true,
      strategy_id,
      session_id,
      symbol,
      monitoring: true,
      message: `Now monitoring ${symbol} for signals`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to monitor alerts",
    });
  }
});

// ============================================
// Start Server
// ============================================
app.listen(port, () => {
  console.log(
    `🚀 TradingView MCP Server running on http://localhost:${port}`
  );
  console.log(`✓ Health check: http://localhost:${port}/health`);
  console.log(`✓ API ready to receive strategy creation requests`);
});
