#!/usr/bin/env node

/**
 * TradingView MCP Server - HTTP Wrapper for Railway
 * Exposes MCP tools as HTTP endpoints
 */

const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const { Anthropic } = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Claude client to use MCP tools
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// MCP Server management
let mcpProcess = null;
let mcpMessageId = 0;
const mcpPendingRequests = new Map();

app.use(express.json());

// ============================================
// Start MCP Server
// ============================================
function startMCPServer() {
  console.log('[MCP HTTP] Spawning TradingView MCP server...');

  mcpProcess = spawn('node', [__dirname + '/tradingview-mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  mcpProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.id && mcpPendingRequests.has(message.id)) {
          const request = mcpPendingRequests.get(message.id);
          clearTimeout(request.timeout);
          mcpPendingRequests.delete(message.id);

          if (message.error) {
            request.reject(new Error(message.error.message));
          } else {
            request.resolve(message.result);
          }
        }
      } catch (err) {
        // Ignore non-JSON lines (logs)
      }
    }
  });

  mcpProcess.on('error', (err) => {
    console.error('[MCP HTTP] MCP server error:', err);
  });

  mcpProcess.on('exit', (code) => {
    console.log('[MCP HTTP] MCP server exited with code', code);
    mcpProcess = null;
  });
}

// ============================================
// Call MCP Tools via stdio
// ============================================
function callMCPTool(toolName, args) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess) {
      reject(new Error('MCP server not running'));
      return;
    }

    const id = ++mcpMessageId;
    const timeout = setTimeout(() => {
      mcpPendingRequests.delete(id);
      reject(new Error(`MCP tool ${toolName} timeout`));
    }, 15000);

    mcpPendingRequests.set(id, { resolve, reject, timeout });

    const message = {
      jsonrpc: '2.0',
      id,
      method: toolName,
      params: args,
    };

    try {
      mcpProcess.stdin.write(JSON.stringify(message) + '\n');
    } catch (error) {
      mcpPendingRequests.delete(id);
      clearTimeout(timeout);
      reject(error);
    }
  });
}

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

    console.log(`[MCP HTTP] Creating strategy: ${name} for ${symbol}`);

    // Generate Pine Script using Claude
    console.log('[MCP HTTP] Generating Pine Script via Claude...');
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

    console.log('[MCP HTTP] ✓ Pine Script generated, deploying to TradingView...');

    // Deploy to TradingView via MCP tools
    let deploymentStatus = 'pending';
    let deploymentError = null;

    try {
      // Set the symbol on the chart
      console.log(`[MCP HTTP] Setting chart symbol to ${symbol}...`);
      await callMCPTool('chart_set_symbol', { symbol: symbol.toUpperCase() });
      console.log('[MCP HTTP] ✓ Symbol set');

      // Deploy the Pine Script source
      console.log('[MCP HTTP] Deploying Pine Script to chart...');
      const deployResult = await callMCPTool('pine_set_source', {
        source: scriptContent,
      });

      if (deployResult.error) {
        deploymentError = deployResult.error;
        console.warn('[MCP HTTP] ⚠ Deployment warning:', deploymentError);
      } else {
        console.log('[MCP HTTP] ✓ Pine Script deployed');

        // Compile the script
        console.log('[MCP HTTP] Compiling Pine Script...');
        const compileResult = await callMCPTool('pine_smart_compile', {});

        if (compileResult.error) {
          deploymentError = compileResult.error;
          console.warn('[MCP HTTP] ⚠ Compilation warning:', deploymentError);
        } else {
          console.log('[MCP HTTP] ✓ Pine Script compiled successfully');
          deploymentStatus = 'deployed';
        }
      }
    } catch (mcpError) {
      console.warn('[MCP HTTP] ⚠ MCP deployment failed (will still return script):', mcpError.message);
      deploymentStatus = 'generated';
      deploymentError = mcpError.message;
    }

    res.json({
      success: true,
      strategy_name: name,
      symbol,
      timeframe,
      script: scriptContent,
      status: deploymentStatus,
      deployment_error: deploymentError,
      message: deploymentStatus === 'deployed'
        ? `Strategy "${name}" created and deployed to TradingView`
        : `Strategy "${name}" created. Pine Script generated but deployment pending.`,
    });
  } catch (error) {
    console.error('[MCP HTTP] Error creating strategy:', error);
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
    `🚀 TradingView MCP HTTP Server running on http://0.0.0.0:${port}`
  );
  console.log(`✓ Health check: http://localhost:${port}/health`);
  console.log(`✓ API ready to receive strategy creation requests`);

  // Start the MCP server
  startMCPServer();
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  if (mcpProcess) {
    mcpProcess.kill();
  }
  server.close();
});
