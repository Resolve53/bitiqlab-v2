import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const FORBIDDEN = [
  "TradeExecutionService",
  "BinanceTradingClient",
  "marketOrder",
  "limitOrder",
  "Cornix",
  "cornix",
  "executeTradeWithRetry",
];

const STAGE_1C_FILES = [
  "mcp-http-server.js",
  "tradingview-browser-runtime.js",
  "tradingview-mcp-errors.js",
  "tradingview-browser-bootstrap.js",
  "src/tradingview-pipeline/mcp-client.ts",
  "src/tradingview-pipeline/deploy-service.ts",
  "src/tradingview-pipeline/mcp-deploy.ts",
];

describe("E. MCP tool safety — no execution", () => {
  it("Stage 1C modules contain ZERO execution-service calls", () => {
    for (const file of STAGE_1C_FILES) {
      const src = read(file);
      for (const token of FORBIDDEN) {
        expect(src, `${file} must not reference ${token}`).not.toMatch(
          new RegExp(token)
        );
      }
      expect(src).not.toMatch(/paper-trading\/execute-signal/);
      expect(src).not.toMatch(/TradeExecutionService/);
    }
  });

  it("preserves the Stage 1 MCP tool contract", () => {
    const src = read("mcp-http-server.js");
    for (const tool of [
      "chart_set_symbol",
      "chart_set_timeframe",
      "pine_set_source",
      "pine_smart_compile",
      "pine_get_source",
      "chart_get_state",
      "alert_setup_strategy_webhook",
    ]) {
      expect(src).toContain(tool);
    }
  });

  it("Dockerfile.mcp installs Chromium and does not publish CDP", () => {
    const docker = readFileSync(path.join(ROOT, "..", "Dockerfile.mcp"), "utf8");
    expect(docker).toMatch(/chromium/i);
    expect(docker).toMatch(/EXPOSE 3000/);
    expect(docker).not.toMatch(/EXPOSE 9222/);
    expect(docker).toMatch(/CDP is bound to 127\.0\.0\.1|NOT published|Do NOT expose 9222/i);
  });

  it("bootstrap polling loop does not launch or navigate", () => {
    const src = read("tradingview-browser-bootstrap.js");
    expect(src).toMatch(/TRADINGVIEW_BOOTSTRAP_ONCE/);
    expect(src).toMatch(/runtime\.stop\(\)/);
    const loopStart = src.indexOf("while (Date.now() - started < holdMs)");
    expect(loopStart).toBeGreaterThan(0);
    const loop = src.slice(loopStart, src.indexOf("function shutdown"));
    expect(loop).toMatch(/probeAndApply/);
    expect(loop).not.toMatch(/runtime\.start\(/);
    expect(loop).not.toMatch(/Page\.navigate|createTarget|includeUrl/);
  });

  it("does not fake pine_set_source or compile success", () => {
    const src = read("mcp-http-server.js");
    expect(src).toMatch(/PINE_EDITOR_SETUP_REQUIRED/);
    expect(src).toMatch(/COMPILE_FAILED/);
    expect(src).not.toMatch(/fake DOM success/i);
  });
});
