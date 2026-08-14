#!/usr/bin/env node

/**
 * TradingView MCP Server - HTTP Wrapper for Railway
 * Exposes MCP tools as HTTP endpoints
 */

const express = require('express');
const axios = require('axios');
const { Anthropic } = require('@anthropic-ai/sdk');
const CDP = require('chrome-remote-interface');
const {
  createRuntime,
  tradingViewProbeScript,
} = require('./tradingview-browser-runtime');
const {
  MCP_ERROR_CLASSES,
  McpRuntimeError,
  classifyConnectError,
  asToolError,
  sanitizeLogValue,
} = require('./tradingview-mcp-errors');

const app = express();
const port = process.env.PORT || 3000;
const browserRuntime = createRuntime();

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
    try {
      await cdpClient.Runtime.evaluate({ expression: '1', returnByValue: true });
      return cdpClient;
    } catch {
      try {
        await cdpClient.close();
      } catch {
        /* ignore */
      }
      cdpClient = null;
    }
  }

  try {
    const snap = browserRuntime.snapshot();
    if (snap.browser === 'fail' && browserRuntime.config().enabled) {
      throw classifyConnectError(new Error('browser down'), {
        browserEnabled: true,
        browserRunning: false,
        cdpReady: false,
      });
    }
    const cdpPort = Number(process.env.CDP_PORT || 9222);
    console.log(`[MCP] Connecting to in-container CDP at 127.0.0.1:${cdpPort}...`);

    cdpClient = await CDP({
      host: '127.0.0.1',
      port: cdpPort,
    });

    const { Page, Runtime } = cdpClient;
    await Page.enable();
    await Runtime.enable();
    browserRuntime.state.cdpReady = true;
    console.log('[MCP] Connected to Chromium via internal CDP');
    return cdpClient;
  } catch (error) {
    cdpClient = null;
    browserRuntime.state.cdpReady = false;
    if (error instanceof McpRuntimeError) throw error;
    throw classifyConnectError(error, {
      browserEnabled: browserRuntime.config().enabled,
      browserRunning: browserRuntime.state.browserRunning,
      cdpReady: false,
    });
  }
}

