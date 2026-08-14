/**
 * HTTP client for the TradingView MCP wrapper.
 * Sends frozen Pine — never asks MCP/Claude to reinterpret the strategy.
 */

import axios from "axios";
import type { AlertCreateAttempt } from "./alert-setup";
import type { McpDeployInput, McpToolResult } from "./types";

export function mcpServerUrl(): string {
  return process.env.TRADINGVIEW_MCP_URL || "http://localhost:3000";
}

export async function mcpHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${mcpServerUrl()}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function mcpDeployPine(input: McpDeployInput): Promise<{
  steps: Record<string, McpToolResult | undefined>;
  chart_state?: McpToolResult;
  pine_source?: string;
  error?: string;
}> {
  try {
    const response = await axios.post(
      `${mcpServerUrl()}/api/tradingview/deploy`,
      {
        strategy_id: input.strategy_id,
        strategy_version_id: input.strategy_version_id,
        snapshot_hash: input.snapshot_hash,
        symbol: input.symbol,
        timeframe: input.timeframe,
        pine_script: input.pine_script,
      },
      { timeout: 60000 }
    );
    return response.data;
  } catch (err) {
    const message =
      axios.isAxiosError(err) && err.response?.data?.error
        ? String(err.response.data.error)
        : err instanceof Error
          ? err.message
          : String(err);
    return { steps: {}, error: message };
  }
}

export async function mcpAttemptStrategyAlert(input: {
  webhook_url: string;
  symbol: string;
  timeframe: string;
  message: string;
}): Promise<AlertCreateAttempt> {
  try {
    const response = await axios.post(
      `${mcpServerUrl()}/api/tradingview/alerts/setup`,
      input,
      { timeout: 30000 }
    );
    return response.data as AlertCreateAttempt;
  } catch (err) {
    return {
      success: false,
      error:
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }
}
