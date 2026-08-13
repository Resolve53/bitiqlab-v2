/**
 * Deterministic rule evaluator:
 * OHLCV + indicators + StrategyDefinition → entry/exit decisions on CLOSED candles.
 */

import {
  buildIndicatorSeries,
  ensurePeriod,
  type IndicatorSeries,
} from "./indicators";
import type {
  ConditionSnapshot,
  EvaluatedSignal,
  IndicatorRule,
  OHLCVBar,
  Rule,
  StrategyDefinition,
  TradeDirection,
} from "./types";

export interface RuleEvalResult {
  passed: boolean;
  conditions: ConditionSnapshot;
  passedRules: string[];
  failedRules: string[];
}

function describeRule(rule: IndicatorRule): string {
  const val =
    typeof rule.value === "number"
      ? String(rule.value)
      : `${rule.value.indicator}${
          rule.value.period ? `(${rule.value.period})` : ""
        }${rule.value.field ? `.${rule.value.field}` : ""}`;
  return `${rule.indicator}${rule.period ? `(${rule.period})` : ""}${
    rule.field ? `.${rule.field}` : ""
  } ${rule.operator} ${val}`;
}

function readSeriesValue(
  series: IndicatorSeries,
  rule: Pick<IndicatorRule, "indicator" | "period" | "field">,
  index: number,
  closes: number[]
): number | null {
  switch (rule.indicator) {
    case "rsi": {
      const period = rule.period ?? 14;
      const arr = ensurePeriod(series, "rsi", period, closes);
      return arr[index] ?? null;
    }
    case "sma": {
      const period = rule.period ?? 20;
      const arr = ensurePeriod(series, "sma", period, closes);
      return arr[index] ?? null;
    }
    case "ema": {
      const period = rule.period ?? 20;
      const arr = ensurePeriod(series, "ema", period, closes);
      return arr[index] ?? null;
    }
    case "macd": {
      const field = (rule.field as "line" | "signal" | "histogram") || "histogram";
      return series.macd[field][index] ?? null;
    }
    case "bollinger": {
      const field = (rule.field as "upper" | "middle" | "lower") || "middle";
      return series.bollinger[field][index] ?? null;
    }
    case "volume":
      return series.volume[index] ?? null;
    case "price": {
      const field = (rule.field as "open" | "high" | "low" | "close") || "close";
      return series[field][index] ?? null;
    }
    default:
      return null;
  }
}

function compare(
  left: number,
  operator: IndicatorRule["operator"],
  right: number,
  prevLeft: number | null,
  prevRight: number | null
): boolean {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "==":
      return left === right;
    case "cross_above":
      if (prevLeft == null || prevRight == null) return false;
      return prevLeft <= prevRight && left > right;
    case "cross_below":
      if (prevLeft == null || prevRight == null) return false;
      return prevLeft >= prevRight && left < right;
    default:
      return false;
  }
}

function evalIndicatorRule(
  rule: IndicatorRule,
  series: IndicatorSeries,
  index: number,
  closes: number[]
): { ok: boolean; label: string; left: number | null; right: number | null } {
  const label = describeRule(rule);
  const left = readSeriesValue(series, rule, index, closes);
  let right: number | null;
  if (typeof rule.value === "number") {
    right = rule.value;
  } else {
    right = readSeriesValue(
      series,
      {
        indicator: rule.value.indicator,
        period: rule.value.period,
        field: rule.value.field,
      },
      index,
      closes
    );
  }

  if (left == null || right == null) {
    return { ok: false, label, left, right };
  }

  const prevLeft =
    index > 0 ? readSeriesValue(series, rule, index - 1, closes) : null;
  let prevRight: number | null = right;
  if (typeof rule.value !== "number") {
    prevRight =
      index > 0
        ? readSeriesValue(
            series,
            {
              indicator: rule.value.indicator,
              period: rule.value.period,
              field: rule.value.field,
            },
            index - 1,
            closes
          )
        : null;
  } else if (rule.operator === "cross_above" || rule.operator === "cross_below") {
    prevRight = rule.value;
  }

  const ok = compare(left, rule.operator, right, prevLeft, prevRight);
  return { ok, label, left, right };
}

