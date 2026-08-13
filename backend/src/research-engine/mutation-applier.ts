/**
 * Apply exactly one structured mutation to a strategy snapshot.
 * Deep-clones; never mutates the parent.
 */

import type { StrategySnapshot, StructuredMutation } from "./types";
import {
  ALLOWED_MUTATION_TYPES,
  SUPPORTED_INDICATORS,
} from "./mutation-schema";

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Parse paths like entry_rules.entries[0].condition.value */
export function parsePath(path: string): string[] {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  return normalized.split(".").filter(Boolean);
}

export function getAtPath(root: unknown, path: string): unknown {
  const parts = parsePath(path);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function setAtPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = parsePath(path);
  if (parts.length === 0) throw new Error("Empty mutation path");
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (next == null || typeof next !== "object") {
      throw new Error(`Invalid mutation path at ${parts.slice(0, i + 1).join(".")}`);
    }
    cur = next as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function assertNoForbiddenChanges(
  parent: StrategySnapshot,
  candidate: StrategySnapshot
): void {
  if (candidate.symbol !== parent.symbol) {
    throw new Error("Mutation must not change symbol");
  }
  if (candidate.timeframe !== parent.timeframe) {
    throw new Error("Mutation must not change timeframe");
  }
  // Direction: compare all entry directions
  const parentEntries = extractEntries(parent.entry_rules);
  const candEntries = extractEntries(candidate.entry_rules);
  if (parentEntries.length === candEntries.length) {
    for (let i = 0; i < parentEntries.length; i++) {
      if (parentEntries[i].direction !== candEntries[i].direction) {
        throw new Error("Mutation must not change direction");
      }
    }
  }
}

function extractEntries(
  entryRules: unknown
): Array<{ direction?: string; condition?: unknown }> {
  if (!entryRules || typeof entryRules !== "object") return [];
  const er = entryRules as Record<string, unknown>;
  if (Array.isArray(er.entries)) {
    return er.entries as Array<{ direction?: string; condition?: unknown }>;
  }
  if (er.direction || er.condition) {
    return [er as { direction?: string; condition?: unknown }];
  }
  return [];
}

function assertSupportedCondition(node: unknown): void {
  if (!node || typeof node !== "object") {
    throw new Error("Condition must be an object");
  }
  const n = node as Record<string, unknown>;
  if (n.type === "indicator") {
    if (
      typeof n.indicator !== "string" ||
      !(SUPPORTED_INDICATORS as readonly string[]).includes(n.indicator)
    ) {
      throw new Error(`Unsupported indicator: ${String(n.indicator)}`);
    }
    return;
  }
  if (n.type === "group" && Array.isArray(n.rules)) {
    for (const r of n.rules) assertSupportedCondition(r);
    return;
  }
  throw new Error("Unsupported condition node type");
}

function countChangedLeaves(
  a: unknown,
  b: unknown,
  path = ""
): string[] {
  if (valuesEqual(a, b)) return [];
  if (
    a == null ||
    b == null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return [path || "$"];
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  const keys = new Set([...ak, ...bk]);
  const changed: string[] = [];
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    const av = (a as Record<string, unknown>)[k];
    const bv = (b as Record<string, unknown>)[k];
    if (!valuesEqual(av, bv)) {
      if (
        av != null &&
        bv != null &&
        typeof av === "object" &&
        typeof bv === "object"
      ) {
        changed.push(...countChangedLeaves(av, bv, p));
      } else {
        changed.push(p);
      }
    }
  }
  return changed;
}

/**
 * Apply one mutation. Returns a new snapshot (parent unchanged).
 */
export function applyMutation(
  parent: StrategySnapshot,
  mutation: StructuredMutation
): StrategySnapshot {
  if (!ALLOWED_MUTATION_TYPES.includes(mutation.mutation_type)) {
    throw new Error(`Forbidden mutation_type: ${mutation.mutation_type}`);
  }

  const candidate: StrategySnapshot = {
    ...deepClone(parent),
    entry_rules: deepClone(parent.entry_rules),
    exit_rules: deepClone(parent.exit_rules),
  };

  const root = {
    entry_rules: candidate.entry_rules as Record<string, unknown>,
    exit_rules: candidate.exit_rules as Record<string, unknown>,
  };

  // Normalize path to start with entry_rules. or exit_rules.
  let path = mutation.path;
  if (
    !path.startsWith("entry_rules") &&
    !path.startsWith("exit_rules")
  ) {
    // Convenience: bare exit field names
    if (
      ["stop_loss_percent", "take_profit_percent", "risk_per_trade_pct"].includes(
        path
      )
    ) {
      path = `exit_rules.${path}`;
    } else {
      path = `entry_rules.${path}`;
    }
  }

  const current = getAtPath(root, path);

  switch (mutation.mutation_type) {
    case "indicator_period":
    case "indicator_threshold":
    case "stop_loss_percent":
    case "take_profit_percent":
    case "risk_percent":
    case "group_op": {
      if (current === undefined) {
        throw new Error(`Invalid mutation path: ${path} does not exist`);
      }
      if (!valuesEqual(current, mutation.old_value)) {
        throw new Error(
          `old_value mismatch at ${path}: expected ${JSON.stringify(
            mutation.old_value
          )}, found ${JSON.stringify(current)}`
        );
      }
      if (mutation.mutation_type === "group_op") {
        if (mutation.new_value !== "and" && mutation.new_value !== "or") {
          throw new Error("group_op new_value must be and|or");
        }
      }
      if (
        mutation.mutation_type === "indicator_period" &&
        (typeof mutation.new_value !== "number" ||
          !Number.isFinite(mutation.new_value) ||
          mutation.new_value < 2)
      ) {
        throw new Error("indicator_period must be a number >= 2");
      }
      if (
        (mutation.mutation_type === "stop_loss_percent" ||
          mutation.mutation_type === "take_profit_percent" ||
          mutation.mutation_type === "risk_percent") &&
        (typeof mutation.new_value !== "number" ||
          !Number.isFinite(mutation.new_value) ||
          mutation.new_value <= 0)
      ) {
        throw new Error(`${mutation.mutation_type} must be a positive number`);
      }
      setAtPath(root, path, mutation.new_value);
      // Mirror risk on entry_rules when mutating risk
      if (
        mutation.mutation_type === "risk_percent" &&
        path.includes("risk_per_trade_pct")
      ) {
        if (
          root.entry_rules &&
          typeof root.entry_rules === "object" &&
          "risk_per_trade_pct" in root.entry_rules
        ) {
          (root.entry_rules as Record<string, unknown>).risk_per_trade_pct =
            mutation.new_value;
        }
        if (
          root.exit_rules &&
          typeof root.exit_rules === "object"
        ) {
          (root.exit_rules as Record<string, unknown>).risk_per_trade_pct =
            mutation.new_value;
        }
      }
      break;
    }
    case "add_condition": {
      assertSupportedCondition(mutation.condition ?? mutation.new_value);
      const parentNode = getAtPath(root, path);
      if (
        !parentNode ||
        typeof parentNode !== "object" ||
        (parentNode as { type?: string }).type !== "group" ||
        !Array.isArray((parentNode as { rules?: unknown[] }).rules)
      ) {
        throw new Error(
          "add_condition path must point to a group node with rules[]"
        );
      }
      const group = parentNode as { rules: unknown[] };
      const beforeLen = group.rules.length;
      group.rules = [
        ...group.rules,
        deepClone(mutation.condition ?? mutation.new_value),
      ];
      if (group.rules.length !== beforeLen + 1) {
        throw new Error("add_condition failed to append exactly one rule");
      }
      break;
    }
    case "remove_condition": {
      // path points to rules[i]
      const parts = parsePath(path);
      const idxStr = parts[parts.length - 1];
      const idx = Number(idxStr);
      if (!Number.isInteger(idx)) {
        throw new Error("remove_condition path must end with rules array index");
      }
      const parentPath = parts.slice(0, -1).join(".");
      const arr = getAtPath(root, parentPath);
      if (!Array.isArray(arr)) {
        throw new Error("remove_condition parent must be an array");
      }
      if (!valuesEqual(arr[idx], mutation.old_value) && mutation.old_value != null) {
        // Allow old_value to be the removed node
        if (!valuesEqual(arr[idx], mutation.old_value)) {
          throw new Error(`old_value mismatch for remove_condition at ${path}`);
        }
      }
      if (arr.length <= 1) {
        throw new Error("Cannot remove the last condition from a group");
      }
      arr.splice(idx, 1);
      break;
    }
    default:
      throw new Error(`Unhandled mutation_type`);
  }

  candidate.entry_rules = root.entry_rules;
  candidate.exit_rules = root.exit_rules;

  assertNoForbiddenChanges(parent, candidate);

  // Enforce single atomic change on JSON (allow risk mirror as same logical change)
  const parentCanon = {
    entry_rules: parent.entry_rules,
    exit_rules: parent.exit_rules,
  };
  const candCanon = {
    entry_rules: candidate.entry_rules,
    exit_rules: candidate.exit_rules,
  };
  const changed = countChangedLeaves(parentCanon, candCanon);
  // risk_percent may touch both entry and exit — treat as one logical mutation if only those
  const logical = changed.filter(
    (p) =>
      !(
        mutation.mutation_type === "risk_percent" &&
        p.endsWith("risk_per_trade_pct")
      )
  );
  const riskTouches = changed.filter((p) => p.endsWith("risk_per_trade_pct"));
  if (mutation.mutation_type === "risk_percent") {
    if (logical.length > 0 || riskTouches.length === 0) {
      // ok if only risk fields changed
      if (logical.length > 0) {
        throw new Error(
          `Mutation changed unexpected fields: ${changed.join(", ")}`
        );
      }
    }
  } else if (mutation.mutation_type === "add_condition") {
    // array length change — allow multiple leaf diffs under new node
    if (changed.length === 0) {
      throw new Error("add_condition produced no change");
    }
  } else if (mutation.mutation_type === "remove_condition") {
    if (changed.length === 0) {
      throw new Error("remove_condition produced no change");
    }
  } else {
    // Numeric / group_op: expect a small number of leaf changes (usually 1)
    if (changed.length === 0) {
      throw new Error("Mutation produced no change");
    }
    if (changed.length > 3) {
      throw new Error(
        `Mutation appears non-atomic (${changed.length} fields changed): ${changed.join(
          ", "
        )}`
      );
    }
  }

  return candidate;
}

export function assertParentUnchanged(
  before: StrategySnapshot,
  after: StrategySnapshot
): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Parent strategy was mutated during research — aborting");
  }
}
