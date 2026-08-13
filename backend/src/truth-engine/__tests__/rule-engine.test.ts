import { describe, expect, it } from "vitest";
import {
  calcRSI,
  calcSMA,
  buildIndicatorSeries,
} from "../indicators";
import { evaluateRules, generateSignals } from "../rule-evaluator";
import { parseConditionText, buildStrategyDefinition } from "../strategy-schema";
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
  it("parses RSI condition text", () => {
    const rule = parseConditionText("RSI < 30 (oversold)");
    expect(rule.indicator).toBe("rsi");
    expect(rule.operator).toBe("<");
    expect(rule.value).toBe(30);
  });

  it("evaluates RSI condition", () => {
    // Build a series that ends oversold
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(100);
    for (let i = 0; i < 20; i++) closes.push(100 - i * 2);
    const bars = barsFromCloses(closes);
    const series = buildIndicatorSeries(bars);
    const idx = bars.length - 1;
    const rsi = series.rsi.get(14)![idx];
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeLessThan(30);

    const result = evaluateRules(
      [
        {
          type: "indicator",
          indicator: "rsi",
          period: 14,
          operator: "<",
          value: 30,
        },
      ],
      series,
      idx,
      series.close,
      "and"
    );
    expect(result.passed).toBe(true);
  });

  it("evaluates moving average condition", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const bars = barsFromCloses(closes);
    const series = buildIndicatorSeries(bars);
    const idx = bars.length - 1;
    const result = evaluateRules(
      [
        {
          type: "indicator",
          indicator: "price",
          field: "close",
          operator: ">",
          value: { indicator: "sma", period: 20 },
        },
      ],
      series,
      idx,
      series.close,
      "and"
    );
    expect(result.passed).toBe(true);
    expect(calcSMA(closes, 20)[idx]).toBeLessThan(closes[idx]);
  });

  it("supports AND conditions", () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(100);
    for (let i = 0; i < 20; i++) closes.push(100 - i * 2);
    const bars = barsFromCloses(closes);
    const series = buildIndicatorSeries(bars);
    const idx = bars.length - 1;
    const result = evaluateRules(
      [
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
      series,
      idx,
      series.close,
      "and"
    );
    expect(result.passed).toBe(true);
  });

  it("generates LONG signals for oversold RSI strategy", () => {
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
      entry_rules: { conditions: ["RSI < 30"] },
      exit_rules: { stop_loss_percent: 2, take_profit_percent: 4 },
    });
    expect(strategy.allowedDirections).toContain("long");
    const signals = generateSignals(bars, strategy);
    const entries = signals.filter((s) => s.action === "entry");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.direction === "long")).toBe(true);
  });

  it("generates SHORT signals for overbought RSI strategy", () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(100);
    for (let i = 0; i < 25; i++) closes.push(100 + i * 2);
    const bars = barsFromCloses(closes);
    const strategy: StrategyDefinition = {
      ...buildStrategyDefinition({
        id: "s2",
        name: "RSI short",
        symbol: "BTCUSDT",
        timeframe: "15m",
        market_type: "spot",
        entry_rules: { conditions: ["RSI > 70"] },
        exit_rules: {
          stop_loss_percent: 2,
          take_profit_percent: 4,
          allowed_directions: ["short"],
        },
      }),
      allowedDirections: ["short"],
    };
    const signals = generateSignals(bars, strategy);
    const entries = signals.filter((s) => s.action === "entry");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.direction === "short")).toBe(true);
  });

  it("RSI warmup returns null not fake 50", () => {
    const rsi = calcRSI([1, 2, 3, 4, 5], 14);
    expect(rsi.every((v) => v === null)).toBe(true);
  });
});
