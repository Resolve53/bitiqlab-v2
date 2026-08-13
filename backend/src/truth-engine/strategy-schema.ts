/**
 * Strict StrategyDefinition schema + legacy migration (fail loud, never invent).
 */

import { z } from "zod";
import type {
  DirectionalEntrySetup,
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

const directionalEntrySchema = z.object({
  direction: z.enum(["long", "short"]),
  condition: ruleSchema,
});

export const strategyDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().nonnegative().default(1),
  marketType: z.enum(["spot", "futures"]),
  symbol: z.string().min(1),
  biasTimeframe: z.string().optional(),
  confirmationTimeframe: z.string().optional(),
  entryTimeframe: z.string().min(1),
  entries: z.array(directionalEntrySchema).min(1),
  exitCondition: ruleSchema.nullable().default(null),
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
  leverage: z.number().positive().default(1),
});

export class StrategyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyValidationError";
  }
}

/**
 * Parse ONLY exact executable condition text.
 * Ambiguous prose (oversold, overbought, "MACD bullish", …) FAILS.
 */
export function parseConditionText(text: string): IndicatorRule {
  const raw = text.trim();
  // Normalize whitespace; keep content for ambiguity checks
  const normalized = raw.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();

  // Reject known ambiguous soft phrases — never invent thresholds
  if (
    /^(oversold|overbought)$/i.test(lower) ||
    /^macd\s+bullish(\s+crossover)?$/i.test(lower) ||
    /^macd\s+bearish(\s+crossover)?$/i.test(lower) ||
    (/\b(oversold|overbought)\b/i.test(lower) && !/^rsi\b/i.test(lower))
  ) {
    throw new StrategyValidationError(
      `Ambiguous condition text "${raw}" cannot be executed safely. Save a structured IndicatorRule (e.g. RSI < 30) instead of prose.`
    );
  }

  // RSI < 30 — optional trailing parenthetical ignored ONLY when RSI threshold is complete
  let m = lower.match(
    /^rsi\s*(?:\(\s*(\d+)\s*\))?\s*(<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)(?:\s*\([^)]*\))?$/
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

  // close/price vs SMA/EMA
  m = lower.match(
    /^(close|price|open|high|low)\s*(<=|>=|<|>|==)\s*(sma|ema)\s*\(\s*(\d+)\s*\)$/
  );
  if (m) {
    return {
      type: "indicator",
      indicator: "price",
      field: m[1] === "price" ? "close" : m[1],
      operator: m[2] as IndicatorRule["operator"],
      value: { indicator: m[3] as "sma" | "ema", period: Number(m[4]) },
    };
  }

  m = lower.match(
    /^(sma|ema)\s*\(\s*(\d+)\s*\)\s*(<=|>=|<|>|==)\s*(close|price|open|high|low)$/
  );
  if (m) {
    const priceField = m[4] === "price" ? "close" : m[4];
    return {
      type: "indicator",
      indicator: "price",
      field: priceField,
      operator: invertOperator(m[3] as IndicatorRule["operator"]),
      value: { indicator: m[1] as "sma" | "ema", period: Number(m[2]) },
    };
  }

  m = lower.match(/^volume\s*(<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    return {
      type: "indicator",
      indicator: "volume",
      operator: m[1] as IndicatorRule["operator"],
      value: Number(m[2]),
    };
  }

  m = lower.match(
    /^(close|price)\s*(<=|>=|<|>)\s*(?:bb|bollinger(?:\s*bands?)?)\s*(lower|upper|middle)$/
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

  // Explicit MACD only: "macd histogram cross_above 0" or "macd line > 0"
  m = lower.match(
    /^macd(?:\s*(histogram|line|signal))?\s*(cross_above|cross_below|<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)$/
  );
  if (m) {
    return {
      type: "indicator",
      indicator: "macd",
      field: (m[1] as "histogram" | "line" | "signal") || "histogram",
      operator: m[2] as IndicatorRule["operator"],
      value: Number(m[3]),
    };
  }

  throw new StrategyValidationError(
    `Unsupported or ambiguous entry/exit condition text: "${raw}". Provide a structured IndicatorRule. FAIL LOUDLY > INVENT MEANING.`
  );
}

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

function asGroupAnd(rules: Rule[]): Rule {
  if (rules.length === 1) return rules[0];
  return { type: "group", op: "and", rules };
}

/**
 * Resolve an unambiguous explicit direction from stored strategy fields.
 * Never infers from RSI/MACD levels.
 */
function resolveExplicitDirection(
  entryRulesRaw: unknown,
  exitRulesRaw: unknown
): TradeDirection | null {
  const entryObj =
    entryRulesRaw && typeof entryRulesRaw === "object"
      ? (entryRulesRaw as Record<string, unknown>)
      : {};
  const exitObj =
    exitRulesRaw && typeof exitRulesRaw === "object"
      ? (exitRulesRaw as Record<string, unknown>)
      : {};

  if (entryObj.direction === "long" || entryObj.direction === "short") {
    return entryObj.direction;
  }
  if (exitObj.direction === "long" || exitObj.direction === "short") {
    return exitObj.direction;
  }

  const candidates = [
    entryObj.allowed_directions,
    exitObj.allowed_directions,
    entryObj.allowedDirections,
    exitObj.allowedDirections,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length === 1 && (c[0] === "long" || c[0] === "short")) {
      return c[0];
    }
    if (Array.isArray(c) && c.length > 1) {
      throw new StrategyValidationError(
        `Ambiguous legacy direction ${JSON.stringify(
          c
        )}: dual-direction strategies must define separate directional entry setups. FAIL VALIDATION.`
      );
    }
  }
  return null;
}

function parseStructuredEntries(entryRulesRaw: unknown): DirectionalEntrySetup[] | null {
  if (!entryRulesRaw || typeof entryRulesRaw !== "object") return null;
  const obj = entryRulesRaw as Record<string, unknown>;

  // Preferred: entries: [{ direction, condition }]
  if (Array.isArray(obj.entries) && obj.entries.length > 0) {
    return obj.entries.map((e, i) => {
      const parsed = directionalEntrySchema.safeParse(e);
      if (!parsed.success) {
        throw new StrategyValidationError(
          `Invalid entries[${i}]: ${parsed.error.issues
            .map((x) => x.message)
            .join("; ")}`
        );
      }
      return parsed.data;
    });
  }

  // Structured: { direction, condition: Rule }
  if (obj.condition && (obj.direction === "long" || obj.direction === "short")) {
    const cond = ruleSchema.safeParse(obj.condition);
    if (!cond.success) {
      throw new StrategyValidationError(
        `Invalid entry condition: ${cond.error.message}`
      );
    }
    return [{ direction: obj.direction, condition: cond.data }];
  }

  // Structured rules array with explicit direction on parent
  if (
    Array.isArray(obj.rules) &&
    obj.rules.length > 0 &&
    (obj.direction === "long" || obj.direction === "short")
  ) {
    const rules = z.array(ruleSchema).parse(obj.rules);
    return [
      {
        direction: obj.direction,
        condition: asGroupAnd(rules),
      },
    ];
  }

  return null;
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
  leverage?: number;
}): StrategyDefinition {
  const entryRulesRaw = strategy.entry_rules;
  const exitRulesRaw = strategy.exit_rules;
  const exitObj =
    exitRulesRaw && typeof exitRulesRaw === "object"
      ? (exitRulesRaw as Record<string, unknown>)
      : {};

  let entries = parseStructuredEntries(entryRulesRaw);

  if (!entries) {
    // Legacy flat conditions — only if direction is unambiguous & text is exact
    const texts = extractConditionStrings(entryRulesRaw);
    if (texts.length === 0) {
      // Bare array of Rule objects without direction — ambiguous
      if (
        Array.isArray(entryRulesRaw) &&
        entryRulesRaw.length > 0 &&
        typeof entryRulesRaw[0] === "object" &&
        entryRulesRaw[0] !== null &&
        "type" in (entryRulesRaw[0] as object)
      ) {
        throw new StrategyValidationError(
          `Strategy ${strategy.id} has structured rules but no explicit direction. Provide entries: [{ direction, condition }].`
        );
      }
      throw new StrategyValidationError(
        `Strategy ${strategy.id} has no executable entries. Store structured directional entries.`
      );
    }

    const direction = resolveExplicitDirection(entryRulesRaw, exitRulesRaw);
    if (!direction) {
      throw new StrategyValidationError(
        `Strategy ${strategy.id} has no explicit trade direction. Set entry_rules.direction or entries[].direction. Direction is never inferred from indicators.`
      );
    }

    const rules = texts.map(parseConditionText);
    entries = [{ direction, condition: asGroupAnd(rules) }];
  }

  // Exit condition
  let exitCondition: Rule | null = null;
  if (
    exitRulesRaw &&
    typeof exitRulesRaw === "object" &&
    (exitRulesRaw as { condition?: unknown }).condition
  ) {
    const parsed = ruleSchema.safeParse(
      (exitRulesRaw as { condition: unknown }).condition
    );
    if (!parsed.success) {
      throw new StrategyValidationError(
        `Invalid exitCondition: ${parsed.error.message}`
      );
    }
    exitCondition = parsed.data;
  } else if (
    exitRulesRaw &&
    typeof exitRulesRaw === "object" &&
    Array.isArray((exitRulesRaw as { rules?: unknown }).rules) &&
    ((exitRulesRaw as { rules: unknown[] }).rules).length > 0
  ) {
    const rules = z
      .array(ruleSchema)
      .parse((exitRulesRaw as { rules: unknown[] }).rules);
    exitCondition = asGroupAnd(rules);
  } else {
    const texts = extractConditionStrings(exitRulesRaw);
    if (texts.length > 0) {
      exitCondition = asGroupAnd(texts.map(parseConditionText));
    }
  }

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

  const entryObj =
    entryRulesRaw && typeof entryRulesRaw === "object"
      ? (entryRulesRaw as Record<string, unknown>)
      : {};

  const riskPerTradePct =
    typeof exitObj.risk_per_trade_pct === "number"
      ? Number(exitObj.risk_per_trade_pct)
      : typeof entryObj.risk_per_trade_pct === "number"
        ? Number(entryObj.risk_per_trade_pct)
        : 1;

  const marketType =
    strategy.market_type === "futures" ? "futures" : "spot";

  let leverage = 1;
  if (typeof strategy.leverage === "number") {
    leverage = strategy.leverage;
  } else if (typeof exitObj.leverage === "number") {
    leverage = Number(exitObj.leverage);
  } else if (typeof entryObj.leverage === "number") {
    leverage = Number(entryObj.leverage);
  }

  if (marketType === "spot" && leverage !== 1) {
    throw new StrategyValidationError(
      `Spot strategies must use leverage=1 (got ${leverage}).`
    );
  }
  if (!(leverage > 0)) {
    throw new StrategyValidationError(`Invalid leverage: ${leverage}`);
  }

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
    entries,
    exitCondition,
    risk: {
      riskPerTradePct,
      stopLossPct,
      takeProfitPct,
      maxHoldBars:
        typeof exitObj.max_hold_bars === "number"
          ? Number(exitObj.max_hold_bars)
          : undefined,
    },
    leverage,
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
