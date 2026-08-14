/**
 * Frozen strategy_versions row is the ONLY Pine authority.
 * Never read live strategies.entry_rules / exit_rules for Stage 1 Pine.
 */

import {
  buildStrategyDefinition,
  StrategyValidationError,
  assertSupportedMarket,
  SUPPORTED_SYMBOLS,
  SUPPORTED_TIMEFRAMES,
} from "@/truth-engine/strategy-schema";
import { hashFrozenSnapshot, PaperSnapshotError } from "@/paper-forward/snapshot";
import { sha256Hex, stableStringify } from "@/research-engine/experiment-id";
import {
  PineAuthorityError,
  SnapshotHashMismatchError,
} from "./errors";
import type { FrozenVersionAuthority, PineGenerateRequest } from "./types";

export interface VersionRow {
  id: string;
  strategy_id: string;
  version: number;
  strategy_snapshot: unknown;
  snapshot_hash: string;
}

export interface AuthorityDeps {
  getStrategyVersionById: (id: string) => Promise<VersionRow | null>;
  /** Intentionally unused. Present so tests can prove it is never called. */
  getStrategy?: (id: string) => Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function hashesMatch(stored: string, computed: string, snapshot: unknown): boolean {
  if (stored === computed) return true;
  // Same legacy tolerance as paper-forward frozen snapshots.
  return sha256Hex(stableStringify(snapshot)) === stored;
}

export async function loadFrozenVersionAuthority(
  deps: AuthorityDeps,
  request: PineGenerateRequest
): Promise<FrozenVersionAuthority> {
  const strategyId = String(request.strategy_id || "").trim();
  const versionId = String(request.strategy_version_id || "").trim();
  const providedHash = String(request.snapshot_hash || "").trim();

  if (!strategyId) {
    throw new PineAuthorityError("strategy_id is required", "VERSION_MISSING");
  }
  if (!versionId) {
    throw new PineAuthorityError(
      "strategy_version_id is required — Pine is generated only from an immutable Bitiq strategy version",
      "VERSION_MISSING"
    );
  }
  if (!providedHash) {
    throw new PineAuthorityError(
      "snapshot_hash is required — refuse to generate Pine without frozen provenance",
      "SNAPSHOT_MISSING"
    );
  }

  const version = await deps.getStrategyVersionById(versionId);
  if (!version) {
    throw new PineAuthorityError(
      `strategy_version_id ${versionId} not found`,
      "VERSION_MISSING"
    );
  }

  if (version.strategy_id !== strategyId) {
    throw new PineAuthorityError(
      `strategy_id ${strategyId} does not match version ${versionId} (owned by ${version.strategy_id})`,
      "STRATEGY_VERSION_MISMATCH"
    );
  }

  if (version.strategy_snapshot == null) {
    throw new PineAuthorityError(
      "strategy_versions.strategy_snapshot is missing",
      "SNAPSHOT_MISSING"
    );
  }

  let computedHash: string;
  try {
    computedHash = hashFrozenSnapshot(version.strategy_snapshot);
  } catch (err) {
    throw new PineAuthorityError(
      err instanceof PaperSnapshotError
        ? err.message
        : "Failed to hash frozen snapshot",
      "SNAPSHOT_MISSING"
    );
  }

  const storedHash = String(version.snapshot_hash || "").trim();
  if (!storedHash) {
    throw new PineAuthorityError(
      "strategy_versions.snapshot_hash is missing",
      "SNAPSHOT_MISSING"
    );
  }

  if (!hashesMatch(storedHash, computedHash, version.strategy_snapshot)) {
    throw new SnapshotHashMismatchError(
      `Stored snapshot_hash does not match recomputed hash for version ${versionId}`
    );
  }

  if (providedHash !== storedHash && providedHash !== computedHash) {
    throw new SnapshotHashMismatchError(
      `Provided snapshot_hash does not match frozen version ${versionId}`
    );
  }

  const rec = asRecord(version.strategy_snapshot) || {};
  const snapshotSymbol = String(rec.symbol || "").toUpperCase();
  const snapshotTimeframe = String(rec.timeframe || "");

  const symbol = String(request.symbol || snapshotSymbol || "").toUpperCase();
  const timeframe = String(request.timeframe || snapshotTimeframe || "");

  try {
    assertSupportedMarket(symbol, timeframe);
  } catch (err) {
    throw new PineAuthorityError(
      err instanceof Error ? err.message : "Unsupported symbol/timeframe",
      "UNSUPPORTED_MARKET"
    );
  }

  if (request.timeframe && request.timeframe !== snapshotTimeframe) {
    throw new PineAuthorityError(
      `Requested timeframe ${request.timeframe} does not match frozen snapshot timeframe ${snapshotTimeframe}`,
      "TIMEFRAME_MISMATCH"
    );
  }

  if (
    request.symbol &&
    snapshotSymbol &&
    request.symbol.toUpperCase() !== snapshotSymbol &&
    !(SUPPORTED_SYMBOLS as readonly string[]).includes(request.symbol.toUpperCase())
  ) {
    throw new PineAuthorityError(
      `Requested symbol ${request.symbol} is not in the allowed universe`,
      "UNSUPPORTED_MARKET"
    );
  }

  try {
    const strategy = buildStrategyDefinition({
      id: String(rec.id || strategyId),
      name: String(rec.name || "bitiq-frozen"),
      symbol: snapshotSymbol || symbol,
      timeframe: snapshotTimeframe || timeframe,
      market_type: String(rec.market_type ?? rec.marketType ?? "spot"),
      entry_rules: rec.entry_rules ?? rec.entries,
      exit_rules: rec.exit_rules,
      version: version.version,
      leverage: typeof rec.leverage === "number" ? rec.leverage : undefined,
    });

    return {
      strategyId,
      strategyVersionId: versionId,
      versionNumber: version.version,
      snapshotHash: storedHash,
      snapshot: rec,
      strategy: {
        ...strategy,
        symbol,
        entryTimeframe: timeframe,
      },
      symbol,
      timeframe,
    };
  } catch (err) {
    const message =
      err instanceof StrategyValidationError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Frozen snapshot is not an executable Truth Engine strategy";
    throw new PineAuthorityError(message, "SNAPSHOT_NOT_EXECUTABLE");
  }
}

export { SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES };
