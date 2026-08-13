/**
 * Canonical Claude → Truth Engine strategy generation schema.
 * Tool input mirrors Phase 1 executable Rule trees — no prose rules.
 */

import {
  assertSupportedMarket,
  buildStrategyDefinition,
  StrategyValidationError,
  SUPPORTED_SYMBOLS,
  SUPPORTED_TIMEFRAMES,
} from "@/truth-engine";

export const STRATEGY_SCHEMA_VERSION = "truth_engine_v1";

export const PHASE1_SYMBOLS = [...SUPPORTED_SYMBOLS] as const;
export const PHASE1_TIMEFRAMES = [...SUPPORTED_TIMEFRAMES] as const;

const INDICATORS = [
  "rsi",
  "sma",
  "ema",
  "macd",
  "bollinger",
  "volume",
  "price",
] as const;

const OPERATORS = [
  "<",
  "<=",
  ">",
  ">=",
  "==",
  "cross_above",
  "cross_below",
] as const;

/** Recursive Rule JSON Schema matching Truth Engine indicatorRuleSchema / group. */
const ruleSchemaJson: Record<string, unknown> = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "indicator", "operator", "value"],
      properties: {
        type: { type: "string", enum: ["indicator"] },
        indicator: { type: "string", enum: [...INDICATORS] },
        timeframe: { type: "string" },
        period: { type: "integer", minimum: 1 },
        field: { type: "string" },
        operator: { type: "string", enum: [...OPERATORS] },
        value: {
          oneOf: [
            { type: "number" },
            {
              type: "object",
              additionalProperties: false,
              required: ["indicator"],
              properties: {
                indicator: { type: "string", enum: [...INDICATORS] },
                period: { type: "integer", minimum: 1 },
                field: { type: "string" },
              },
            },
          ],
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "op", "rules"],
      properties: {
        type: { type: "string", enum: ["group"] },
        op: { type: "string", enum: ["and", "or"] },
        rules: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/definitions/rule" },
        },
      },
    },
  ],
};

export const SUBMIT_EXECUTABLE_STRATEGY_TOOL = {
  name: "submit_executable_strategy",
  description:
    "Submit a Phase 1 Truth Engine executable trading strategy. " +
    "Use ONLY structured IndicatorRule / group trees. " +
    "NEVER use prose (e.g. 'oversold', 'MACD bullish'). " +
    "Every entry MUST include an explicit direction (long or short). " +
    "Dual-direction strategies MUST use two separate entries. " +
    "Direction must NEVER be inferred from indicators.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: [
      "name",
      "description",
      "symbol",
      "timeframe",
      "market_type",
      "entries",
      "stop_loss_percent",
      "risk_per_trade_pct",
      "leverage",
    ],
    definitions: {
      rule: ruleSchemaJson,
    },
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      symbol: {
        type: "string",
        enum: [...PHASE1_SYMBOLS],
      },
      timeframe: {
        type: "string",
        enum: [...PHASE1_TIMEFRAMES],
      },
      market_type: { type: "string", enum: ["spot", "futures"] },
      entries: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["direction", "condition"],
          properties: {
            direction: { type: "string", enum: ["long", "short"] },
            condition: { $ref: "#/definitions/rule" },
          },
        },
      },
      exit_condition: {
        description:
          "Optional strategy-exit Rule tree (not SL/TP). Omit or null if unused.",
        oneOf: [{ type: "null" }, { $ref: "#/definitions/rule" }],
      },
      stop_loss_percent: {
        type: "number",
        exclusiveMinimum: 0,
        description: "Positive stop-loss percent (e.g. 2 means 2%).",
      },
      take_profit_percent: {
        type: "number",
        exclusiveMinimum: 0,
        description: "Optional positive take-profit percent.",
      },
      risk_per_trade_pct: {
        type: "number",
        exclusiveMinimum: 0,
        maximum: 100,
        description: "Percent of equity risked per trade (e.g. 1 = 1%).",
      },
      leverage: {
        type: "number",
        exclusiveMinimum: 0,
        description: "Must be 1 for spot. Futures may use leverage > 1.",
      },
    },
  },
};

export interface ClaudeExecutableStrategy {
  name: string;
  description?: string;
  symbol: string;
  timeframe: string;
  market_type: "spot" | "futures";
  entries: Array<{
    direction: "long" | "short";
    condition: unknown;
  }>;
  exit_condition?: unknown | null;
  stop_loss_percent: number;
  take_profit_percent?: number;
  risk_per_trade_pct: number;
  leverage: number;
}

export interface PersistedStrategyRules {
  entry_rules: Record<string, unknown>;
  exit_rules: Record<string, unknown>;
}

/**
 * Map Claude tool output into Supabase JSONB fields that buildStrategyDefinition reads.
 * Preserves risk/leverage explicitly so Truth Engine does not silently default them.
 */
