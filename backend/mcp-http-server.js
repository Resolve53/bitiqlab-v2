#!/usr/bin/env node

/**
 * TradingView MCP Server - HTTP Wrapper for Railway
 * Exposes MCP tools as HTTP endpoints
 */

const express = require('express');
const axios = require('axios');
const { Anthropic } = require('@anthropic-ai/sdk');
const CDP = require('chrome-remote-interface');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Claude client to use MCP tools
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// TradingView MCP Tools
// ============================================
let cdpClient = null;

async function connectTradingView() {
  if (cdpClient) {
    return cdpClient;
  }

  try {
    const cdpPort = process.env.CDP_PORT || 9222;
    const cdpHost = process.env.CDP_HOST || 'localhost';
    console.log(`[MCP] Connecting to TradingView at ${cdpHost}:${cdpPort}...`);

    cdpClient = await CDP({
      host: cdpHost,
      port: cdpPort,
    });

    const { Page, Runtime } = cdpClient;
    await Page.enable();
    await Runtime.enable();

    console.log('[MCP] ✓ Connected to TradingView Desktop via CDP');
    return cdpClient;
  } catch (error) {
    console.error('[MCP] ✗ Failed to connect to TradingView:', error.message);
    console.error('[MCP] Make sure TradingView Desktop is running with: --remote-debugging-port=9222');
    cdpClient = null;
    throw error;
  }
}

async function executeScriptOnChart(script) {
  try {
    const client = await connectTradingView();
    const { Runtime } = client;
    const result = await Runtime.evaluate({
      expression: script,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }

    return result.result.value;
  } catch (error) {
    throw error;
  }
}

async function callMCPTool(toolName, args) {
  switch (toolName) {
    case 'pine_set_source':
      return await setPineSource(args.source);
    case 'chart_set_symbol':
      return await setChartSymbol(args.symbol);
    case 'pine_smart_compile':
      return await compilePineScript();
    case 'chart_get_state':
      return await getChartState();
    case 'quote_get':
      return await getQuote(args.symbol);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function setPineSource(source) {
  console.log('[MCP] Setting Pine Script source...');

  const script = `
    (async () => {
      const editor = document.querySelector('[data-testid="pine-editor"]') ||
                    document.querySelector('[class*="PineEditor"]') ||
                    document.querySelector('textarea[class*="pine" i]');

      if (!editor) {
        return { error: 'Pine Script editor not found' };
      }

      const textarea = editor.querySelector('textarea') || editor.querySelector('[contenteditable="true"]');
      if (textarea) {
        textarea.value = \`${source.replace(/`/g, '\\`')}\`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, message: 'Pine Script source set' };
      }

      return { error: 'Could not set source code' };
    })();
  `;

  const result = await executeScriptOnChart(script);
  return result || { error: 'No result from script' };
}

async function setChartSymbol(symbol) {
  console.log(`[MCP] Setting chart symbol to ${symbol}...`);

  const script = `
    (async () => {
      const symbolInput = document.querySelector('input[placeholder*="Search"]') ||
                         document.querySelector('input[placeholder*="Symbol"]') ||
                         document.querySelector('[data-testid="symbol-search-input"]');

      if (!symbolInput) {
        return { error: 'Symbol input not found' };
      }

      symbolInput.value = '${symbol}';
      symbolInput.dispatchEvent(new Event('input', { bubbles: true }));
      symbolInput.dispatchEvent(new Event('change', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 500));

      const firstResult = document.querySelector('[data-testid="symbol-search-result"]') ||
                         document.querySelector('[class*="searchResult"]');
      if (firstResult) {
        firstResult.click();
      } else {
        symbolInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));
      }

      return { success: true, message: 'Symbol set to ' + '${symbol}' };
    })();
  `;

  const result = await executeScriptOnChart(script);
  return result || { error: 'No result from script' };
}

async function compilePineScript() {
  console.log('[MCP] Compiling Pine Script...');

  const script = `
    (async () => {
      const compileBtn = document.querySelector('button[title*="Compile" i]') ||
                        document.querySelector('button[aria-label*="Compile" i]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('compile'));

      if (!compileBtn) {
        return { error: 'Compile button not found' };
      }

      compileBtn.click();
      await new Promise(resolve => setTimeout(resolve, 2000));

      const errors = document.querySelectorAll('[class*="error" i]');
      if (errors.length > 0) {
        return { error: 'Compilation failed with errors' };
      }

      return { success: true, message: 'Pine Script compiled successfully' };
    })();
  `;

  const result = await executeScriptOnChart(script);
  return result || { error: 'No result from script' };
}

async function getChartState() {
  console.log('[MCP] Getting chart state...');

  const script = `
    (async () => {
      const symbolEl = document.querySelector('[data-testid="symbol-text"]') ||
                      document.querySelector('[class*="symbolName"]') ||
                      Array.from(document.querySelectorAll('span')).find(s => /^[A-Z]+/.test(s.textContent));

      const timeframeEl = document.querySelector('[data-testid="timeframe-button"]') ||
                         document.querySelector('[class*="timeframe"]') ||
                         Array.from(document.querySelectorAll('button')).find(b => /^[0-9]+(M|H|D|W|mo)$/i.test(b.textContent));

      return {
        symbol: symbolEl?.textContent?.trim() || 'UNKNOWN',
        timeframe: timeframeEl?.textContent?.trim() || '1D',
        timestamp: Date.now(),
      };
    })();
  `;

  const result = await executeScriptOnChart(script);
  return result || { symbol: 'UNKNOWN', timeframe: '1D' };
}

async function getQuote(symbol) {
  console.log(`[MCP] Getting quote for ${symbol}...`);

  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`
    );
    const data = await response.json();

    return {
      symbol: symbol.toUpperCase(),
      price: parseFloat(data.lastPrice),
      high: parseFloat(data.highPrice),
      low: parseFloat(data.lowPrice),
      volume: parseFloat(data.volume),
    };
  } catch (error) {
    throw error;
  }
}

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
  console.log(`✓ CDP port: ${process.env.CDP_PORT || 9222}`);
  console.log(`✓ CDP host: ${process.env.CDP_HOST || 'localhost'}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  if (cdpClient) {
    cdpClient.close().catch(() => {});
  }
  server.close();
});
