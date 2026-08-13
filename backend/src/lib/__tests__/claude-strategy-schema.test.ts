import { describe, expect, it } from "vitest";
import {
  toPersistedRules,
  validateGeneratedStrategyForSave,
  isExecutableStrategyRules,
  STRATEGY_SCHEMA_VERSION,
} from "../claude-strategy-schema";
import { StrategyValidationError } from "@/truth-engine";
import {
  validDualStrategy,
  validLongStrategy,
  validShortStrategy,
} from "./strategy-gen-fixtures";
describe("claude-strategy-schema persistence + validation", () => {
  it("validates LONG structured strategy via Truth Engine builder", () => {
    const g = validLongStrategy();
    const { entry_rules, exit_rules } = toPersistedRules(g);
    const def = validateGeneratedStrategyForSave({
      name: g.name,
      symbol: g.symbol,
      timeframe: g.timeframe,
      market_type: g.market_type,
      entry_rules,
      exit_rules,
      leverage: g.leverage,
    });
    expect(def.entries).toHaveLength(1);
    expect(def.entries[0].direction).toBe("long");
    expect(def.risk.riskPerTradePct).toBe(1.5);
    expect(def.risk.stopLossPct).toBe(2);
    expect(def.risk.takeProfitPct).toBe(4);
    expect(def.leverage).toBe(1);
    expect(entry_rules.schema_version).toBe(STRATEGY_SCHEMA_VERSION);
  });

  it("validates SHORT and dual LONG+SHORT", () => {
    for (const g of [validShortStrategy(), validDualStrategy()]) {
      const { entry_rules, exit_rules } = toPersistedRules(g);
      const def = validateGeneratedStrategyForSave({
        name: g.name,
        symbol: g.symbol,
        timeframe: g.timeframe,
        market_type: g.market_type,
        entry_rules,
        exit_rules,
      });
      expect(def.entries.length).toBe(g.entries.length);
      expect(def.entries.map((e) => e.direction)).toEqual(
        g.entries.map((e) => e.direction)
      );
    }
  });

  it("round-trips risk and leverage without silent 1% default", () => {
    const g = validLongStrategy();
    g.risk_per_trade_pct = 2.25;
    g.leverage = 1;
    const { entry_rules, exit_rules } = toPersistedRules(g);
    expect(entry_rules.risk_per_trade_pct).toBe(2.25);
    expect(exit_rules.risk_per_trade_pct).toBe(2.25);
    expect(entry_rules.leverage).toBe(1);
    expect(exit_rules.leverage).toBe(1);
    const def = validateGeneratedStrategyForSave({
      name: g.name,
      symbol: g.symbol,
      timeframe: g.timeframe,
      market_type: g.market_type,
      entry_rules,
      exit_rules,
    });
    expect(def.risk.riskPerTradePct).toBe(2.25);
  });

  it("rejects null/empty entries", () => {
    expect(
      isExecutableStrategyRules({
        name: "x",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
        entry_rules: null,
        exit_rules: { stop_loss_percent: 2 },
      })
    ).toBe(false);
  });

  it("rejects missing direction", () => {
    expect(() =>
      validateGeneratedStrategyForSave({
        name: "bad",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
        entry_rules: {
          conditions: ["RSI < 30"],
        },
        exit_rules: { stop_loss_percent: 2 },
      })
    ).toThrow(StrategyValidationError);
  });

  it("rejects unsupported indicator via schema parse", () => {
    expect(() =>
      validateGeneratedStrategyForSave({
        name: "bad",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
        entry_rules: {
          entries: [
            {
              direction: "long",
              condition: {
                type: "indicator",
                indicator: "ichimoku",
                operator: "<",
                value: 1,
              },
            },
          ],
        },
        exit_rules: { stop_loss_percent: 2 },
      })
    ).toThrow(/Invalid entries/);
  });

  it("rejects ambiguous prose legacy conditions", () => {
    expect(() =>
      validateGeneratedStrategyForSave({
        name: "bad",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
        entry_rules: {
          direction: "long",
          conditions: ["MACD bullish crossover"],
        },
        exit_rules: { stop_loss_percent: 2 },
      })
    ).toThrow(/Ambiguous|Unsupported/);
  });

  it("rejects malformed group (empty rules)", () => {
    expect(() =>
      validateGeneratedStrategyForSave({
        name: "bad",
        symbol: "BTCUSDT",
        timeframe: "1h",
        market_type: "spot",
        entry_rules: {
          entries: [
            {
              direction: "long",
              condition: { type: "group", op: "and", rules: [] },
            },
          ],
        },
        exit_rules: { stop_loss_percent: 2 },
      })
    ).toThrow(/Invalid entries/);
  });
});
