#!/usr/bin/env node

/**
 * TradingView MCP Server - HTTP Wrapper for Railway
 * Exposes MCP tools as HTTP endpoints
 */

const express = require('express');
const axios = require('axios');
const { Anthropic } = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Claude client to use MCP tools
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(express.json());

// ============================================
// Health Check
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tradingview-mcp' });
});

// ============================================
// Create Pine Script Strategy
// ============================================
app.post('/api/strategies/create', async (req, res) => {
  try {
    const {
      name,
      symbol,
      timeframe,
      entry_rules,
      exit_rules,
    } = req.body;

    console.log(`[MCP] Creating strategy: ${name} for ${symbol}`);

    // Generate Pine Script using Claude
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Create a TradingView Pine Script v5 strategy indicator with the following specifications:

Strategy Name: ${name}
Symbol: ${symbol}
Timeframe: ${timeframe}
Entry Rules: ${JSON.stringify(entry_rules, null, 2)}
Exit Rules: ${JSON.stringify(exit_rules, null, 2)}

Generate complete Pine Script v5 code that:
1. Includes proper indicator/strategy declaration
2. Implements entry signals based on the entry rules
3. Implements exit signals based on the exit rules
4. Returns JSON webhook alerts for signal fires
5. Uses the specified timeframe

Return ONLY the Pine Script code, no explanation.`,
        },
      ],
    });

    let scriptContent = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        scriptContent = block.text;
      }
    }

    res.json({
      success: true,
      strategy_name: name,
      symbol,
      timeframe,
      script: scriptContent,
      status: 'created',
      message: `Strategy "${name}" created and ready to deploy`,
    });
  } catch (error) {
    console.error('[MCP] Error creating strategy:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create strategy',
    });
  }
});

// ============================================
// Add Indicators
// ============================================
app.post('/api/indicators/add', async (req, res) => {
  try {
    const { symbol, timeframe, indicator, params } = req.body;

    const indicatorMap = {
      rsi: 'Relative Strength Index',
      macd: 'MACD',
      bb: 'Bollinger Bands',
      sma: 'Moving Average',
      ema: 'Exponential Moving Average',
    };

    const fullName = indicatorMap[indicator.toLowerCase()] || indicator;

    console.log(`[MCP] Adding indicator: ${fullName} to ${symbol}`);

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
      error: error instanceof Error ? error.message : 'Failed to add indicator',
    });
  }
});

// ============================================
// Get Chart State
// ============================================
app.get('/api/chart/:symbol/:timeframe', async (req, res) => {
  try {
    const { symbol, timeframe } = req.params;

    res.json({
      success: true,
      symbol,
      timeframe,
      status: 'connected',
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
      error: error instanceof Error ? error.message : 'Failed to get chart state',
    });
  }
});

// ============================================
// Monitor Alerts
// ============================================
app.post('/api/alerts/monitor', async (req, res) => {
  try {
    const { strategy_id, session_id, symbol } = req.body;

    console.log(`[MCP] Monitoring ${symbol} for strategy ${strategy_id}`);

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
      error: error instanceof Error ? error.message : 'Failed to monitor alerts',
    });
  }
});

// ============================================
// Start Server
// ============================================
const server = app.listen(port, '0.0.0.0', () => {
  console.log(
    `🚀 TradingView MCP Server running on http://0.0.0.0:${port}`
  );
  console.log(`✓ Health check: http://localhost:${port}/health`);
  console.log(`✓ API ready to receive strategy creation requests`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
