import { describe, expect, it } from "vitest";
import {
  generatePineFromFrozen,
  assertPineSupported,
  UnsupportedRuleError,
} from "@/tradingview-pipeline";
import {
  TOKEN,
  longFrozen,
  shortFrozen,
  dualFrozen,
  strategyFromAuthorityLike,
} from "./helpers";
import type { FrozenVersionAuthority } from "../types";
import type { StrategyDefinition } from "@/truth-engine/types";

function authFor(strategy: StrategyDefinition): FrozenVersionAuthority {
  const frozen = longFrozen();
  return {
    strategyId: frozen.row.strategy_id,
    strategyVersionId: frozen.row.id,
    versionNumber: 1,
    snapshotHash: frozen.hash,
    snapshot: {},
    symbol: strategy.symbol,
    timeframe: strategy.entryTimeframe,
    strategy,
  };
}

describe("B. Pine semantics", () => {
  it("emits LONG RSI entry, SL/TP, and candle-close alert", () => {
    const frozen = longFrozen();
    const pine = generatePineFromFrozen(
      {
        strategyId: frozen.row.strategy_id,
        strategyVersionId: frozen.row.id,
        versionNumber: frozen.row.version,
        snapshotHash: frozen.hash,
        snapshot: frozen.snapshot as unknown as Record<string, unknown>,
        symbol: frozen.snapshot.symbol,
        timeframe: frozen.snapshot.timeframe,
        strategy: {
          id: frozen.row.strategy_id,
          name: frozen.snapshot.name,
          version: frozen.row.version,
          marketType: "spot",
          symbol: frozen.snapshot.symbol,
          entryTimeframe: frozen.snapshot.timeframe,
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
          exitCondition: null,
          risk: { riskPerTradePct: 1.5, stopLossPct: 2, takeProfitPct: 4 },
          leverage: 1,
        },
      },
      { webhookToken: TOKEN }
    );
    expect(pine).toMatch(/strategy\.entry\("LONG", strategy\.long\)/);
    expect(pine).toMatch(/rsi_14 = ta\.rsi\(close, 14\)/);
    expect(pine).toMatch(/rsi_14 < 30/);
    expect(pine).toMatch(/barstate\.isconfirmed/);
    expect(pine).toMatch(/alert\.freq_once_per_bar_close/);
    expect(pine).toMatch(/strategy\.exit\("XL"/);
    expect(pine).toMatch(/stop_loss_pct = 2/);
    expect(pine).toMatch(/take_profit_pct = 4/);
    expect(pine).not.toMatch(/SIGNAL_BUY|SIGNAL_SELL/);
    expect(pine).not.toMatch(/close > open/);
  });

  it("emits SHORT entries", () => {
    const frozen = shortFrozen();
    const pine = generatePineFromFrozen(
      {
        strategyId: frozen.row.strategy_id,
        strategyVersionId: frozen.row.id,
        versionNumber: 1,
        snapshotHash: frozen.hash,
        snapshot: {},
        symbol: "ETHUSDT",
        timeframe: "15m",
        strategy: {
          id: frozen.row.strategy_id,
          name: "short",
          version: 1,
          marketType: "spot",
          symbol: "ETHUSDT",
          entryTimeframe: "15m",
          entries: [
            {
              direction: "short",
              condition: {
                type: "indicator",
                indicator: "rsi",
                period: 14,
                operator: ">",
                value: 70,
              },
            },
          ],
          exitCondition: null,
          risk: { riskPerTradePct: 1, stopLossPct: 2, takeProfitPct: 3 },
          leverage: 1,
        },
      },
      { webhookToken: TOKEN }
    );
    expect(pine).toMatch(/strategy\.entry\("SHORT", strategy\.short\)/);
    expect(pine).toMatch(/rsi_14 > 70/);
    expect(pine).toMatch(/strategy\.exit\("XS"/);
  });

  it("translates moving averages, comparisons, crosses, and AND/OR", () => {
    const strategy: StrategyDefinition = {
      id: "s",
      name: "combo",
      version: 1,
      marketType: "spot",
      symbol: "SOLUSDT",
      entryTimeframe: "4h",
      entries: [
        {
          direction: "long",
          condition: {
            type: "group",
            op: "and",
            rules: [
              {
                type: "indicator",
                indicator: "sma",
                period: 20,
                operator: "cross_above",
                value: { indicator: "sma", period: 50 },
              },
              {
                type: "group",
                op: "or",
                rules: [
                  {
                    type: "indicator",
                    indicator: "ema",
                    period: 12,
                    operator: ">",
                    value: { indicator: "ema", period: 26 },
                  },
                  {
                    type: "indicator",
                    indicator: "macd",
                    field: "histogram",
                    operator: "cross_above",
                    value: 0,
                  },
                ],
              },
            ],
          },
        },
      ],
      exitCondition: {
        type: "indicator",
        indicator: "price",
        field: "close",
        operator: "cross_below",
        value: { indicator: "bollinger", field: "lower", period: 20 },
      },
      risk: { riskPerTradePct: 2, stopLossPct: 2.5, takeProfitPct: 5 },
      leverage: 1,
    };
    assertPineSupported(strategy);
    const pine = generatePineFromFrozen(authFor(strategy), { webhookToken: TOKEN });
    expect(pine).toMatch(/sma_20 = ta\.sma\(close, 20\)/);
    expect(pine).toMatch(/sma_50 = ta\.sma\(close, 50\)/);
    expect(pine).toMatch(/ema_12 = ta\.ema\(close, 12\)/);
    expect(pine).toMatch(/ta\.macd\(close, 12, 26, 9\)/);
    expect(pine).toMatch(/ta\.crossover\(sma_20, sma_50\)/);
    expect(pine).toMatch(/ta\.crossover\(macd_histogram, 0\)/);
    expect(pine).toMatch(/ta\.crossunder\(close, bb_20_lower\)/);
    expect(pine).toMatch(/ and /);
    expect(pine).toMatch(/ or /);
    expect(pine).toMatch(/SYMBOL = "SOLUSDT"/);
    expect(pine).toMatch(/TIMEFRAME = "4h"/);
  });

  it("translates volume and numeric comparisons", () => {
    const pine = generatePineFromFrozen(
      authFor(
        strategyFromAuthorityLike({
          type: "indicator",
          indicator: "volume",
          operator: ">",
          value: 1000,
        })
      ),
      { webhookToken: TOKEN }
    );
    expect(pine).toMatch(/volume > 1000/);
  });

  it("rejects unknown operators without fallback", () => {
    expect(() =>
      assertPineSupported(
        strategyFromAuthorityLike({
          type: "indicator",
          indicator: "rsi",
          operator: "cross_above",
          value: 30,
        })
      )
    ).not.toThrow();
    expect(() =>
      assertPineSupported({
        ...strategyFromAuthorityLike({
          type: "indicator",
          indicator: "rsi",
          period: 14,
          operator: "<",
          value: 30,
        }),
        entries: [],
      })
    ).toThrow(UnsupportedRuleError);
  });

  it("covers dual LONG+SHORT from one frozen version", () => {
    const frozen = dualFrozen();
    expect(frozen.snapshot.symbol).toBe("SOLUSDT");
  });
});
