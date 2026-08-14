/**
 * HTTP client for the TradingView MCP wrapper.
 * Sends frozen Pine — never asks MCP/Claude to reinterpret the strategy.
 */

import axios from "axios";
import type { AlertCreateAttempt } from "./alert-setup";
import { MCP_RUNTIME_ERROR_CLASSES } from "./errors";
import type { McpDeployInput, McpToolResult } from "./types";

export function mcpServerUrl(): string {
  return process.env.TRADINGVIEW_MCP_URL || "http://localhost:3000";
}

export interface McpHealthDetails {
  reachable: boolean;
  status?: string;
  mcp_http?: string;
  browser?: string;
  cdp?: string;
  tradingview?: string;
  authenticated?: string;
  error_class?: string;
  service?: string;
}

/** True when the MCP HTTP process answered (even if browser/CDP is degraded). */
export async function mcpHealth(): Promise<boolean> {
  const details = await mcpHealthDetails();
  return details.reachable;
}

export async function mcpHealthDetails(): Promise<McpHealthDetails> {
  try {
    const response = await axios.get(`${mcpServerUrl()}/health`, { timeout: 5000 });
    const data = (response.data || {}) as Record<string, unknown>;
    return {
      reachable: response.status === 200,
      status: typeof data.status === "string" ? data.status : undefined,
      mcp_http: typeof data.mcp_http === "string" ? data.mcp_http : "ok",
      browser: typeof data.browser === "string" ? data.browser : undefined,
      cdp: typeof data.cdp === "string" ? data.cdp : undefined,
      tradingview: typeof data.tradingview === "string" ? data.tradingview : undefined,
      authenticated:
        typeof data.authenticated === "string" ? data.authenticated : undefined,
      error_class: typeof data.error_class === "string" ? data.error_class : undefined,
      service: typeof data.service === "string" ? data.service : undefined,
    };
  } catch {
    return {
      reachable: false,
      mcp_http: "fail",
      error_class: MCP_RUNTIME_ERROR_CLASSES.MCP_HTTP_UNREACHABLE,
    };
  }
}

export function errorFromMcpHealth(details: McpHealthDetails): {
  error: string;
  error_class: string;
} {
  if (!details.reachable) {
    return {
      error: "MCP HTTP server is unreachable",
      error_class: MCP_RUNTIME_ERROR_CLASSES.MCP_HTTP_UNREACHABLE,
    };
  }
  if (details.error_class) {
    return {
      error: details.error_class,
      error_class: details.error_class,
    };
  }
  if (details.browser === "fail") {
    return {
      error: "Chromium browser process is not running",
      error_class: MCP_RUNTIME_ERROR_CLASSES.BROWSER_NOT_RUNNING,
    };
  }
  if (details.cdp === "fail") {
    return {
      error: "CDP is unreachable. This is not an MCP HTTP outage.",
      error_class: MCP_RUNTIME_ERROR_CLASSES.CDP_UNREACHABLE,
    };
  }
  if (details.authenticated === "no" || details.tradingview === "not_authenticated") {
    return {
      error: "TradingView session is not authenticated",
      error_class: MCP_RUNTIME_ERROR_CLASSES.TRADINGVIEW_AUTH_REQUIRED,
    };
  }
  if (details.tradingview && details.tradingview !== "ok") {
    return {
      error: "TradingView chart page is not ready",
      error_class: MCP_RUNTIME_ERROR_CLASSES.TRADINGVIEW_PAGE_NOT_READY,
    };
  }
  return {
    error: "MCP runtime is degraded",
    error_class: MCP_RUNTIME_ERROR_CLASSES.CDP_UNREACHABLE,
  };
}

export async function mcpDeployPine(input: McpDeployInput): Promise<{
  steps: Record<string, McpToolResult | undefined>;
  chart_state?: McpToolResult;
  pine_source?: string;
  error?: string;
  error_class?: string;
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
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        return {
          steps: {},
          error: "MCP HTTP server is unreachable",
          error_class: MCP_RUNTIME_ERROR_CLASSES.MCP_HTTP_UNREACHABLE,
        };
      }
      const data = (err.response.data || {}) as {
        error?: string;
        error_class?: string;
        steps?: Record<string, McpToolResult | undefined>;
      };
      return {
        steps: data.steps || {},
        error: data.error || err.message,
        error_class: data.error_class,
      };
    }
    return {
      steps: {},
      error: err instanceof Error ? err.message : String(err),
      error_class: MCP_RUNTIME_ERROR_CLASSES.MCP_HTTP_UNREACHABLE,
    };
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
