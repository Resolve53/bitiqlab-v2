/**
 * Deterministic hashing and experiment IDs.
 */

import { createHash } from "crypto";
import type { StrategySnapshot, StructuredMutation } from "./types";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Canonical executable rules hash (entry+exit only). */
export function hashStrategyRules(snapshot: StrategySnapshot): string {
  return sha256Hex(
    stableStringify({
      symbol: snapshot.symbol,
      timeframe: snapshot.timeframe,
      market_type: snapshot.market_type,
      entry_rules: snapshot.entry_rules,
      exit_rules: snapshot.exit_rules,
    })
  );
}

export function hashBars(
  bars: Array<{ timestamp: Date; open: number; high: number; low: number; close: number; volume: number }>
): string {
  // Sample endpoints + length for speed; include first/last OHLC for integrity
  if (bars.length === 0) return sha256Hex("empty");
  const first = bars[0];
  const last = bars[bars.length - 1];
  const mid = bars[Math.floor(bars.length / 2)];
  return sha256Hex(
    stableStringify({
      n: bars.length,
      first: {
        t: first.timestamp.toISOString(),
        o: first.open,
        h: first.high,
        l: first.low,
        c: first.close,
        v: first.volume,
      },
      mid: {
        t: mid.timestamp.toISOString(),
        c: mid.close,
      },
      last: {
        t: last.timestamp.toISOString(),
        o: last.open,
        h: last.high,
        l: last.low,
        c: last.close,
        v: last.volume,
      },
    })
  );
}

export function buildExperimentId(params: {
  researchRunId: string;
  generation: number;
  parentSnapshotHash: string;
  candidateSnapshotHash: string;
  mutation: StructuredMutation | null;
}): string {
  return sha256Hex(
    stableStringify({
      run: params.researchRunId,
      gen: params.generation,
      parent: params.parentSnapshotHash,
      candidate: params.candidateSnapshotHash,
      mutation: params.mutation
        ? {
            type: params.mutation.mutation_type,
            path: params.mutation.path,
            old: params.mutation.old_value,
            new: params.mutation.new_value,
          }
        : null,
    })
  ).slice(0, 32);
}

export function buildResearchRunId(params: {
  strategyId: string;
  seriesHash: string;
  startingVersion: number;
  configHash: string;
  startedAtIso?: string;
}): string {
  // Include startedAt when provided so concurrent runs differ; tests may omit for stability
  return (
    "rr_" +
    sha256Hex(
      stableStringify({
        strategyId: params.strategyId,
        seriesHash: params.seriesHash,
        startingVersion: params.startingVersion,
        configHash: params.configHash,
        startedAt: params.startedAtIso ?? null,
      })
    ).slice(0, 24)
  );
}