export function toPersistedRules(
  generated: ClaudeExecutableStrategy
): PersistedStrategyRules {
  const risk = Number(generated.risk_per_trade_pct);
  const leverage = Number(generated.leverage);
  const stopLoss = Math.abs(Number(generated.stop_loss_percent));
  const takeProfit =
    generated.take_profit_percent != null
      ? Math.abs(Number(generated.take_profit_percent))
      : undefined;

  const entry_rules: Record<string, unknown> = {
    schema_version: STRATEGY_SCHEMA_VERSION,
    entries: generated.entries,
    risk_per_trade_pct: risk,
    leverage,
  };

  const exit_rules: Record<string, unknown> = {
    stop_loss_percent: stopLoss,
    risk_per_trade_pct: risk,
    leverage,
  };

  if (takeProfit != null && takeProfit > 0) {
    exit_rules.take_profit_percent = takeProfit;
  }

  if (
    generated.exit_condition != null &&
    typeof generated.exit_condition === "object"
  ) {
    exit_rules.condition = generated.exit_condition;
  }

  return { entry_rules, exit_rules };
}

export function validateGeneratedStrategyForSave(params: {
  id?: string;
  name: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  entry_rules: unknown;
  exit_rules: unknown;
  leverage?: number;
}): ReturnType<typeof buildStrategyDefinition> {
  assertSupportedMarket(params.symbol, params.timeframe);
  return buildStrategyDefinition({
    id: params.id || "pending-generation",
    name: params.name,
    symbol: params.symbol,
    timeframe: params.timeframe,
    market_type: params.market_type,
    entry_rules: params.entry_rules,
    exit_rules: params.exit_rules,
    leverage: params.leverage,
    version: 1,
  });
}

/** Returns true when stored rules are Truth Engine executable (no guessing). */
export function isExecutableStrategyRules(
  strategy: {
    id?: string;
    name?: string;
    symbol?: string;
    timeframe?: string;
    market_type?: string;
    entry_rules?: unknown;
    exit_rules?: unknown;
  }
): boolean {
  try {
    if (!strategy.symbol || !strategy.timeframe || !strategy.name) return false;
    validateGeneratedStrategyForSave({
      id: strategy.id || "check",
      name: strategy.name,
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      market_type: strategy.market_type || "spot",
      entry_rules: strategy.entry_rules,
      exit_rules: strategy.exit_rules,
    });
    return true;
  } catch (err) {
    if (err instanceof StrategyValidationError) return false;
    return false;
  }
}

export function buildGenerationSystemPrompt(): string {
  return [
    "You are the Bitiq Lab Phase 1 strategy compiler.",
    "You MUST call the submit_executable_strategy tool with a fully executable strategy.",
    "Rules must be structured IndicatorRule or group trees only.",
    "Supported indicators: rsi, sma, ema, macd, bollinger, volume, price.",
    "Supported operators: <, <=, >, >=, ==, cross_above, cross_below.",
    "MACD: use indicator=macd with field line|signal|histogram.",
    "Bollinger: use indicator=bollinger with field upper|middle|lower, or compare price to {indicator:bollinger, field, period}.",
    "Price vs MA: use indicator=price field=close operator with value {indicator:sma|ema, period}.",
    "Every entry requires explicit direction long or short. Never infer direction from RSI/MACD.",
    "Dual long+short requires TWO separate entries.",
    "stop_loss_percent must be a positive number. Spot leverage must be 1.",
    "Symbols limited to BTCUSDT, ETHUSDT, SOLUSDT. Timeframes limited to 15m, 1h, 4h.",
    "FAIL LOUDLY rather than inventing thresholds or translating prose.",
  ].join(" ");
}

export function buildGenerationUserPrompt(config: {
  prompt: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  leverage?: number;
}): string {
  return [
    "Generate an executable trading strategy for:",
    `Symbol: ${config.symbol}`,
    `Timeframe: ${config.timeframe}`,
    `Market Type: ${config.market_type}`,
    `Default leverage hint: ${config.leverage ?? (config.market_type === "futures" ? 2 : 1)}`,
    "",
    `User Request: ${config.prompt}`,
    "",
    "Call submit_executable_strategy now with structured entries only.",
  ].join("\n");
}

export function buildCorrectionUserPrompt(params: {
  previous: unknown;
  validationError: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  originalPrompt: string;
}): string {
  return [
    "Your previous submit_executable_strategy input failed Truth Engine validation.",
    "Do NOT invent missing meaning. Fix only what the error requires using structured rules.",
    `Validation error: ${params.validationError}`,
    `Symbol: ${params.symbol}`,
    `Timeframe: ${params.timeframe}`,
    `Market Type: ${params.market_type}`,
    `Original user request: ${params.originalPrompt}`,
    `Previous invalid payload: ${JSON.stringify(params.previous)}`,
    "Call submit_executable_strategy again with a corrected executable strategy.",
  ].join("\n");
}
