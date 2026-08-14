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
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

const WORKER_FILES = [
  "candidate-intelligence/worker.ts",
  "candidate-intelligence/worker-main.ts",
  "candidate-intelligence/worker-db.ts",
  "candidate-intelligence/claim.ts",
  "candidate-intelligence/retry-policy.ts",
  "candidate-intelligence/log.ts",
  "pages/api/health/enrichment-worker.ts",
  "pages/api/internal/enrichment-tick.ts",
];

describe("J. Safety — Stage 2B worker never executes and never asks AI to decide", () => {
  it("worker modules contain ZERO execution-service or AI-decision calls", () => {
    for (const file of WORKER_FILES) {
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
        "tickPaper",
      ]) {
        expect(src, `${file} must not reference ${token}`).not.toContain(token);
      }
      expect(src).not.toMatch(/paper-trading\/execute-signal/);
    }
  });

  it("internal tick API records executed:false and ai_decision:null", () => {
    const src = read("pages/api/internal/enrichment-tick.ts");
    expect(src).toMatch(/executed:\s*false/);
    expect(src).toMatch(/ai_decision:\s*null/);
    expect(src).toMatch(/runEnrichmentWorkerTick/);
  });

  it("manual enrich endpoint remains and still calls enrichCandidate", () => {
    const src = read("pages/api/tradingview/candidates/[id]/enrich.ts");
    expect(src).toMatch(/enrichCandidate/);
    expect(src).toMatch(/executed:\s*false/);
  });

  it("worker reuses enrichCandidate rather than duplicating provider fetches", () => {
    const src = read("candidate-intelligence/worker.ts");
    expect(src).toMatch(/enrichCandidate\(/);
    expect(src).not.toMatch(/fetchBinanceMarket\(/);
    expect(src).not.toMatch(/fetchCoinGlassOverlay\(/);
  });

  it("new worker files are covered by the candidate-intelligence tree walk", () => {
    const files = walk(path.join(ROOT, "candidate-intelligence"));
    const names = files.map((f) => path.basename(f));
    expect(names).toContain("worker.ts");
    expect(names).toContain("worker-main.ts");
    expect(names).toContain("claim.ts");
    for (const file of files) {
      if (file.includes("/__tests__/")) continue;
      const src = readFileSync(file, "utf8");
      expect(src).not.toContain("TradeExecutionService");
      expect(src).not.toContain("BinanceTradingClient");
      expect(src).not.toContain("scorePreTradeSignal");
    }
  });
});
