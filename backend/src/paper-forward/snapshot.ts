/**
 * Frozen snapshot is the ONLY execution authority for Phase 4B.
 * Never reload strategies.entry_rules / exit_rules for paper fills.
 */

import {
  buildStrategyDefinition,
  StrategyValidationError,
} from "@/truth-engine/strategy-schema";
import type { StrategyDefinition } from "@/truth-engine/types";
import {
  hashStrategyRules,
  sha256Hex,
  stableStringify,
} from "@/research-engine/experiment-id";
import type { StrategySnapshot } from "@/research-engine/types";
import type { PaperForwardSession } from "./types";

export class PaperSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaperSnapshotError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function hashFrozenSnapshot(snapshot: unknown): string {
  const rec = asRecord(snapshot);
  if (!rec) {
    throw new PaperSnapshotError("strategy_snapshot is missing or not an object");
  }
  // Hash the same fields Phase 3 used (entry_rules/exit_rules). Do not
  // substitute live strategy columns or rename keys — that would drift the hash.
  const forHash: StrategySnapshot = {
    id: String(rec.id ?? ""),
    name: String(rec.name ?? ""),
    symbol: String(rec.symbol ?? ""),
    timeframe: String(rec.timeframe ?? ""),
    market_type: String(rec.market_type ?? ""),
    entry_rules: rec.entry_rules,
    exit_rules: rec.exit_rules,
    version: Number(rec.version ?? 0),
  };
  return hashStrategyRules(forHash);
}

/**
 * Verify the frozen session snapshot is intact and is execution authority.
 * Does not read live strategies.entry_rules.
 */
export function verifyImmutableSnapshot(session: PaperForwardSession): {
  computedHash: string;
  strategy: StrategyDefinition;
  commissionPct: number;
  slippagePct: number;
} {
  if (!session.snapshot_hash || !String(session.snapshot_hash).trim()) {
    throw new PaperSnapshotError("Session missing snapshot_hash provenance");
  }
  if (session.strategy_snapshot == null) {
    throw new PaperSnapshotError("Session missing strategy_snapshot");
  }
  if (!session.strategy_version_id) {
    throw new PaperSnapshotError("Session missing strategy_version_id provenance");
  }
  if (!session.symbol || !session.timeframe) {
    throw new PaperSnapshotError("Session missing frozen symbol/timeframe");
  }

  let computedHash: string;
  try {
    computedHash = hashFrozenSnapshot(session.strategy_snapshot);
  } catch (err) {
    throw new PaperSnapshotError(
      err instanceof Error ? err.message : "Failed to hash frozen snapshot"
    );
  }

  const stored = String(session.snapshot_hash);
  if (computedHash !== stored) {
    // Tolerate full-document hashes used by non-research version writers.
    const alt = sha256Hex(stableStringify(session.strategy_snapshot));
    if (alt !== stored) {
      throw new PaperSnapshotError(
        `Snapshot hash mismatch (corrupt or mutated frozen snapshot). stored=${stored} computed=${computedHash}`
      );
    }
  }

  const rec = asRecord(session.strategy_snapshot) || {};
  try {
    const strategy = buildStrategyDefinition({
      id: String(rec.id || session.strategy_id),
      name: String(rec.name || "paper-forward-frozen"),
      symbol: session.symbol,
      timeframe: session.timeframe,
      market_type: String(rec.market_type ?? rec.marketType ?? "spot"),
      entry_rules: rec.entry_rules ?? rec.entries,
      exit_rules: rec.exit_rules,
      version: session.strategy_version,
      leverage:
        typeof rec.leverage === "number" ? rec.leverage : undefined,
    });

    const exitObj = asRecord(rec.exit_rules) || {};
    const feesObj = asRecord(rec.fees) || asRecord(strategy.fees) || {};
    const commissionPct =
      typeof feesObj.commissionPct === "number"
        ? Number(feesObj.commissionPct)
        : typeof exitObj.commission_pct === "number"
          ? Number(exitObj.commission_pct)
          : 0.05;
    const slippagePct =
      typeof feesObj.slippagePct === "number"
        ? Number(feesObj.slippagePct)
        : typeof exitObj.slippage_pct === "number"
          ? Number(exitObj.slippage_pct)
          : 0.02;

    if (!(commissionPct >= 0) || !(slippagePct >= 0)) {
      throw new PaperSnapshotError("Frozen fee/slippage values are invalid");
    }

    return { computedHash: stored, strategy, commissionPct, slippagePct };
  } catch (err) {
    if (err instanceof PaperSnapshotError) throw err;
    const message =
      err instanceof StrategyValidationError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Frozen snapshot is not an executable Truth Engine strategy";
    throw new PaperSnapshotError(message);
  }
}
