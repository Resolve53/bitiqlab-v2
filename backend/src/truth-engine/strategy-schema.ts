/**
 * Strict StrategyDefinition schema + legacy text → structured rule conversion.
 * Malformed Claude / DB output fails clearly — never silently ignored.
 */

import { z } from "zod";
import type {
  IndicatorRule,
  Rule,
  StrategyDefinition,
  TradeDirection,
} from "./types";

const SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const SUPPORTED_TIMEFRAMES = ["15m", "1h", "4h"] as const;

const compareToIndicatorSchema = z.object({
  indicator: z.enum([
    "rsi",
    "sma",
    "ema",
    "macd",
    "bollinger",
    "volume",
    "price",
  ]),
  period: z.number().int().positive().optional(),
  field: z.string().optional(),
});

const indicatorRuleSchema: z.ZodType<IndicatorRule> = z.object({
  type: z.literal("indicator"),
  indicator: z.enum([
    "rsi",
    "sma",
    "ema",
    "macd",
    "bollinger",
    "volume",
    "price",
  ]),
  timeframe: z.string().optional(),
  period: z.number().int().positive().optional(),
  field: z.string().optional(),
  operator: z.enum([
    "<",
    "<=",
    ">",
    ">=",
    "==",
    "cross_above",
    "cross_below",
  ]),
  value: z.union([z.number(), compareToIndicatorSchema]),
});

const ruleSchema: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    indicatorRuleSchema,
    z.object({
      type: z.literal("group"),
      op: z.enum(["and", "or"]),
      rules: z.array(ruleSchema).min(1),
    }),
  ])
);

export const strategyDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().nonnegative().default(1),
  marketType: z.enum(["spot", "futures"]),
  symbol: z.string().min(1),
  biasTimeframe: z.string().optional(),
  confirmationTimeframe: z.string().optional(),
  entryTimeframe: z.string().min(1),
  allowedDirections: z
    .array(z.enum(["long", "short"]))
    .min(1)
    .default(["long"]),
  entryRules: z.array(ruleSchema).min(1),
  exitRules: z.array(ruleSchema).default([]),
  risk: z.object({
    riskPerTradePct: z.number().positive().max(100),
    stopLossPct: z.number().positive().optional(),
    takeProfitPct: z.number().positive().optional(),
    minimumRR: z.number().positive().optional(),
    maxConcurrentPositions: z.number().int().positive().optional(),
    maxHoldBars: z.number().int().positive().optional(),
  }),
  fees: z
    .object({
      commissionPct: z.number().nonnegative().optional(),
      slippagePct: z.number().nonnegative().optional(),
    })
    .optional(),
});

export class StrategyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyValidationError";
  }
}

/**
 * Parse free-text conditions used by existing Claude / deploy strategies
 * into executable IndicatorRule objects. Unsupported phrases fail clearly.
 */
