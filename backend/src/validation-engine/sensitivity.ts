/**
 * Controlled nearby parameter variants for robustness (not optimization).
 * Deep-clones strategy rules; never mutates the original.
 */

import type { ValidationConfig } from "./config";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface ParameterMutation {
  parameterPath: string;
  originalValue: number;
  testedValue: number;
  strategy: {
    entry_rules: unknown;
    exit_rules: unknown;
  };
}

function setPath(obj: Record<string, unknown>, path: string[], value: number) {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = cur[key];
    if (next == null || typeof next !== "object") return false;
    cur = next as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
  return true;
}

function collectIndicatorMutations(
  node: unknown,
  basePath: string[],
  config: ValidationConfig,
  out: Array<{ path: string[]; original: number; tested: number }>
): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (obj.type === "indicator") {
    if (typeof obj.period === "number" && Number.isFinite(obj.period)) {
      for (const d of config.periodDeltas) {
        const next = obj.period + d;
        if (next >= 2) {
          out.push({
            path: [...basePath, "period"],
            original: obj.period,
            tested: next,
          });
        }
      }
    }
    if (typeof obj.value === "number" && Number.isFinite(obj.value)) {
      // RSI-style thresholds and similar numeric comparisons
      const deltas =
        obj.indicator === "rsi" ? config.rsiValueDeltas : config.rsiValueDeltas;
      for (const d of deltas) {
        out.push({
          path: [...basePath, "value"],
          original: obj.value,
          tested: obj.value + d,
        });
      }
    }
  }

  if (obj.type === "group" && Array.isArray(obj.rules)) {
    obj.rules.forEach((rule, i) =>
      collectIndicatorMutations(rule, [...basePath, "rules", String(i)], config, out)
    );
  }
}

/**
 * Build a limited set of nearby strategy variants from structured entry/exit rules.
 */
export function buildSensitivityVariants(
  entryRules: unknown,
  exitRules: unknown,
  config: ValidationConfig
): ParameterMutation[] {
  const mutations: ParameterMutation[] = [];
  const seen = new Set<string>();

  const add = (
    path: string,
    original: number,
    tested: number,
    entry: unknown,
    exit: unknown
  ) => {
    const key = `${path}=${tested}`;
    if (seen.has(key)) return;
    if (tested === original) return;
    seen.add(key);
    mutations.push({
      parameterPath: path,
      originalValue: original,
      testedValue: tested,
      strategy: { entry_rules: entry, exit_rules: exit },
    });
  };

  // Entry tree mutations
  const entryObj = deepClone(entryRules) as Record<string, unknown> | null;
  if (entryObj && typeof entryObj === "object") {
    const collected: Array<{ path: string[]; original: number; tested: number }> =
      [];
    if (Array.isArray(entryObj.entries)) {
      entryObj.entries.forEach((e, i) => {
        const entry = e as { condition?: unknown };
        collectIndicatorMutations(
          entry?.condition,
          ["entries", String(i), "condition"],
          config,
          collected
        );
      });
    } else if (entryObj.condition) {
      collectIndicatorMutations(entryObj.condition, ["condition"], config, collected);
    }

    for (const c of collected) {
      const clone = deepClone(entryRules) as Record<string, unknown>;
      setPath(clone, c.path, c.tested);
      add(c.path.join("."), c.original, c.tested, clone, deepClone(exitRules));
    }
  }

  // Exit / risk numeric fields
  const exitObj = (exitRules && typeof exitRules === "object"
    ? deepClone(exitRules)
    : {}) as Record<string, unknown>;

  const exitFields: Array<{
    key: string;
    deltas: readonly number[];
    min: number;
  }> = [
    { key: "stop_loss_percent", deltas: config.stopLossPctDeltas, min: 0.1 },
    { key: "take_profit_percent", deltas: config.takeProfitPctDeltas, min: 0.1 },
    { key: "risk_per_trade_pct", deltas: config.riskPctDeltas, min: 0.1 },
  ];

  for (const field of exitFields) {
    const original = exitObj[field.key];
    if (typeof original !== "number" || !Number.isFinite(original)) continue;
    for (const d of field.deltas) {
      const tested = original + d;
      if (tested < field.min) continue;
      const exitClone = deepClone(exitObj);
      exitClone[field.key] = tested;
      // Keep risk mirrored on entry when present
      const entryClone = deepClone(entryRules) as Record<string, unknown> | null;
      if (
        field.key === "risk_per_trade_pct" &&
        entryClone &&
        typeof entryClone === "object"
      ) {
        entryClone.risk_per_trade_pct = tested;
      }
      add(field.key, original, tested, entryClone, exitClone);
    }
  }

  // Cap variants to keep Phase 2 bounded (robustness, not search)
  return mutations.slice(0, 24);
}

export function assertOriginalUnchanged(
  originalEntry: unknown,
  originalExit: unknown,
  entrySnapshot: unknown,
  exitSnapshot: unknown
): void {
  if (JSON.stringify(originalEntry) !== JSON.stringify(entrySnapshot)) {
    throw new Error("Sensitivity mutated original entry_rules");
  }
  if (JSON.stringify(originalExit) !== JSON.stringify(exitSnapshot)) {
    throw new Error("Sensitivity mutated original exit_rules");
  }
}
