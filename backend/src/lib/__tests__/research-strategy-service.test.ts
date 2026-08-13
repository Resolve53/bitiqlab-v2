import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validLongStrategy,
} from "@/lib/__tests__/strategy-gen-fixtures";
import { SUBMIT_EXECUTABLE_STRATEGY_TOOL } from "@/lib/claude-strategy-schema";
import { StrategyGenerator } from "@/autoresearch/wrapper";

const createStrategy = vi.fn();
const createStrategyAuditLog = vi.fn();
const getStrategy = vi.fn();

vi.mock("@/lib/db", () => ({
  getDB: () => ({
    createStrategy,
    createStrategyAuditLog,
    getStrategy,
  }),
}));

vi.mock("@/lib/price-cache", () => ({
  getPriceCache: () => ({
    updatePrices: async () => undefined,
    getPrice: () => null,
  }),
}));

import { generateStrategyFromPrompt } from "@/lib/research-strategy-service";
import { toPersistedRules } from "@/lib/claude-strategy-schema";
import { runTruthBacktest } from "@/truth-engine";
import type { OHLCVBar } from "@/truth-engine";

function mockGenSequence(payloads: unknown[]) {
  let i = 0;
  const create = vi.fn(async () => {
    const payload = payloads[Math.min(i, payloads.length - 1)];
    i += 1;
    return {
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: `toolu_${i}`,
          name: SUBMIT_EXECUTABLE_STRATEGY_TOOL.name,
          input: payload,
        },
      ],
    };
  });
  return {
    beta: { tools: { messages: { create } } },
    _create: create,
  };
}

describe("generateStrategyFromPrompt — validate before save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.STRATEGY_CLAUDE_MODEL = "claude-test-model-for-unit";
    createStrategy.mockImplementation(async (input: Record<string, unknown>) => ({
      id: "saved-1",
      name: input.name,
      description: input.description,
      symbol: input.symbol,
      timeframe: input.timeframe,
      market_type: input.market_type,
      entry_rules: input.entry_rules,
      exit_rules: input.exit_rules,
      ai_enhancement: input.ai_enhancement,
      status: "draft",
      current_sharpe: 0,
      backtest_count: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_return: 0,
      max_drawdown: 0,
      win_rate: 0,
      confidence_score: 0,
      created_by: input.created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deployed_to_bitiq: false,
    }));
    createStrategyAuditLog.mockResolvedValue({});
  });

  it("rejects missing ANTHROPIC_API_KEY without saving", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      generateStrategyFromPrompt({
        prompt: "long",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
      })
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(createStrategy).not.toHaveBeenCalled();
  });

  it("rejects missing STRATEGY_CLAUDE_MODEL without saving", async () => {
    delete process.env.STRATEGY_CLAUDE_MODEL;
    await expect(
      generateStrategyFromPrompt({
        prompt: "long",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
      })
    ).rejects.toThrow(/STRATEGY_CLAUDE_MODEL is required/);
    expect(createStrategy).not.toHaveBeenCalled();
  });

  it("accepts explicit injected generator model when env model is unset", async () => {
    delete process.env.STRATEGY_CLAUDE_MODEL;
    const client = mockGenSequence([validLongStrategy()]);
    const generator = new StrategyGenerator("k", {
      client: client as any,
      model: "injected-only-model",
    });
    const result = await generateStrategyFromPrompt({
      prompt: "long RSI",
      symbol: "BTCUSDT",
      timeframe: "1h",
      market_type: "spot",
      generator,
    });
    expect(createStrategy).toHaveBeenCalledTimes(1);
    expect(result.analysis.model).toBe("injected-only-model");
    const createCalls = client._create.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    expect(createCalls[0][0].model).toBe("injected-only-model");
  });

  it("saves only after Truth Engine validation succeeds", async () => {
    const client = mockGenSequence([validLongStrategy()]);
    const generator = new StrategyGenerator("k", {
      client: client as any,
      model: "claude-test-model-for-unit",
    });
    const result = await generateStrategyFromPrompt({
      prompt: "long RSI",
      symbol: "BTCUSDT",
      timeframe: "1h",
      market_type: "spot",
      generator,
    });
    expect(createStrategy).toHaveBeenCalledTimes(1);
    expect(result.analysis.executable).toBe(true);
    expect(result.strategy.entry_rules).toMatchObject({
      schema_version: "truth_engine_v1",
    });
    const savedRules = createStrategy.mock.calls[0][0];
    expect(savedRules.entry_rules.entries[0].direction).toBe("long");
    expect(savedRules.exit_rules.risk_per_trade_pct).toBe(1.5);
    expect(savedRules.exit_rules.leverage).toBe(1);
  });

  it("correction path: invalid first → valid second → save once", async () => {
    const invalid = {
      ...validLongStrategy(),
      entries: [], // null/empty — rejected before TE
    };
    // asExecutableStrategy throws on empty entries in generate() — use missing SL instead
    const invalidForTe = {
      ...validLongStrategy(),
      entries: [
        {
          direction: "long",
          condition: {
            type: "indicator",
            indicator: "rsi",
            period: 14,
            operator: "<",
            value: 30,
          },
        },
      ],
      stop_loss_percent: 0, // fails TE (must be positive after abs — coercePercent of 0 fails)
    };
    // Actually coercePercent(0) returns 0 which fails `!stopLossPct || stopLossPct <= 0`
    const client = mockGenSequence([invalidForTe, validLongStrategy()]);
    const generator = new StrategyGenerator("k", {
      client: client as any,
      model: "claude-test-model-for-unit",
    });
    const result = await generateStrategyFromPrompt({
      prompt: "long",
      symbol: "BTCUSDT",
      timeframe: "1h",
      market_type: "spot",
      generator,
    });
    expect(client._create).toHaveBeenCalledTimes(2);
    expect(createStrategy).toHaveBeenCalledTimes(1);
    expect(result.strategy.id).toBe("saved-1");
  });

  it("invalid first + invalid second → no save", async () => {
    const bad = {
      ...validLongStrategy(),
      stop_loss_percent: 0,
    };
    const client = mockGenSequence([bad, bad]);
    const generator = new StrategyGenerator("k", {
      client: client as any,
      model: "claude-test-model-for-unit",
    });
    await expect(
      generateStrategyFromPrompt({
        prompt: "long",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
        generator,
      })
    ).rejects.toThrow(/was not saved/);
    expect(createStrategy).not.toHaveBeenCalled();
  });

  it("rejects unsupported Phase 1 timeframe before Claude", async () => {
    await expect(
      generateStrategyFromPrompt({
        prompt: "x",
        symbol: "BTCUSDT",
        timeframe: "1d",
        market_type: "spot",
        generator: new StrategyGenerator("k", {
          client: mockGenSequence([validLongStrategy()]) as any,
          model: "claude-test-model-for-unit",
        }),
      })
    ).rejects.toThrow(/Unsupported timeframe/);
    expect(createStrategy).not.toHaveBeenCalled();
  });

  it("persistence round-trip preserves executable semantics", async () => {
    const g = validLongStrategy();
    const client = mockGenSequence([g]);
    const generator = new StrategyGenerator("k", {
      client: client as any,
      model: "claude-test-model-for-unit",
    });
    const result = await generateStrategyFromPrompt({
      prompt: "long",
      symbol: "BTCUSDT",
      timeframe: "1h",
      market_type: "spot",
      generator,
    });

    const persisted = result.strategy;
    getStrategy.mockResolvedValue(persisted);

    const loaded = await getStrategy(persisted.id);
    const expected = toPersistedRules(g);
    expect(loaded.entry_rules.entries).toEqual(expected.entry_rules.entries);
    expect(loaded.entry_rules.risk_per_trade_pct).toBe(1.5);
    expect(loaded.exit_rules.stop_loss_percent).toBe(2);
    expect(loaded.exit_rules.take_profit_percent).toBe(4);
    expect(loaded.exit_rules.leverage).toBe(1);
  });
});