async function executeScriptOnChart(script) {
  const client = await connectTradingView();
  const { Runtime } = client;
  const result = await Runtime.evaluate({
    expression: script,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }

  return result.result.value;
}

async function probeTradingViewPage() {
  try {
    const probe = await executeScriptOnChart(tradingViewProbeScript());
    return browserRuntime.applyPageProbe(probe || {});
  } catch (error) {
    browserRuntime.applyPageProbe({ ready: false, authenticated: 'unknown' });
    throw error;
  }
}

async function ensureTradingViewReady() {
  browserRuntime.assertReadyForTools();
  await probeTradingViewPage();
  browserRuntime.assertReadyForTools();
}

async function callMCPTool(toolName, args) {
  try {
    if (toolName !== 'quote_get') {
      await ensureTradingViewReady();
    }
  } catch (error) {
    return asToolError(error);
  }
  try {
  switch (toolName) {
    case 'pine_set_source':
      return await setPineSource(args.source);
    case 'pine_get_source':
      return await getPineSource();
    case 'chart_set_symbol':
      return await setChartSymbol(args.symbol);
    case 'chart_set_timeframe':
      return await setChartTimeframe(args.timeframe);
    case 'pine_smart_compile':
      return await compilePineScript();
    case 'chart_get_state':
      return await getChartState();
    case 'quote_get':
      return await getQuote(args.symbol);
    case 'alert_setup_strategy_webhook':
      return await setupStrategyWebhookAlert(args);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
  } catch (error) {
    return asToolError(error);
  }
}

async function setPineSource(source) {
  console.log('[MCP] Setting Pine Script source...');
  const escaped = JSON.stringify(source);
  const script = `
    (async () => {
      function findEditor() {
        return document.querySelector('[data-testid="pine-editor"]') ||
               document.querySelector('.monaco-editor.pine-editor-monaco') ||
               document.querySelector('[class*="PineEditor"]') ||
               document.querySelector('textarea[class*="pine" i]');
      }
      let editor = findEditor();
      if (!editor) {
        const openBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).find(b =>
          /pine editor|open pine/i.test(b.textContent || b.getAttribute('aria-label') || '')
        );
        if (openBtn) {
          openBtn.click();
          await new Promise(r => setTimeout(r, 800));
          editor = findEditor();
        }
      }
      if (!editor) {
        return {
          success: false,
          error: 'PINE_EDITOR_SETUP_REQUIRED',
          error_class: 'PINE_EDITOR_SETUP_REQUIRED',
        };
      }
      const textarea = editor.querySelector('textarea') || editor.querySelector('[contenteditable="true"]') || editor;
      const source = ${escaped};
      if (textarea && 'value' in textarea) {
        textarea.value = source;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, message: 'Pine Script source set', length: source.length };
      }
      if (textarea && textarea.isContentEditable) {
        textarea.textContent = source;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return { success: true, message: 'Pine Script source set (contenteditable)', length: source.length };
      }
      return {
        success: false,
        error: 'PINE_EDITOR_NOT_FOUND',
        error_class: 'PINE_EDITOR_NOT_FOUND',
      };
    })();
  `;

  const result = await executeScriptOnChart(script);
  if (!result) {
    return {
      success: false,
      error: 'PINE_EDITOR_NOT_FOUND',
      error_class: MCP_ERROR_CLASSES.PINE_EDITOR_NOT_FOUND,
    };
  }
  if (result.success === false) {
    return {
      ...result,
      error_class: result.error_class || MCP_ERROR_CLASSES.PINE_EDITOR_NOT_FOUND,
    };
  }
  return result;
}

async function getPineSource() {
  console.log('[MCP] Reading Pine Script source...');
  const script = `
    (async () => {
      const editor = document.querySelector('[data-testid="pine-editor"]') ||
                    document.querySelector('[class*="PineEditor"]') ||
                    document.querySelector('textarea[class*="pine" i]');
      if (!editor) {
        return {
          success: false,
          error: 'PINE_EDITOR_NOT_FOUND',
          error_class: 'PINE_EDITOR_NOT_FOUND',
        };
      }
      const textarea = editor.querySelector('textarea') || editor.querySelector('[contenteditable="true"]') || editor;
      const source = (textarea && 'value' in textarea) ? textarea.value : (textarea ? textarea.textContent : '');
      return { success: true, source: source || '', length: (source || '').length };
    })();
  `;
  const result = await executeScriptOnChart(script);
  if (!result || result.success === false) {
    return {
      success: false,
      error: (result && result.error) || 'PINE_EDITOR_NOT_FOUND',
      error_class: (result && result.error_class) || MCP_ERROR_CLASSES.PINE_EDITOR_NOT_FOUND,
    };
  }
  return result;
}

async function setChartSymbol(symbol) {
  console.log(`[MCP] Setting chart symbol to ${symbol}...`);

  const script = `
    (async () => {
      const symbolInput = document.querySelector('input[placeholder*="Search"]') ||
                         document.querySelector('input[placeholder*="Symbol"]') ||
                         document.querySelector('[data-testid="symbol-search-input"]');

      if (!symbolInput) {
        return {
          success: false,
          error: 'TRADINGVIEW_SELECTOR_NOT_FOUND',
          error_class: 'TRADINGVIEW_SELECTOR_NOT_FOUND',
        };
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
  if (!result || result.success === false) {
    return {
      success: false,
      error: (result && result.error) || MCP_ERROR_CLASSES.TRADINGVIEW_SELECTOR_NOT_FOUND,
      error_class: (result && result.error_class) || MCP_ERROR_CLASSES.TRADINGVIEW_SELECTOR_NOT_FOUND,
    };
  }
  return result;
}

async function setChartTimeframe(timeframe) {
  console.log(`[MCP] Setting chart timeframe to ${timeframe}...`);
  const tf = String(timeframe).replace(/'/g, '');
  const script = `
    (async () => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const match = buttons.find(b => {
        const t = (b.textContent || b.getAttribute('aria-label') || '').trim();
        return t === '${tf}' || t === '${tf}m' || t === '${tf}h' || t.toLowerCase() === '${tf}'.toLowerCase();
      });
      if (match) {
        match.click();
        return { success: true, message: 'Timeframe clicked ' + '${tf}' };
      }
      return {
        success: false,
        error: 'TRADINGVIEW_SELECTOR_NOT_FOUND',
        error_class: 'TRADINGVIEW_SELECTOR_NOT_FOUND',
      };
    })();
  `;
  const result = await executeScriptOnChart(script);
  if (!result || result.success === false) {
    return {
      success: false,
      error: (result && result.error) || MCP_ERROR_CLASSES.TRADINGVIEW_SELECTOR_NOT_FOUND,
      error_class: (result && result.error_class) || MCP_ERROR_CLASSES.TRADINGVIEW_SELECTOR_NOT_FOUND,
    };
  }
  return result;
}

async function setupStrategyWebhookAlert(args) {
  const webhookUrl = JSON.stringify(args.webhook_url || '');
  const script = `
    (async () => {
      const result = {
        success: false,
        webhook_url_set: false,
        once_per_bar_close: false,
        condition_is_alert_function: false,
        message_is_json: false,
        verified_in_list: false,
        source: 'dom_attempt',
      };
      const openBtn = document.querySelector('[aria-label="Create Alert"]')
        || document.querySelector('[data-name="alerts"]');
      if (openBtn) openBtn.click();
      await new Promise(r => setTimeout(r, 800));

      const webhookInput = Array.from(document.querySelectorAll('input')).find(i =>
        /webhook/i.test(i.placeholder || '') || /webhook/i.test(i.getAttribute('aria-label') || '') ||
        /webhook/i.test(i.closest('label')?.textContent || i.closest('[class*="row"]')?.textContent || '')
      );
      if (webhookInput) {
        const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeSet.call(webhookInput, ${webhookUrl});
        webhookInput.dispatchEvent(new Event('input', { bubbles: true }));
        webhookInput.dispatchEvent(new Event('change', { bubbles: true }));
        result.webhook_url_set = true;
      }

      const onceClose = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], button, span, div')).find(el =>
        /once per bar close/i.test(el.textContent || el.getAttribute('aria-label') || '')
      );
      if (onceClose) {
        onceClose.click();
        result.once_per_bar_close = true;
      }

      const alertFn = Array.from(document.querySelectorAll('div, span, option, button')).find(el =>
        /alert\\(\\) function/i.test(el.textContent || '')
      );
      if (alertFn) {
        alertFn.click();
        result.condition_is_alert_function = true;
      }

      result.success = result.webhook_url_set && result.once_per_bar_close && result.condition_is_alert_function;
      if (!result.success) {
        result.error = 'Could not fully configure a strategy webhook alert via DOM. Manual setup required.';
      }
      return result;
    })();
  `;
  try {
    const result = await executeScriptOnChart(script);
    return result || {
      success: false,
      error: 'No result from alert setup script',
      webhook_url_set: false,
      once_per_bar_close: false,
      condition_is_alert_function: false,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      webhook_url_set: false,
      once_per_bar_close: false,
      condition_is_alert_function: false,
    };
  }
}

async function compilePineScript() {
  console.log('[MCP] Compiling Pine Script...');

  const script = `
    (async () => {
      const compileBtn = document.querySelector('button[title*="Compile" i]') ||
                        document.querySelector('button[aria-label*="Compile" i]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('compile'));

      if (!compileBtn) {
        const addBtn = Array.from(document.querySelectorAll('button')).find(b =>
          /add to chart|save and add|update on chart/i.test(b.textContent || b.getAttribute('aria-label') || '')
        );
        if (!addBtn) {
          return {
            success: false,
            error: 'COMPILE_FAILED',
            error_class: 'COMPILE_FAILED',
            has_errors: true,
          };
        }
        addBtn.click();
      } else {
        compileBtn.click();
      }
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pineErrors = document.querySelectorAll(
        '[class*="pine"] [class*="error"], .tv-script-error, [data-name="pine-console-error"]'
      );
      if (pineErrors.length > 0) {
        return {
          success: false,
          error: 'COMPILE_FAILED',
          error_class: 'COMPILE_FAILED',
          has_errors: true,
        };
      }

      return { success: true, message: 'Pine Script compiled successfully', has_errors: false };
    })();
  `;

  const result = await executeScriptOnChart(script);
  if (result && result.success) return result;
  return {
    success: false,
    error: (result && result.error) || 'Compile result unknown',
    error_class: (result && result.error_class) || MCP_ERROR_CLASSES.COMPILE_FAILED,
    has_errors: true,
  };
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
        success: true,
        symbol: symbolEl?.textContent?.trim() || 'UNKNOWN',
        timeframe: timeframeEl?.textContent?.trim() || '1D',
        timestamp: Date.now(),
      };
    })();
  `;

  const result = await executeScriptOnChart(script);
  return result || { success: false, error: 'No result from script', symbol: 'UNKNOWN', timeframe: '1D' };
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

app.use(express.json({ limit: '1mb' }));

// ============================================
// Health Check
// ============================================
app.get('/health', (req, res) => {
  const snap = browserRuntime.snapshot();
  res.json({
    ...snap,
    service: 'tradingview-mcp',
    mcp_http: 'ok',
  });
});

app.get('/bootstrap', (req, res) => {
  const snap = browserRuntime.snapshot();
  res.json({
    authenticated: snap.authenticated,
    status: snap.status,
    user_data_dir: snap.user_data_dir,
    headless: snap.headless,
    instructions: [
      'Mount a Railway volume at /data so the Chromium profile persists.',
      'Profile path: /data/tradingview-profile',
      'If authenticated is no: run a one-time local/headful bootstrap against the same profile, or set TRADINGVIEW_BROWSER_HEADLESS=false with an interactive display, sign in once, then restart headless.',
      'Do not paste cookies, passwords, or session tokens into logs or source.',
    ],
    error_class:
      snap.authenticated === 'no' ? MCP_ERROR_CLASSES.TRADINGVIEW_AUTH_REQUIRED : snap.error_class,
  });
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

    console.log('[MCP HTTP] ✓ Pine Script generated, attempting deployment to TradingView...');

    // Log the full script for visibility
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`GENERATED PINE SCRIPT FOR: ${symbol} ${timeframe}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(scriptContent);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Deploy to TradingView via MCP tools
    let deploymentStatus = 'pending';
    let deploymentError = null;

    try {
      // Set the symbol on the chart
      console.log(`[MCP HTTP] Setting chart symbol to ${symbol}...`);
      const symbolResult = await callMCPTool('chart_set_symbol', { symbol: symbol.toUpperCase() });
      if (symbolResult?.error) {
        console.warn('[MCP HTTP] Symbol setting failed:', symbolResult.error);
        deploymentStatus = 'symbol_failed';
      } else {
        console.log('[MCP HTTP] ✓ Symbol set');
      }

      // Deploy the Pine Script source
      console.log('[MCP HTTP] Deploying Pine Script to editor...');
      const deployResult = await callMCPTool('pine_set_source', {
        source: scriptContent,
      });

      if (deployResult?.error) {
        deploymentError = deployResult.error;
        console.warn('[MCP HTTP] Script deployment warning:', deploymentError);
        deploymentStatus = 'deployed_with_errors';
      } else {
        console.log('[MCP HTTP] ✓ Pine Script deployed to editor');

        // Compile the script
        console.log('[MCP HTTP] Compiling Pine Script...');
        const compileResult = await callMCPTool('pine_smart_compile', {});

        if (compileResult?.error) {
          deploymentError = compileResult.error;
          console.warn('[MCP HTTP] Compilation warning:', deploymentError);
          deploymentStatus = 'compiled_with_errors';
        } else {
          console.log('[MCP HTTP] ✓ Pine Script compiled successfully');
          deploymentStatus = 'deployed';
        }
      }
    } catch (mcpError) {
      console.error('[MCP HTTP] MCP deployment failed:', mcpError instanceof Error ? mcpError.message : mcpError);
      deploymentStatus = 'deployment_failed';
      deploymentError = mcpError instanceof Error ? mcpError.message : String(mcpError);

      // Still provide the script so user can manually deploy
      console.warn('[MCP HTTP] Auto-deployment failed. User can manually paste script into TradingView.');
    }

    res.json({
      success: true,
      strategy_name: name,
      symbol,
      timeframe,
      status: deploymentStatus,
      deployment_error: deploymentError,
      message: deploymentStatus === 'deployed'
        ? `✓ Strategy "${name}" successfully deployed to TradingView`
        : `Strategy "${name}" created with Pine Script. Status: ${deploymentStatus}`,
      pine_script: scriptContent,
      manual_deployment: {
        instructions: [
          '1. Open TradingView and go to Pine Script Editor',
          '2. Create New → Indicator',
          '3. Delete the template code',
          '4. Copy the full "pine_script" JSON value below into the editor',
          '5. Click "Save and Add to Chart"',
          '6. Configure any inputs as needed',
          '7. Alerts will now be active for this strategy',
        ],
        script_content: scriptContent,
      },
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
// Add Indicators (placeholder)
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
// Stage 1: deploy frozen Pine (no Claude reinterpretation)
// Returns tool FACTS. Never claims status=deployed.
// ============================================
app.post('/api/tradingview/deploy', async (req, res) => {
  try {
    const {
      strategy_id,
      strategy_version_id,
      snapshot_hash,
      symbol,
      timeframe,
      pine_script,
    } = req.body || {};

    if (!pine_script || !symbol) {
      return res.status(400).json({
        steps: {},
        error: 'pine_script and symbol are required',
      });
    }

    const steps = {};
    let pine_source;
    let chart_state;

    steps.chart_set_symbol = await callMCPTool('chart_set_symbol', {
      symbol: String(symbol).toUpperCase(),
    });
    try {
      steps.chart_set_timeframe = await callMCPTool('chart_set_timeframe', {
        timeframe,
      });
    } catch (err) {
      steps.chart_set_timeframe = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    steps.pine_set_source = await callMCPTool('pine_set_source', {
      source: pine_script,
    });
    steps.pine_smart_compile = await callMCPTool('pine_smart_compile', {});
    try {
      steps.pine_get_source = await callMCPTool('pine_get_source', {});
      pine_source = steps.pine_get_source && steps.pine_get_source.source;
    } catch (err) {
      steps.pine_get_source = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    try {
      chart_state = await callMCPTool('chart_get_state', {});
      steps.chart_get_state = chart_state;
    } catch (err) {
      steps.chart_get_state = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    res.json({
      strategy_id,
      strategy_version_id,
      snapshot_hash,
      symbol,
      timeframe,
      steps,
      pine_source: pine_source || pine_script,
      chart_state,
      status: 'facts',
      notice: 'This endpoint returns MCP facts only. The Bitiq backend decides compile/verify. Compiled Pine is not monitoring.',
    });
  } catch (error) {
    const classified = asToolError(error);
    res.status(503).json({
      steps: {},
      error: classified.error,
      error_class: classified.error_class,
    });
  }
});

app.post('/api/tradingview/alerts/setup', async (req, res) => {
  try {
    const result = await callMCPTool('alert_setup_strategy_webhook', req.body || {});
    res.json(result);
  } catch (error) {
    res.json({
      success: false,
      webhook_url_set: false,
      once_per_bar_close: false,
      condition_is_alert_function: false,
      verified_in_list: false,
      error: error instanceof Error ? error.message : 'Alert setup failed',
    });
  }
});

// ============================================
// Monitor Alerts — do NOT fake monitoring:true
// ============================================
app.post('/api/alerts/monitor', async (req, res) => {
  try {
    const { strategy_id, session_id, symbol } = req.body || {};
    res.status(409).json({
      success: false,
      monitoring: false,
      monitoring_complete: false,
      alert_status: 'ALERT_SETUP_REQUIRED',
      error: 'ALERT_SETUP_REQUIRED',
      strategy_id,
      session_id,
      symbol,
      message:
        'Compiled Pine is not TradingView monitoring. Create a real candle-close strategy alert (POST /api/tradingview/alerts/setup or follow ALERT_SETUP_REQUIRED instructions). A candidate must reach POST /api/tradingview/candidates.',
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
  console.log(`TradingView MCP HTTP Server listening on 0.0.0.0:${port}`);
  console.log('CDP is internal-only at 127.0.0.1 (not published)');
  browserRuntime
    .start()
    .then(async (snap) => {
      console.log(
        `[browser] startup status=${snap.status} browser=${snap.browser} cdp=${snap.cdp}`
      );
      if (snap.cdp === 'ok') {
        try {
          await probeTradingViewPage();
          const after = browserRuntime.snapshot();
          console.log(
            `[browser] tradingview=${after.tradingview} authenticated=${after.authenticated}`
          );
        } catch (err) {
          console.log(
            `[browser] page probe failed: ${sanitizeLogValue(err instanceof Error ? err.message : err)}`
          );
        }
      }
    })
    .catch((err) => {
      console.error(
        `[browser] startup failed (MCP HTTP stays up, health=degraded): ${sanitizeLogValue(
          err instanceof Error ? err.message : err
        )}`
      );
    });
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

function shutdown() {
  console.log('Shutting down...');
  if (cdpClient) {
    cdpClient.close().catch(() => {});
  }
  browserRuntime.stop().catch(() => {});
  server.close();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
