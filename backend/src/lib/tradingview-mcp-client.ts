/**
 * TradingView MCP Client
 * Connects to the TradingView MCP server to fetch real-time chart data
 *
 * Requires:
 * 1. TradingView Desktop running with a chart open
 * 2. Chrome DevTools Protocol enabled (--remote-debugging-port=9222)
 * 3. TradingView MCP server running on stdio
 *
 * Tools used:
 * - quote_get: Get real-time price (last, OHLC, volume)
 * - data_get_study_values: Get indicator values (RSI, MACD, Bollinger Bands, etc.)
 * - data_get_ohlcv: Get historical price bars
 * - chart_get_state: Get current chart symbol and timeframe
 */

import { spawn, ChildProcess } from "child_process";

export interface TradingViewPrice {
  symbol: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  change24h?: number;
  timestamp: number;
}

export interface IndicatorValues {
  rsi?: number;
  macd?: {
    line: number;
    signal: number;
    histogram: number;
  };
  bollinger_bands?: {
    upper: number;
    middle: number;
    lower: number;
  };
  moving_average_20?: number;
  moving_average_50?: number;
  [key: string]: any;
}

export interface ChartState {
  symbol: string;
  timeframe: string;
  price: number;
  indicators: IndicatorValues;
}

class TradingViewMCPClient {
  private mcpProcess: ChildProcess | null = null;
  private isConnected = false;
  private messageId = 0;
  private pendingRequests: Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  /**
   * Initialize connection to TradingView MCP
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log("[TradingView MCP] Starting connection...");

        // Start the MCP server process
        this.mcpProcess = spawn("node", [
          `${__dirname}/../tradingview-mcp/server.js`,
        ]);

        if (!this.mcpProcess.stdout) {
          throw new Error("Failed to spawn TradingView MCP process");
        }

        // Handle incoming messages
        this.mcpProcess.stdout.on("data", (data) => {
          this.handleMessage(data.toString());
        });

        this.mcpProcess.stderr?.on("data", (data) => {
          console.warn("[TradingView MCP] STDERR:", data.toString());
        });

        this.mcpProcess.on("error", (error) => {
          console.error("[TradingView MCP] Process error:", error);
          this.isConnected = false;
        });

        this.mcpProcess.on("exit", () => {
          console.log("[TradingView MCP] Process exited");
          this.isConnected = false;
        });

        // Connection timeout
        const timeout = setTimeout(() => {
          reject(new Error("TradingView MCP connection timeout"));
        }, 5000);

        setTimeout(() => {
          clearTimeout(timeout);
          this.isConnected = true;
          console.log("[TradingView MCP] ✓ Connected successfully");
          resolve();
        }, 1000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get real-time price from TradingView
   */
  async getPrice(symbol: string): Promise<TradingViewPrice> {
    if (!this.isConnected) {
      try {
        await this.connect();
      } catch (connectError) {
        console.warn(`[TradingView MCP] Connection failed, cannot fetch price:`, connectError);
        throw connectError;
      }
    }

    try {
      console.log(`[TradingView MCP] Fetching price for ${symbol}...`);

      const response = await this.sendRequest("quote_get", {
        symbol: symbol.toUpperCase(),
      });

      if (response.error) {
        throw new Error(`TradingView error: ${response.error}`);
      }

      return {
        symbol: symbol.toUpperCase(),
        price: response.last || response.close || 0,
        open: response.open,
        high: response.high,
        low: response.low,
        close: response.close,
        volume: response.volume,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.warn(`[TradingView MCP] Price fetch failed, MCP unavailable:`, error instanceof Error ? error.message : error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Get indicator values from TradingView chart
   */
  async getIndicators(
    symbol: string,
    timeframe: string
  ): Promise<IndicatorValues> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      console.log(
        `[TradingView MCP] Fetching indicators for ${symbol} ${timeframe}...`
      );

      // First get chart state
      const chartState = await this.sendRequest("chart_get_state", {
        symbol,
        timeframe,
      });

      // Then get all indicator values
      const indicators = await this.sendRequest("data_get_study_values", {
        symbol,
        timeframe,
      });

      return {
        rsi: indicators.rsi,
        macd: indicators.macd,
        bollinger_bands: indicators.bollinger_bands,
        moving_average_20: indicators.moving_average_20,
        moving_average_50: indicators.moving_average_50,
        ...indicators,
      };
    } catch (error) {
      console.warn(`[TradingView MCP] Indicator fetch failed:`, error);
      return {};
    }
  }

  /**
   * Get chart state (symbol, timeframe, current data)
   */
  async getChartState(symbol: string, timeframe: string): Promise<ChartState> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const price = await this.getPrice(symbol);
      const indicators = await this.getIndicators(symbol, timeframe);

      return {
        symbol,
        timeframe,
        price: price.price,
        indicators,
      };
    } catch (error) {
      console.error("[TradingView MCP] Failed to get chart state:", error);
      throw error;
    }
  }