export function evaluateRules(
  rules: Rule[],
  series: IndicatorSeries,
  index: number,
  closes: number[],
  combine: "and" | "or" = "and"
): RuleEvalResult {
  const conditions: ConditionSnapshot = {};
  const passedRules: string[] = [];
  const failedRules: string[] = [];

  const results = rules.map((rule) => {
    if (rule.type === "group") {
      const nested = evaluateRules(
        rule.rules,
        series,
        index,
        closes,
        rule.op
      );
      Object.assign(conditions, nested.conditions);
      passedRules.push(...nested.passedRules);
      failedRules.push(...nested.failedRules);
      return nested.passed;
    }

    const r = evalIndicatorRule(rule, series, index, closes);
    conditions[r.label] = r.ok;
    if (r.left != null) conditions[`${r.label}::left`] = r.left;
    if (r.right != null) conditions[`${r.label}::right`] = r.right;
    if (r.ok) passedRules.push(r.label);
    else failedRules.push(r.label);
    return r.ok;
  });

  const passed =
    combine === "and" ? results.every(Boolean) : results.some(Boolean);

  return { passed, conditions, passedRules, failedRules };
}

function directionForEntry(
  strategy: StrategyDefinition,
  conditions: ConditionSnapshot
): TradeDirection | null {
  const dirs = strategy.allowedDirections;
  if (dirs.length === 1) return dirs[0];

  // Prefer RSI heuristics when both allowed
  for (const [k, v] of Object.entries(conditions)) {
    if (k.includes("rsi") && k.includes("::left") && typeof v === "number") {
      if (v <= 40 && dirs.includes("long")) return "long";
      if (v >= 60 && dirs.includes("short")) return "short";
    }
  }
  return dirs[0] ?? null;
}

/**
 * Generate signals from closed candles only. Signal at index i is based on
 * bars[0..i]. Execution is deferred to open of i+1 by the executor.
 */
export function generateSignals(
  bars: OHLCVBar[],
  strategy: StrategyDefinition
): EvaluatedSignal[] {
  if (bars.length === 0) return [];

  const series = buildIndicatorSeries(bars);
  const closes = series.close;
  const signals: EvaluatedSignal[] = [];

  // Need at least 1 prior bar for cross operators; start after minimal warmup
  for (let i = 1; i < bars.length; i++) {
    const entry = evaluateRules(strategy.entryRules, series, i, closes, "and");
    if (entry.passed) {
      const direction = directionForEntry(strategy, entry.conditions);
      if (direction) {
        signals.push({
          barIndex: i,
          timestamp: bars[i].timestamp,
          action: "entry",
          direction,
          conditions: entry.conditions,
          passedRules: entry.passedRules,
        });
      }
    }

    if (strategy.exitRules.length > 0) {
      const exit = evaluateRules(strategy.exitRules, series, i, closes, "and");
      if (exit.passed) {
        signals.push({
          barIndex: i,
          timestamp: bars[i].timestamp,
          action: "exit",
          conditions: exit.conditions,
          passedRules: exit.passedRules,
        });
      }
    }
  }

  return signals;
}

/** Evaluate exit rules at a specific closed bar (for open positions). */
export function shouldExitAtBar(
  bars: OHLCVBar[],
  strategy: StrategyDefinition,
  index: number,
  series?: IndicatorSeries
): RuleEvalResult {
  const s = series ?? buildIndicatorSeries(bars);
  if (strategy.exitRules.length === 0) {
    return { passed: false, conditions: {}, passedRules: [], failedRules: [] };
  }
  return evaluateRules(strategy.exitRules, s, index, s.close, "and");
}

export { buildIndicatorSeries };
