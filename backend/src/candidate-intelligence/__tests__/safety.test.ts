import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const FORBIDDEN = [
  "TradeExecutionService",
  "BinanceTradingClient",
  "marketOrder",
  "limitOrder",
  "Cornix",
  "cornix",
  "executeTradeWithRetry",
  "scorePreTradeSignal",
  "pre-trade-scorer",
  "@anthropic-ai/sdk",
  "openai",
  "ACCEPT",
  "ADJUST",
  "CANCEL",
];

const STAGE2_FILES = [
  "candidate-intelligence/enrich.ts",
  "candidate-intelligence/assemble.ts",
  "candidate-intelligence/score.ts",
  "candidate-intelligence/freshness.ts",
  "candidate-intelligence/provenance.ts",
  "candidate-intelligence/providers/binance-market.ts",
  "candidate-intelligence/providers/binance-derivatives.ts",
  "candidate-intelligence/providers/coinglass.ts",
  "candidate-intelligence/providers/coinapi.ts",
  "candidate-intelligence/providers/sentiment.ts",
  "candidate-intelligence/providers/macro.ts",
  "pages/api/tradingview/candidates/[id]/enrich.ts",
  "pages/api/tradingview/candidates/[id]/index.ts",
  "pages/api/tradingview/candidates/[id]/intelligence.ts",
];

describe("G. Safety — Stage 2 never executes and never asks AI to decide", () => {
  it("Stage 2 modules contain ZERO execution-service or AI-decision calls", () => {
    for (const file of STAGE2_FILES) {
      const src = read(file);
      for (const token of [
        "TradeExecutionService",
        "BinanceTradingClient",
        "marketOrder",
        "limitOrder",
        "Cornix",
        "cornix",
        "executeTradeWithRetry",
        "scorePreTradeSignal",
        "pre-trade-scorer",
        "@anthropic-ai/sdk",
      ]) {
        expect(src, `${file} must not reference ${token}`).not.toMatch(
          new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        );
      }
      expect(src).not.toMatch(/paper-trading\/execute-signal/);
      expect(src).not.toMatch(/tickPaper/);
      expect(src).not.toMatch(/Phase 4B/);
    }
  });

  it("enrich API explicitly records executed:false and ai_decision:null", () => {
    const src = read("pages/api/tradingview/candidates/[id]/enrich.ts");
    expect(src).toMatch(/executed:\s*false/);
    expect(src).toMatch(/ai_decision:\s*null/);
    expect(src).toMatch(/Stage 3 AI review is not run in Stage 2/);
    expect(src).not.toMatch(/ACCEPT/);
    expect(src).not.toMatch(/ADJUST/);
    expect(src).not.toMatch(/CANCEL/);
  });

  it("entire candidate-intelligence tree has no execution or Claude decision imports", () => {
    const files = walk(path.join(ROOT, "candidate-intelligence"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      if (file.includes("/__tests__/")) continue;
      const src = readFileSync(file, "utf8");
      for (const token of FORBIDDEN.filter((t) => !["ACCEPT", "ADJUST", "CANCEL"].includes(t))) {
        expect(src, `${file} must not reference ${token}`).not.toContain(token);
      }
      expect(src).not.toContain("openai");
    }
  });

  it("Binance market provider uses public REST only (no trading client)", () => {
    const src = read("candidate-intelligence/providers/binance-market.ts");
    expect(src).toMatch(/api\.binance\.com/);
    expect(src).not.toContain("apiKey");
    expect(src).not.toContain("secretKey");
    expect(src).not.toContain("BinanceTradingClient");
    expect(src).not.toMatch(/\/api\/v3\/order/);
    expect(src).not.toMatch(/fapi\/v1\/order/);
  });

  it("enrichCandidate source never calls generatePine or ingest as a side effect of scoring", () => {
    const src = read("candidate-intelligence/enrich.ts");
    expect(src).not.toMatch(/generatePineFromFrozen/);
    expect(src).not.toMatch(/ingestTradingViewCandidate/);
    expect(src).toMatch(/DATA \+ deterministic score only/);
  });
});