  /**
   * Get OHLCV data
   */
  async getOHLCV(
    symbol: string,
    timeframe: string,
    bars: number = 100
  ): Promise<
    Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>
  > {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      console.log(
        `[TradingView MCP] Fetching ${bars} bars for ${symbol} ${timeframe}...`
      );

      const response = await this.sendRequest("data_get_ohlcv", {
        symbol,
        timeframe,
        bars,
        summary: true,
      });

      if (Array.isArray(response)) {
        return response.map((bar: any) => ({
          timestamp: bar[0],
          open: bar[1],
          high: bar[2],
          low: bar[3],
          close: bar[4],
          volume: bar[5],
        }));
      }

      return [];
    } catch (error) {
      console.warn(`[TradingView MCP] OHLCV fetch failed:`, error);
      return [];
    }
  }

  /**
   * Send a request to the MCP server
   */
  private sendRequest(tool: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.isConnected = false;
        reject(new Error(`TradingView MCP request timeout (${tool}). Ensure TradingView is running locally with --remote-debugging-port=9222`));
      }, 8000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message = {
        jsonrpc: "2.0",
        id,
        method: tool,
        params,
      };

      try {
        this.mcpProcess?.stdin?.write(JSON.stringify(message) + "\n");
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming message from MCP
   */
  private handleMessage(data: string): void {
    try {
      const lines = data.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        const message = JSON.parse(line);

        if (message.id && this.pendingRequests.has(message.id)) {
          const request = this.pendingRequests.get(message.id)!;
          clearTimeout(request.timeout);
          this.pendingRequests.delete(message.id);

          if (message.error) {
            request.reject(new Error(message.error.message));
          } else {
            request.resolve(message.result);
          }
        }
      }
    } catch (error) {
      console.warn("[TradingView MCP] Error parsing message:", error);
    }
  }

  /**
   * Disconnect from MCP
   */
  disconnect(): void {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
      this.isConnected = false;
      console.log("[TradingView MCP] Disconnected");
    }
  }

  /**
   * Add an indicator to the chart
   */
  async addIndicator(
    symbol: string,
    timeframe: string,
    indicatorName: string,
    inputs?: Record<string, any>
  ): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      console.log(`[TradingView MCP] Adding ${indicatorName} to ${symbol} ${timeframe}...`);

      await this.sendRequest("chart_manage_indicator", {
        symbol,
        timeframe,
        action: "add",
        indicator: indicatorName,
        inputs,
      });

      console.log(`[TradingView MCP] ✓ ${indicatorName} added`);
    } catch (error) {
      console.warn(`[TradingView MCP] Failed to add ${indicatorName}:`, error);
      throw error;
    }
  }

  /**
   * Set indicator inputs (parameters)
   */
  async setIndicatorInputs(
    symbol: string,
    timeframe: string,
    indicatorName: string,
    inputs: Record<string, any>
  ): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      console.log(
        `[TradingView MCP] Setting ${indicatorName} inputs for ${symbol}...`
      );

      await this.sendRequest("indicator_set_inputs", {
        symbol,
        timeframe,
        indicator: indicatorName,
        inputs,
      });

      console.log(`[TradingView MCP] ✓ ${indicatorName} inputs updated`);
    } catch (error) {
      console.warn(`[TradingView MCP] Failed to set ${indicatorName} inputs:`, error);
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let client: TradingViewMCPClient | null = null;

export function getTradingViewMCP(): TradingViewMCPClient {
  if (!client) {
    client = new TradingViewMCPClient();
  }
  return client;
}
