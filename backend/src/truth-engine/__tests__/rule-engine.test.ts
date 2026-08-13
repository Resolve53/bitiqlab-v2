import { describe, expect, it } from "vitest";
import {
  calcRSI,
  calcSMA,
  buildIndicatorSeries,
} from "../indicators";
import {
  evaluateCondition,
  evaluateRules,
  generateSignals,
} from "../rule-evaluator";
import {
  parseConditionText,
  buildStrategyDefinition,
  StrategyValidationError,
} from "../strategy-schema";
import type { OHLCVBar, StrategyDefinition } from "../types";

function barsFromCloses(closes: number[]): OHLCVBar[] {
  return closes.map((c, i) => ({
    timestamp: new Date(Date.UTC(2024, 0, 1, 0, i * 15)),
    open: c,
    high: c * 1.001,
    low: c * 0.999,
    close: c,
    volume: 1000 + i,
  }));
}

describe("rule engine", () => {
  it("parses exact RSI condition text with optional parenthetical", () => {
    const rule = parseConditionText("RSI < 30 (oversold)");
    expect(rule.indicator).toBe("rsi");
    expect(rule.operator).toBe("<");
    expect(rule.value).toBe(30);
  });

  it("rejects ambiguous prose: oversold alone", () => {
    expect(() => parseConditionText("oversold")).toThrow(
      StrategyValidationError
    );
  });

  it("rejects ambiguous prose: MACD bullish crossover", () => {
    expect(() => parseConditionText("MACD bullish crossover")).toThrow(
      StrategyValidationError
    );
  });

  it("rejects ambiguous prose: overbought alone", () => {
    expect(() => parseConditionText("overbought")).toThrow(
      StrategyValidationError
    );
  });

  it("evaluates RSI condition", () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(100);
    for (let i = 0; i < 20; i++) closes.push(100 - i * 2);
    const bars = barsFromCloses(closes);
    const series = buildIndicatorSeries(bars);
    const idx = bars.length - 1;
    const rsi = series.rsi.get(14)![idx];
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeLessThan(30);

    const result = evaluateCondition(
      {
        type: "indicator",
        indicator: "rsi",
        period: 14,
        operator: "<",
        value: 30,
      },
      series,
      idx,
      series.close
    );
    expect(result.passed).toBe(true);
  });

  it("evaluates moving average condition", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const bars = barsFromCloses(closes);
    const series = buildIndicatorSeries(bars);
    const idx = bars.length - 1;
    const result = evaluateCondition(
      {
        type: "indicator",
        indicator: "price",
        field: "close",
        operator: ">",
        value: { indicator: "sma", period: 20 },
      },
      series,
      idx,
      series.close
    );
    expect(result.passed).toBe(true);
    expect(calcSMA(closes, 20)[idx]).toBeLessThan(closes[idx]);
  });

  it("supports explicit AND group", () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(100);
    for (let i = 0; i < 20; i++) closes.push(100 - i * 2);
    const bars = barsFromCloses(closes);
    const series = buildIndicatorSeries(bars);
    const idx = bars.length - 1;
    const result = evaluateCondition(
      {
        type: "group",
        op: "and",
        rules: [
          {
            type: "indicator",
            indicator: "rsi",
            period: 14,
            operator: "<",
            value: 30,
          },
          {
            type: "indicator",
            indicator: "volume",
            operator: ">",
            value: 100,
          },
        ],
      },
      series,
      idx,
      series.close
    );
    expect(result.passed).toBe(true);
  });

  it("supports explicit OR group", () => {
    const bars = barsFromCloses(Array.from({ length: 30 }, () => 50));
    const series = buildIndicatorSeries(bars);
    const idx = bars.length - 1;
    const result = evaluateCondition(
      {
        type: "group",
        op: "or",
        rules: [
          {
            type: "indicator",
            indicator: "price",
            field: "close",
            operator: ">",
            value: 1000,
          },
          {
            type: "indicator",
            indicator: "volume",
            operator: ">",
            value: 100,
          },
        ],
      },
      series,
      idx,
      series.close
    );
    expect(result.passed).toBe(true);
  });

  it("supports nested AND + OR", () => {
    const bars = barsFromCloses(Array.from({ length: 30 }, () => 50));
    const series = buildIndicatorSeries(bars);
    const idx = bars.length - 1;
    const result = evaluateCondition(
      {
        type: "group",
        op: "and",
        rules: [
          {
            type: "indicator",
            indicator: "volume",
            operator: ">",
            value: 100,
          },
          {
            type: "group",
            op: "or",
            rules: [
              {
                type: "indicator",
                indicator: "price",
                field: "close",
                operator: ">",
                value: 1000,
              },
              {
                type: "indicator",
                indicator: "price",
                field: "close",
                operator: "<",
                value: 100,
              },
            ],
          },
        ],
      },
      series,
      idx,
      series.close
    );
    expect(result.passed).toBe(true);
  });

  it("explicit long strategy generates only long entries", () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(100);
    for (let i = 0; i < 25; i++) closes.push(100 - i * 2);
    const bars = barsFromCloses(closes);
    const strategy = buildStrategyDefinition({
      id: "s1",
      name: "RSI long",
      symbol: "BTCUSDT",
      timeframe: "15m",
      market_type: "spot",
      entry_rules: {
        direction: "long",
        conditions: ["RSI < 30"],
      },
      exit_rules: { stop_loss_percent: 2, take_profit_percent: 4 },
    });
    const signals = generateSignals(bars, strategy);
    const entries = signals.filter((s) => s.action === "entry");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.direction === "long")).toBe(true);
  });

  it("explicit short strategy generates only short entries", () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(100);
    for (let i = 0; i < 25; i++) closes.push(100 + i * 2);
    const bars = barsFromCloses(closes);
    const strategy = buildStrategyDefinition({
      id: "s2",
      name: "RSI short",
      symbol: "BTCUSDT",
      timeframe: "15m",
      market_type: "spot",
      entry_rules: {
        direction: "short",
        conditions: ["RSI > 70"],
      },
      exit_rules: { stop_loss_percent: 2, take_profit_percent: 4 },
    });
    const signals = generateSignals(bars, strategy);
    const entries = signals.filter((s) => s.action === "entry");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.direction === "short")).toBe(true);
  });

  it("dual-direction strategy evaluates each setup independently", () => {
    const strategy: StrategyDefinition = {
      id: "dual",
      name: "dual",
      version: 1,
      marketType: "spot",
      symbol: "BTCUSDT",
      entryTimeframe: "15m",
      entries: [
        {
          direction: "long",
          condition: {
            type: "indicator",
            indicator: "price",
            field: "close",
            operator: "<",
            value: 40,
          },
        },
        {
          direction: "short",
          condition: {
            type: "indicator",
            indicator: "price",
            field: "close",
            operator: ">",
            value: 160,
          },
        },
      ],
      exitCondition: null,
      risk: { riskPerTradePct: 1, stopLossPct: 2, takeProfitPct: 4 },
      leverage: 1,
    };

    const closes = [
      ...Array.from({ length: 10 }, () => 100),
      30, // long
      ...Array.from({ length: 5 }, () => 100),
      170, // short
      100,
    ];
    const bars = barsFromCloses(closes);
    const signals = generateSignals(bars, strategy);
    const entries = signals.filter((s) => s.action === "entry");
    expect(entries.some((e) => e.direction === "long")).toBe(true);
    expect(entries.some((e) => e.direction === "short")).toBe(true);
  });

  it("ambiguous legacy strategy without direction fails", () => {
    expect(() =>
      buildStrategyDefinition({
        id: "bad",
        name: "bad",
        symbol: "BTCUSDT",
        timeframe: "15m",
        entry_rules: { conditions: ["RSI < 30"] },
        exit_rules: { stop_loss_percent: 2 },
      })
    ).toThrow(/explicit trade direction/i);
  });

  it("dual allowed_directions with flat rules fails", () => {
    expect(() =>
      buildStrategyDefinition({
        id: "bad2",
        name: "bad2",
        symbol: "BTCUSDT",
        timeframe: "15m",
        entry_rules: {
          conditions: ["RSI < 30"],
          allowed_directions: ["long", "short"],
        },
        exit_rules: { stop_loss_percent: 2 },
      })
    ).toThrow(/Ambiguous legacy direction/i);
  });

  it("RSI warmup returns null not fake 50", () => {
    const rsi = calcRSI([1, 2, 3, 4, 5], 14);
    expect(rsi.every((v) => v === null)).toBe(true);
  });

  it("evaluateRules still supports combine arg for nested use", () => {
    const bars = barsFromCloses(Array.from({ length: 5 }, () => 10));
    const series = buildIndicatorSeries(bars);
    const r = evaluateRules(
      [
        {
          type: "indicator",
          indicator: "volume",
          operator: ">",
          value: 99999,
        },
      ],
      series,
      4,
      series.close,
      "or"
    );
    expect(r.passed).toBe(false);
  });
});