export function parseConditionText(text: string): IndicatorRule {
  const raw = text.trim();
  const normalized = raw
    .replace(/\s+/g, " ")
    .replace(/[()]/g, " ")
    .trim()
    .toLowerCase();

  // RSI < 30 / RSI > 70
  let m = normalized.match(
    /^rsi\s*(?:\(\s*(\d+)\s*\))?\s*(<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)/
  );
  if (m) {
    return {
      type: "indicator",
      indicator: "rsi",
      period: m[1] ? Number(m[1]) : 14,
      operator: m[2] as IndicatorRule["operator"],
      value: Number(m[3]),
    };
  }

  // close / price vs SMA/EMA
  m = normalized.match(
    /^(close|price|open|high|low)\s*(<=|>=|<|>|==)\s*(sma|ema)\s*\(\s*(\d+)\s*\)/
  );
  if (m) {
    return {
      type: "indicator",
      indicator: "price",
      field: m[1] === "price" ? "close" : m[1],
      operator: m[2] as IndicatorRule["operator"],
      value: {
        indicator: m[3] as "sma" | "ema",
        period: Number(m[4]),
      },
    };
  }

  // SMA(20) < close
  m = normalized.match(
    /^(sma|ema)\s*\(\s*(\d+)\s*\)\s*(<=|>=|<|>|==)\s*(close|price|open|high|low)/
  );
  if (m) {
    const priceField = m[4] === "price" ? "close" : m[4];
    // Invert into price op indicator for consistent evaluation
    const op = invertOperator(m[3] as IndicatorRule["operator"]);
    return {
      type: "indicator",
      indicator: "price",
      field: priceField,
      operator: op,
      value: {
        indicator: m[1] as "sma" | "ema",
        period: Number(m[2]),
      },
    };
  }

  // volume > N
  m = normalized.match(/^volume\s*(<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    return {
      type: "indicator",
      indicator: "volume",
      operator: m[1] as IndicatorRule["operator"],
      value: Number(m[2]),
    };
  }

  // Bollinger: close < bb lower / price > upper band
  m = normalized.match(
    /^(close|price)\s*(<=|>=|<|>)\s*(?:bb|bollinger(?:\s*bands?)?)\s*(lower|upper|middle)/
  );
  if (m) {
    return {
      type: "indicator",
      indicator: "price",
      field: m[1] === "price" ? "close" : m[1],
      operator: m[2] as IndicatorRule["operator"],
      value: { indicator: "bollinger", field: m[3], period: 20 },
    };
  }

  // MACD phrases
  if (
    /macd.*(bullish\s+cross|cross(es|ed|ing)?\s+above|bullish)/.test(
      normalized
    ) ||
    normalized === "macd bullish crossover"
  ) {
    return {
      type: "indicator",
      indicator: "macd",
      field: "histogram",
      operator: "cross_above",
      value: 0,
    };
  }
  if (
    /macd.*(bearish\s+cross|cross(es|ed|ing)?\s+below|bearish)/.test(
      normalized
    ) ||
    normalized === "macd bearish crossover"
  ) {
    return {
      type: "indicator",
      indicator: "macd",
      field: "histogram",
      operator: "cross_below",
      value: 0,
    };
  }

  // MACD histogram / line comparisons
  m = normalized.match(
    /^macd(?:\s*(histogram|line|signal))?\s*(<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)/
  );
  if (m) {
    return {
      type: "indicator",
      indicator: "macd",
      field: (m[1] as Macdish) || "histogram",
      operator: m[2] as IndicatorRule["operator"],
      value: Number(m[3]),
    };
  }

  // Soft phrases from deploy-rsi-macd
  if (/rsi\s*<\s*30/.test(normalized) || /oversold/.test(normalized)) {
    return {
      type: "indicator",
      indicator: "rsi",
      period: 14,
      operator: "<",
      value: 30,
    };
  }
  if (/rsi\s*>\s*70/.test(normalized) || /overbought/.test(normalized)) {
    return {
      type: "indicator",
      indicator: "rsi",
      period: 14,
      operator: ">",
      value: 70,
    };
  }

  throw new StrategyValidationError(
    `Unsupported or ambiguous entry/exit condition text: "${raw}". Provide a structured IndicatorRule (indicator, operator, value).`
  );
}

type Macdish = "histogram" | "line" | "signal";

function invertOperator(
  op: IndicatorRule["operator"]
): IndicatorRule["operator"] {
  switch (op) {
    case "<":
      return ">";
    case "<=":
      return ">=";
    case ">":
      return "<";
    case ">=":
      return "<=";
    default:
      return op;
  }
}

function extractConditionStrings(rules: unknown): string[] {
  if (!rules || typeof rules !== "object") return [];
  const r = rules as Record<string, unknown>;
  const c = r.conditions;
  if (typeof c === "string") {
    return c
      .split(/\s+AND\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(c)) {
    return c.map(String).filter(Boolean);
  }
  return [];
}

function coercePercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.abs(value);
}

/**
 * Build a StrategyDefinition from a DB strategy row (legacy or structured).
 */
export function buildStrategyDefinition(strategy: {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  market_type?: string;
  entry_rules?: unknown;
  exit_rules?: unknown;
  version?: number;
  backtest_count?: number;
}): StrategyDefinition {
  const entryRulesRaw = strategy.entry_rules;
  let entryRules: Rule[] = [];

  if (
    entryRulesRaw &&
    typeof entryRulesRaw === "object" &&
    Array.isArray((entryRulesRaw as { rules?: unknown }).rules)
  ) {
    entryRules = (entryRulesRaw as { rules: Rule[] }).rules;
  } else if (
    Array.isArray(entryRulesRaw) &&
    entryRulesRaw.length > 0 &&
    typeof entryRulesRaw[0] === "object" &&
    entryRulesRaw[0] !== null &&
    "type" in (entryRulesRaw[0] as object)
  ) {
    entryRules = entryRulesRaw as Rule[];
  } else {
    const texts = extractConditionStrings(entryRulesRaw);
    if (texts.length === 0) {
      throw new StrategyValidationError(
        `Strategy ${strategy.id} has no executable entryRules. Store structured rules or parseable conditions.`
      );
    }
    entryRules = texts.map(parseConditionText);
  }

  const exitRulesRaw = strategy.exit_rules;
  let exitRules: Rule[] = [];
  if (
    exitRulesRaw &&
    typeof exitRulesRaw === "object" &&
    Array.isArray((exitRulesRaw as { rules?: unknown }).rules)
  ) {
    exitRules = (exitRulesRaw as { rules: Rule[] }).rules;
  } else {
    const texts = extractConditionStrings(exitRulesRaw);
    exitRules = texts.map(parseConditionText);
  }

  const exitObj =
    exitRulesRaw && typeof exitRulesRaw === "object"
      ? (exitRulesRaw as Record<string, unknown>)
      : {};

  const stopLossPct = coercePercent(
    exitObj.stop_loss_percent ?? exitObj.stopLossPct ?? exitObj.stop_loss_pct
  );
  const takeProfitPct = coercePercent(
    exitObj.take_profit_percent ??
      exitObj.takeProfitPct ??
      exitObj.take_profit_pct
  );

  if (!stopLossPct || stopLossPct <= 0) {
    throw new StrategyValidationError(
      `Strategy ${strategy.id} requires exit_rules.stop_loss_percent (positive %) for risk-based sizing.`
    );
  }

  const riskPerTradePct =
    typeof exitObj.risk_per_trade_pct === "number"
      ? Number(exitObj.risk_per_trade_pct)
      : typeof (entryRulesRaw as { risk_per_trade_pct?: number })
          ?.risk_per_trade_pct === "number"
        ? Number(
            (entryRulesRaw as { risk_per_trade_pct: number }).risk_per_trade_pct
          )
        : 1;

  const marketType =
    strategy.market_type === "futures" ? "futures" : "spot";

  const allowedDirections: TradeDirection[] = inferDirections(
    entryRules,
    exitObj
  );

  const draft = {
    id: strategy.id,
    name: strategy.name,
    version:
      typeof strategy.version === "number"
        ? strategy.version
        : (strategy.backtest_count ?? 0) + 1,
    marketType,
    symbol: strategy.symbol.toUpperCase(),
    entryTimeframe: strategy.timeframe,
    allowedDirections,
    entryRules,
    exitRules,
    risk: {
      riskPerTradePct,
      stopLossPct,
      takeProfitPct,
      maxHoldBars:
        typeof exitObj.max_hold_bars === "number"
          ? Number(exitObj.max_hold_bars)
          : undefined,
    },
  };

  const parsed = strategyDefinitionSchema.safeParse(draft);
  if (!parsed.success) {
    throw new StrategyValidationError(
      `Invalid strategy schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }

  return parsed.data as StrategyDefinition;
}

function inferDirections(
  entryRules: Rule[],
  exitObj: Record<string, unknown>
): TradeDirection[] {
  if (Array.isArray(exitObj.allowed_directions)) {
    return exitObj.allowed_directions as TradeDirection[];
  }
  // Heuristic: RSI oversold → long; overbought → short; default long
  const flat = flattenRules(entryRules);
  const hasOversold = flat.some(
    (r) =>
      r.indicator === "rsi" &&
      (r.operator === "<" || r.operator === "<=") &&
      typeof r.value === "number" &&
      r.value <= 40
  );
  const hasOverbought = flat.some(
    (r) =>
      r.indicator === "rsi" &&
      (r.operator === ">" || r.operator === ">=") &&
      typeof r.value === "number" &&
      r.value >= 60
  );
  if (hasOversold && hasOverbought) return ["long", "short"];
  if (hasOverbought && !hasOversold) return ["short"];
  return ["long"];
}

function flattenRules(rules: Rule[]): IndicatorRule[] {
  const out: IndicatorRule[] = [];
  for (const r of rules) {
    if (r.type === "indicator") out.push(r);
    else out.push(...flattenRules(r.rules));
  }
  return out;
}

export function assertSupportedMarket(
  symbol: string,
  timeframe: string
): void {
  const sym = symbol.toUpperCase();
  if (!(SUPPORTED_SYMBOLS as readonly string[]).includes(sym)) {
    throw new StrategyValidationError(
      `Unsupported symbol "${sym}". Phase 1 supports: ${SUPPORTED_SYMBOLS.join(
        ", "
      )}`
    );
  }
  if (!(SUPPORTED_TIMEFRAMES as readonly string[]).includes(timeframe)) {
    throw new StrategyValidationError(
      `Unsupported timeframe "${timeframe}". Phase 1 supports: ${SUPPORTED_TIMEFRAMES.join(
        ", "
      )}`
    );
  }
}

export { SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES };
