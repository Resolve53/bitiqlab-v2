import { describe, expect, it, vi, beforeEach } from "vitest";
import { LEGACY_PAPER_EXECUTION_DISABLED } from "@/lib/trading-safety";
import { readFileSync } from "fs";
import path from "path";

function mockRes() {
  const state: {
    statusCode: number;
    body: any;
  } = { statusCode: 200, body: null };
  const res: any = {
    statusCode: 200,
    setHeader: () => res,
    status(code: number) {
      state.statusCode = code;
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      state.body = payload;
      return res;
    },
    end() {
      return res;
    },
    _getStatusCode: () => state.statusCode,
    _getJSONData: () => state.body,
  };
  return res;
}

async function invoke(handler: any, body: any = {}) {
  const req: any = {
    method: "POST",
    body,
    headers: {},
    query: {},
    url: "/api/test",
  };
  const res = mockRes();
  await handler(req, res);
  return {
    statusCode: res._getStatusCode(),
    json: res._getJSONData(),
  };
}

describe("Phase 4A legacy quarantine", () => {
  it("monitor auto_trade cannot execute", async () => {
    const handler = (await import("@/pages/api/paper-trading/monitor")).default;
    const result = await invoke(handler, { session_id: "x", auto_trade: true });
    expect(result.statusCode).toBe(410);
    expect(result.json.error).toContain("Legacy paper execution is disabled");
  });

  it("execute-signal cannot execute", async () => {
    const handler = (await import("@/pages/api/paper-trading/execute-signal"))
      .default;
    const result = await invoke(handler, {
      session_id: "x",
      signal: "BUY",
      symbol: "BTCUSDT",
    });
    expect(result.statusCode).toBe(410);
  });

  it("TradingView webhook cannot execute", async () => {
    const handler = (
      await import("@/pages/api/paper-trading/tradingview-webhook")
    ).default;
    const result = await invoke(handler, {
      session_id: "x",
      signal: "BUY",
      symbol: "BTCUSDT",
    });
    expect(result.statusCode).toBe(410);
    expect(String(result.json.error)).toMatch(/disabled|Legacy/i);
  });

  it("coin-monitor cannot execute", async () => {
    const { createMonitoringJob } = await import("@/lib/coin-monitor");
    expect(() =>
      createMonitoringJob({
        session_id: "s",
        strategy_id: "st",
        coins: ["BTCUSDT"],
        symbol: "BTCUSDT",
        timeframe: "1h",
        auto_trade: true,
      })
    ).toThrow(LEGACY_PAPER_EXECUTION_DISABLED);
  });

  it("legacy start + multi-coin spray cannot start", async () => {
    const start = (await import("@/pages/api/paper-trading/start")).default;
    const multi = (
      await import("@/pages/api/paper-trading/start-multi-coin-monitor")
    ).default;
    const scan = (await import("@/pages/api/paper-trading/multi-coin-scan"))
      .default;
    expect((await invoke(start)).statusCode).toBe(410);
    expect((await invoke(multi)).statusCode).toBe(410);
    expect((await invoke(scan)).statusCode).toBe(410);
  });

  it("PaperTradingSimulator processSignal is quarantined", async () => {
    const { PaperTradingSimulator } = await import(
      "@/paper-trading/paper-trading-simulator"
    );
    const sim = new PaperTradingSimulator({
      strategy_id: "s",
      initial_capital: 1000,
      max_drawdown_limit: 0.2,
      max_concurrent_positions: 1,
      commission_percent: 0.1,
      slippage_percent: 0.05,
    });
    await expect(
      sim.processSignal({ type: "entry" } as any, 100)
    ).rejects.toThrow(/Legacy paper execution is disabled/);
  });

  it("monitor has no mock strategy fallback and no marketOrder", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/pages/api/paper-trading/monitor.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/using mock data for demo/i);
    expect(src).not.toMatch(/marketOrder/);
    expect(src).toMatch(/rejectLegacyPaperExecution/);
  });
});

describe("Phase 4A promotion quarantine", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("force promotion rejected/disabled", async () => {
    vi.doMock("@/lib/db", () => ({
      getDB: () => ({
        getStrategy: async () => ({
          id: "s1",
          status: "approved",
          winning_trades: 100,
          losing_trades: 0,
          current_sharpe: 2,
          max_drawdown: 0.05,
          win_rate: 0.9,
          deployed_to_bitiq: false,
        }),
        listTradingSessions: async () => [
          {
            id: "sess",
            start_time: new Date(Date.now() - 30 * 86400000).toISOString(),
            total_trades: 50,
          },
        ],
      }),
    }));
    const { promoteStrategyToBitiq } = await import(
      "@/lib/bitiq-promotion-service"
    );
    const result = await promoteStrategyToBitiq({
      strategyId: "s1",
      force: true,
    });
    expect(result.success).toBe(false);
    expect(String(result.error || result.message)).toMatch(
      /Force promotion is disabled/i
    );
  });

  it("ready promotion still blocked in Phase 4A (no auto promote)", async () => {
    vi.doMock("@/lib/db", () => ({
      getDB: () => ({
        getStrategy: async () => ({
          id: "s1",
          status: "approved",
          winning_trades: 100,
          losing_trades: 0,
          current_sharpe: 2,
          max_drawdown: 0.05,
          win_rate: 0.9,
          deployed_to_bitiq: false,
        }),
        listTradingSessions: async () => [
          {
            id: "sess",
            start_time: new Date(Date.now() - 30 * 86400000).toISOString(),
            total_trades: 50,
          },
        ],
      }),
    }));
    const { promoteStrategyToBitiq } = await import(
      "@/lib/bitiq-promotion-service"
    );
    const result = await promoteStrategyToBitiq({ strategyId: "s1" });
    expect(result.success).toBe(false);
    expect(String(result.error || result.message)).toMatch(
      /Automatic Bitiq promotion is disabled/i
    );
  });
});
