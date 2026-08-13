/**
 * Phase 3 mutation schema — Claude tool + validation helpers.
 */

import type { MutationType, StructuredMutation } from "./types";

export const ALLOWED_MUTATION_TYPES: MutationType[] = [
  "indicator_period",
  "indicator_threshold",
  "stop_loss_percent",
  "take_profit_percent",
  "risk_percent",
  "group_op",
  "add_condition",
  "remove_condition",
];

export const SUPPORTED_INDICATORS = [
  "rsi",
  "sma",
  "ema",
  "macd",
  "bollinger",
  "volume",
  "price",
] as const;

export const SUPPORTED_OPERATORS = [
  "<",
  "<=",
  ">",
  ">=",
  "==",
  "cross_above",
  "cross_below",
] as const;

export const SUBMIT_STRATEGY_MUTATION_TOOL = {
  name: "submit_strategy_mutation",
  description:
    "Propose exactly ONE atomic mutation to improve a trading strategy. " +
    "Do NOT change direction, symbol, or timeframe. " +
    "Do NOT invent performance numbers. " +
    "Do NOT propose multiple changes. " +
    "old_value MUST match the parent strategy at path.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: [
      "mutation_type",
      "path",
      "old_value",
      "new_value",
      "hypothesis",
    ],
    properties: {
      mutation_type: {
        type: "string",
        enum: [...ALLOWED_MUTATION_TYPES],
      },
      path: {
        type: "string",
        description:
          "Dot/bracket path into entry_rules or exit_rules, e.g. entry_rules.entries[0].condition.value or exit_rules.stop_loss_percent",
      },
      old_value: {
        description: "Must equal the current value at path",
      },
      new_value: {
        description: "Replacement value (or null for remove_condition)",
      },
      hypothesis: {
        type: "string",
        minLength: 1,
        description: "Why this single change might improve VALIDATION robustness",
      },
      condition: {
        description:
          "Required for add_condition: a supported IndicatorRule or group node",
        type: "object",
      },
    },
  },
};

export function parseStructuredMutation(raw: unknown): StructuredMutation {
  if (!raw || typeof raw !== "object") {
    throw new Error("Mutation proposal was empty or not an object");
  }
  const obj = raw as Record<string, unknown>;
  const mutation_type = obj.mutation_type as MutationType;
  if (!ALLOWED_MUTATION_TYPES.includes(mutation_type)) {
    throw new Error(`Unsupported mutation_type: ${String(obj.mutation_type)}`);
  }
  if (typeof obj.path !== "string" || !obj.path.trim()) {
    throw new Error("Mutation path is required");
  }
  if (typeof obj.hypothesis !== "string" || !obj.hypothesis.trim()) {
    throw new Error("Mutation hypothesis is required");
  }
  if (!("old_value" in obj) || !("new_value" in obj)) {
    throw new Error("Mutation must include old_value and new_value");
  }
  return {
    mutation_type,
    path: obj.path.trim(),
    old_value: obj.old_value,
    new_value: obj.new_value,
    hypothesis: obj.hypothesis.trim(),
    condition: obj.condition,
  };
}

export function buildMutationSystemPrompt(): string {
  return [
    "You are the Bitiq Lab Phase 3 mutation proposer.",
    "You MUST call submit_strategy_mutation with exactly ONE atomic change.",
    "Never change direction, symbol, or timeframe.",
    "Never invent performance metrics or claim KEEP/REJECT.",
    `Supported indicators: ${SUPPORTED_INDICATORS.join(", ")}.`,
    `Supported operators: ${SUPPORTED_OPERATORS.join(", ")}.`,
    "Use TRAIN diagnostics only as context; VALIDATION selection is decided by code.",
    "Prefer small nearby numeric changes over rewrites.",
  ].join(" ");
}

export function buildMutationUserPrompt(params: {
  parentStrategy: unknown;
  trainDiagnostics: unknown;
  previousExperiments: unknown;
  allowedMutationTypes: MutationType[];
}): string {
  return [
    "Propose exactly ONE structured mutation for this parent strategy.",
    `Allowed mutation types: ${params.allowedMutationTypes.join(", ")}`,
    "",
    "PARENT STRATEGY (canonical):",
    JSON.stringify(params.parentStrategy),
    "",
    "TRAIN DIAGNOSTICS ONLY (segment=train — never TEST):",
    JSON.stringify(params.trainDiagnostics),
    "",
    "PREVIOUS EXPERIMENTS (avoid duplicates):",
    JSON.stringify(params.previousExperiments),
    "",
    "Call submit_strategy_mutation now.",
  ].join("\n");
}

export function buildMutationCorrectionPrompt(params: {
  previous: unknown;
  error: string;
  parentStrategy: unknown;
}): string {
  return [
    "Your previous submit_strategy_mutation failed validation.",
    `Error: ${params.error}`,
    "Fix the proposal. Still propose exactly ONE allowed mutation.",
    `Parent: ${JSON.stringify(params.parentStrategy)}`,
    `Previous invalid: ${JSON.stringify(params.previous)}`,
    "Call submit_strategy_mutation again.",
  ].join("\n");
}