describe("integration: AI object → validate → Truth Engine fixture", () => {
  function fixtureBars(): OHLCVBar[] {
    const bars: OHLCVBar[] = [];
    for (let i = 0; i < 30; i++) {
      bars.push({
        timestamp: new Date(Date.UTC(2024, 0, 1, 0, i * 15)),
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1000,
      });
    }
    // drive price above 100 for long entry on price > 100
    bars.push({
      timestamp: new Date(Date.UTC(2024, 0, 1, 8, 0)),
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 1500,
    });
    bars.push({
      timestamp: new Date(Date.UTC(2024, 0, 1, 8, 15)),
      open: 101,
      high: 101 * 1.05,
      low: 100.5,
      close: 103,
      volume: 1600,
    });
    for (let i = 0; i < 5; i++) {
      bars.push({
        timestamp: new Date(Date.UTC(2024, 0, 1, 8, 30 + i * 15)),
        open: 103,
        high: 104,
        low: 102,
        close: 103,
        volume: 1200,
      });
    }
    return bars;
  }

  it("runs trades from persisted AI-shaped rules", async () => {
    const generated = {
      name: "Fixture AI Long",
      description: "price breakout",
      symbol: "BTCUSDT",
      timeframe: "15m",
      market_type: "spot" as const,
      entries: [
        {
          direction: "long" as const,
          condition: {
            type: "indicator",
            indicator: "price",
            field: "close",
            operator: ">",
            value: 100,
          },
        },
      ],
      exit_condition: null,
      stop_loss_percent: 2,
      take_profit_percent: 4,
      risk_per_trade_pct: 1,
      leverage: 1,
    };
    const { entry_rules, exit_rules } = toPersistedRules(generated);
    const result = await runTruthBacktest({
      strategy: {
        id: "ai-fixture",
        name: generated.name,
        symbol: generated.symbol,
        timeframe: generated.timeframe,
        market_type: generated.market_type,
        entry_rules,
        exit_rules,
      },
      request: {
        strategyId: "ai-fixture",
        bars: fixtureBars(),
        initialCapital: 10_000,
        commissionPct: 0.05,
        slippagePct: 0.02,
      },
    });
    expect(result.resultSource).toBe("REAL_BACKTEST");
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.metrics.totalTrades).toBeGreaterThan(0);
    expect(result.provenance.strategyDefinitionSnapshot.entries[0].direction).toBe(
      "long"
    );
  });
});
