import { createRequire } from "module";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  errorFromMcpHealth,
  type McpHealthDetails,
} from "@/tradingview-pipeline/mcp-client";
import { MCP_RUNTIME_ERROR_CLASSES } from "@/tradingview-pipeline/errors";

const requireCjs = createRequire(path.join(process.cwd(), "package.json"));
const {
  MCP_ERROR_CLASSES,
  classifyConnectError,
  classifyPageState,
  asToolError,
  sanitizeLogValue,
} = requireCjs(path.join(process.cwd(), "tradingview-mcp-errors.js"));

describe("C. Error classification", () => {
  it("CDP ECONNREFUSED is CDP_UNREACHABLE, not MCP_HTTP_UNREACHABLE", () => {
    const err = classifyConnectError(new Error("connect ECONNREFUSED 127.0.0.1:9222"), {
      browserEnabled: true,
      browserRunning: true,
      cdpReady: false,
    });
    expect(err.error_class).toBe(MCP_ERROR_CLASSES.CDP_UNREACHABLE);
    expect(err.error_class).not.toBe(MCP_ERROR_CLASSES.MCP_HTTP_UNREACHABLE);
    expect(err.message).toMatch(/not an MCP HTTP outage/i);
  });

  it("browser down is BROWSER_NOT_RUNNING", () => {
    const err = classifyConnectError(new Error("whatever"), {
      browserEnabled: true,
      browserRunning: false,
      cdpReady: false,
    });
    expect(err.error_class).toBe(MCP_ERROR_CLASSES.BROWSER_NOT_RUNNING);
  });

  it("auth required is explicit", () => {
    const err = classifyPageState({ ready: false, authenticated: "no" });
    expect(err.error_class).toBe(MCP_ERROR_CLASSES.TRADINGVIEW_AUTH_REQUIRED);
    expect(err.message).toMatch(/tv:session-export/);
    expect(err.message).toMatch(/Do not copy a macOS Chrome profile/);
  });

  it("selector failure is explicit", () => {
    const tool = asToolError({
      error_class: MCP_ERROR_CLASSES.TRADINGVIEW_SELECTOR_NOT_FOUND,
      message: "symbol search missing",
    });
    expect(tool.success).toBe(false);
    expect(tool.error_class).toBe("TRADINGVIEW_SELECTOR_NOT_FOUND");
  });

  it("health helper does not call CDP failure an HTTP outage", () => {
    const details: McpHealthDetails = {
      reachable: true,
      mcp_http: "ok",
      browser: "ok",
      cdp: "fail",
      error_class: MCP_RUNTIME_ERROR_CLASSES.CDP_UNREACHABLE,
    };
    const classified = errorFromMcpHealth(details);
    expect(classified.error_class).toBe("CDP_UNREACHABLE");
    expect(classified.error_class).not.toBe("MCP_HTTP_UNREACHABLE");
  });

  it("tradingview=ready is not treated as a page-not-ready failure", () => {
    const classified = errorFromMcpHealth({
      reachable: true,
      mcp_http: "ok",
      browser: "ok",
      cdp: "ok",
      tradingview: "ready",
      authenticated: "yes",
    });
    expect(classified.error_class).not.toBe("TRADINGVIEW_PAGE_NOT_READY");
    expect(classified.error_class).not.toBe("MCP_HTTP_UNREACHABLE");
  });

  it("unreachable HTTP is MCP_HTTP_UNREACHABLE", () => {
    const classified = errorFromMcpHealth({ reachable: false });
    expect(classified.error_class).toBe("MCP_HTTP_UNREACHABLE");
  });

  it("does not log cookies or tokens", () => {
    expect(sanitizeLogValue("sessionid=abc123 cookie")).toBe("[redacted]");
    expect(sanitizeLogValue("webhook_token=secret")).toBe("[redacted]");
    expect(sanitizeLogValue("CDP ready")).toBe("CDP ready");
  });
});
