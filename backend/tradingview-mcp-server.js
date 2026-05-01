#!/usr/bin/env node

/**
 * TradingView MCP Server
 * Connects to TradingView Desktop via CDP and provides MCP tools for strategy deployment
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  TextContent,
} = require('@modelcontextprotocol/sdk/types.js');
const CDP = require('chrome-remote-interface');

class TradingViewMCPServer {
  constructor() {
    this.server = new Server({
      name: 'tradingview-mcp',
      version: '1.0.0',
    });

    this.cdpClient = null;
    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'pine_set_source',
          description: 'Set Pine Script source code on the current chart',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'The Pine Script v5 source code',
              },
            },
            required: ['source'],
          },
        },
        {
          name: 'chart_set_symbol',
          description: 'Set the chart symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Trading symbol (e.g., BTCUSDT)',
              },
            },
            required: ['symbol'],
          },
        },
        {
          name: 'pine_smart_compile',
          description: 'Compile the Pine Script on the chart',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'chart_get_state',
          description: 'Get current chart state including symbol and timeframe',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'quote_get',
          description: 'Get real-time price data for a symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Trading symbol',
              },
            },
            required: ['symbol'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request;

      switch (name) {
        case 'pine_set_source':
          return await this.setPineSource(args.source);
        case 'chart_set_symbol':
          return await this.setChartSymbol(args.symbol);
        case 'pine_smart_compile':
          return await this.compilePineScript();
        case 'chart_get_state':
          return await this.getChartState();
        case 'quote_get':
          return await this.getQuote(args.symbol);
        default:
          return { error: `Unknown tool: ${name}` };
      }
    });
  }

  async connect() {
    try {
      const cdpPort = process.env.CDP_PORT || 9222;
      console.log(`[MCP] Connecting to TradingView Desktop on port ${cdpPort}...`);

      this.cdpClient = await CDP({
        port: cdpPort,
      });

      const { Page, Runtime } = this.cdpClient;

      await Page.enable();
      await Runtime.enable();

      console.log('[MCP] ✓ Connected to TradingView Desktop via CDP');
      return true;
    } catch (error) {
      console.error('[MCP] ✗ Failed to connect to TradingView Desktop:', error.message);
      console.error('[MCP] Make sure TradingView Desktop is running with: --remote-debugging-port=9222');
      return false;
    }
  }

  async executeScript(script) {
    if (!this.cdpClient) {
      return { error: 'Not connected to TradingView' };
    }

    try {
      const { Runtime } = this.cdpClient;
      const result = await Runtime.evaluate({
        expression: script,
        returnByValue: true,
      });

      if (result.exceptionDetails) {
        return { error: result.exceptionDetails.text };
      }

      return { result: result.result.value };
    } catch (error) {
      return { error: error.message };
    }
  }

  async setPineSource(source) {
    console.log('[MCP] Setting Pine Script source...');

    const script = `
      (async () => {
        // Access TradingView's internal API
        const editor = document.querySelector('[data-testid="pine-editor"]');
        if (!editor) {
          return { error: 'Pine Script editor not found' };
        }

        // Set the source code
        const textarea = editor.querySelector('textarea') || editor.querySelector('[contenteditable]');
        if (textarea) {
          textarea.value = \`${source.replace(/`/g, '\\`')}\`;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, message: 'Pine Script source set' };
        }

        return { error: 'Could not set source code' };
      })();
    `;

    return await this.executeScript(script);
  }

  async setChartSymbol(symbol) {
    console.log(`[MCP] Setting chart symbol to ${symbol}...`);

    const script = `
      (async () => {
        const symbolInput = document.querySelector('[data-testid="symbol-search-input"]') ||
                           document.querySelector('input[placeholder*="symbol" i]') ||
                           document.querySelector('input[placeholder*="ticker" i]');

        if (!symbolInput) {
          return { error: 'Symbol input not found' };
        }

        symbolInput.value = '${symbol}';
        symbolInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Wait for dropdown and click first result
        await new Promise(resolve => setTimeout(resolve, 500));
        const firstResult = document.querySelector('[data-testid="symbol-search-result"]:first-child') ||
                           document.querySelector('[class*="searchResult"]:first-child');
        if (firstResult) {
          firstResult.click();
        }

        return { success: true, message: 'Symbol set to ' + '${symbol}' };
      })();
    `;

    return await this.executeScript(script);
  }

  async compilePineScript() {
    console.log('[MCP] Compiling Pine Script...');

    const script = `
      (async () => {
        const compileBtn = document.querySelector('[data-testid="compile-button"]') ||
                          document.querySelector('button[title*="compile" i]') ||
                          Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Compile'));

        if (!compileBtn) {
          return { error: 'Compile button not found' };
        }

        compileBtn.click();

        // Wait for compilation
        await new Promise(resolve => setTimeout(resolve, 2000));

        const errors = document.querySelectorAll('[class*="error" i]');
        if (errors.length > 0) {
          return { error: 'Compilation failed with errors', details: Array.from(errors).map(e => e.textContent) };
        }

        return { success: true, message: 'Pine Script compiled successfully' };
      })();
    `;

    return await this.executeScript(script);
  }

  async getChartState() {
    console.log('[MCP] Getting chart state...');

    const script = `
      (async () => {
        const symbolEl = document.querySelector('[data-testid="symbol-text"]') ||
                        document.querySelector('[class*="symbolName"]');
        const timeframeEl = document.querySelector('[data-testid="timeframe-button"]') ||
                           document.querySelector('[class*="timeframe"]');

        return {
          symbol: symbolEl?.textContent || 'UNKNOWN',
          timeframe: timeframeEl?.textContent || '1D',
          timestamp: Date.now(),
        };
      })();
    `;

    return await this.executeScript(script);
  }

  async getQuote(symbol) {
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
      return { error: error.message };
    }
  }

  async start() {
    const connected = await this.connect();

    if (connected) {
      console.log('[MCP] Starting MCP server on stdio...');
      await this.server.connect(process.stdin, process.stdout);
      console.log('[MCP] Server ready');
    } else {
      console.error('[MCP] Failed to connect, but starting server anyway for health checks...');
      await this.server.connect(process.stdin, process.stdout);
    }
  }
}

const server = new TradingViewMCPServer();
server.start().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[MCP] Shutting down...');
  if (server.cdpClient) {
    await server.cdpClient.close();
  }
  process.exit(0);
});
