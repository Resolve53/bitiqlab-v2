/**
 * TradingView MCP Integration Service
 * Automatically deploys strategies to TradingView via MCP
 */

import axios from "axios";
import { Strategy } from "@/core";

export class TradingViewMCPService {
  private mcpServerUrl: string;

  constructor() {
    this.mcpServerUrl =
      process.env.TRADINGVIEW_MCP_URL || "http://localhost:3000";
  }

  /**
   * Deploy strategy to TradingView via MCP
   */
  async deployStrategy(strategy: Strategy): Promise<{
    success: boolean;
    scriptId?: string;
    message: string;
  }> {
    try {
      console.log(`[MCP] Deploying strategy: ${strategy.name}`);

      // Step 1: Create strategy on TradingView
      const createResponse = await axios.post(
        `${this.mcpServerUrl}/api/strategies/create`,
        {
          name: strategy.name,
          symbol: strategy.symbol,
          timeframe: strategy.timeframe,
          entry_rules: strategy.entry_rules,
          exit_rules: strategy.exit_rules,
        },
        { timeout: 30000 }
      );

      if (!createResponse.data.success) {
        throw new Error(createResponse.data.error);
      }

      console.log(`[MCP] ✓ Strategy deployed: ${strategy.name}`);

      // Step 2: Add indicators
      const indicators = this.detectIndicators(strategy);
      for (const indicator of indicators) {
        await axios.post(
          `${this.mcpServerUrl}/api/indicators/add`,
          {
            symbol: strategy.symbol,
            timeframe: strategy.timeframe,
            indicator,
            params: {},
          },
          { timeout: 10000 }
        );
      }

      console.log(`[MCP] ✓ Indicators added: ${indicators.join(", ")}`);

      return {
        success: true,
        message: `Strategy "${strategy.name}" deployed to TradingView`,
      };
    } catch (error) {
      console.error("[MCP] Deployment error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Deployment failed",
      };
    }
  }

  /**
   * Start monitoring strategy for signals
   */
  async startMonitoring(
    strategyId: string,
    sessionId: string,
    symbol: string
  ): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.mcpServerUrl}/api/alerts/monitor`,
        {
          strategy_id: strategyId,
          session_id: sessionId,
          symbol,
        },
        { timeout: 10000 }
      );

      return response.data.success;
    } catch (error) {
      console.error("[MCP] Monitoring error:", error);
      return false;
    }
  }

  /**
   * Detect required indicators from strategy
   */
  private detectIndicators(strategy: Strategy): string[] {
    const indicators = new Set<string>();
    const ruleStr = JSON.stringify(strategy.entry_rules).toLowerCase();

    if (ruleStr.includes("rsi")) indicators.add("rsi");
    if (ruleStr.includes("macd")) indicators.add("macd");
    if (ruleStr.includes("bollinger") || ruleStr.includes("bb"))
      indicators.add("bb");
    if (ruleStr.includes("sma")) indicators.add("sma");
    if (ruleStr.includes("ema")) indicators.add("ema");

    return Array.from(indicators);
  }

  /**
   * Check MCP server health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.mcpServerUrl}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let mcpService: TradingViewMCPService | null = null;

export function getTradingViewMCPService(): TradingViewMCPService {
  if (!mcpService) {
    mcpService = new TradingViewMCPService();
  }
  return mcpService;
}
