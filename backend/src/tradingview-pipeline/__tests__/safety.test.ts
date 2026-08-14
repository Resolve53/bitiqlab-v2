import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "src");

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

describe("F. Safety — Stage 1 detector never executes", () => {
  const pipelineFiles = [
    "tradingview-pipeline/candidate-ingest.ts",
    "tradingview-pipeline/deploy-service.ts",
    "tradingview-pipeline/pine-translator.ts",
    "tradingview-pipeline/mcp-deploy.ts",
    "tradingview-pipeline/webhook-security.ts",
    "pages/api/tradingview/candidates/index.ts",
    "pages/api/tradingview/candidates/[id].ts",
    "pages/api/tradingview/deploy.ts",
    "pages/api/tradingview/pine.ts",
  ];

  it("pipeline modules contain ZERO execution-service calls", () => {
    for (const file of pipelineFiles) {
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

  it("quarantined legacy routes remain quarantined", async () => {
    const execute = read("pages/api/paper-trading/execute-signal.ts");
    const webhook = read("pages/api/paper-trading/tradingview-webhook.ts");
    expect(execute).toMatch(/rejectLegacyPaperExecution/);
    expect(webhook).toMatch(/rejectLegacyPaperExecution/);

    const handler = (await import("@/pages/api/paper-trading/execute-signal")).default;
    const webhookHandler = (
      await import("@/pages/api/paper-trading/tradingview-webhook")
    ).default;
    const mockRes = () => {
      const state: { statusCode: number; body: unknown } = {
        statusCode: 200,
        body: null,
      };
      const res: any = {
        setHeader: () => res,
        status(code: number) {
          state.statusCode = code;
          return res;
        },
        json(payload: unknown) {
          state.body = payload;
          return res;
        },
        end() {
          return res;
        },
        _state: state,
      };
      return res;
    };
    const execRes = mockRes();
    await handler(
      { method: "POST", body: {}, headers: {}, query: {}, url: "/api/paper-trading/execute-signal" } as any,
      execRes
    );
    expect(execRes._state.statusCode).toBe(410);

    const hookRes = mockRes();
    await webhookHandler(
      { method: "POST", body: {}, headers: {}, query: {}, url: "/api/paper-trading/tradingview-webhook" } as any,
      hookRes
    );
    expect(hookRes._state.statusCode).toBe(410);
  });

  it("MCP HTTP monitor no longer claims monitoring:true", () => {
    const src = readFileSync(
      path.join(process.cwd(), "mcp-http-server.js"),
      "utf8"
    );
    expect(src).toMatch(/ALERT_SETUP_REQUIRED/);
    expect(src).toMatch(/monitoring_complete: false/);
    expect(src).toMatch(/\/api\/tradingview\/deploy/);
    // The stub that returned monitoring: true is gone.
    expect(src).not.toMatch(/monitoring: true/);
  });

  it("legacy Pine generator is not used by the Stage 1 candidate path", () => {
    const ingest = read("tradingview-pipeline/candidate-ingest.ts");
    const pineApi = read("pages/api/tradingview/pine.ts");
    const deployApi = read("pages/api/tradingview/deploy.ts");
    for (const src of [ingest, pineApi, deployApi]) {
      expect(src).not.toMatch(/PineScriptGenerator/);
      expect(src).not.toMatch(/close < open/);
    }
  });
});
