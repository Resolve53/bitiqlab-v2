import { loadFrozenVersionAuthority } from "@/tradingview-pipeline/authority";
import type { AuthorityDeps } from "@/tradingview-pipeline/authority";
import type { FrozenVersionAuthority } from "@/tradingview-pipeline/types";
import { EnrichmentError } from "./errors";
import { ENRICHABLE_FROM_STATUSES } from "./types";
import type { TradingViewCandidateRow } from "@/tradingview-pipeline/types";

export async function revalidateCandidateAuthority(
  deps: AuthorityDeps,
  candidate: TradingViewCandidateRow
): Promise<FrozenVersionAuthority> {
  if (!candidate) {
    throw new EnrichmentError("candidate not found", "CANDIDATE_MISSING", 404);
  }
  const status = String(candidate.status);
  if (!(ENRICHABLE_FROM_STATUSES as readonly string[]).includes(status) && status !== "READY_FOR_ENRICHMENT") {
    throw new EnrichmentError(
      `candidate status ${status} cannot be enriched`,
      "WRONG_STATUS",
      409
    );
  }
  if (status === "RECEIVED" || status === "INVALID") {
    throw new EnrichmentError(
      `candidate status ${status} is not READY_FOR_ENRICHMENT`,
      "WRONG_STATUS",
      409
    );
  }

  try {
    const authority = await loadFrozenVersionAuthority(deps, {
      strategy_id: candidate.strategy_id,
      strategy_version_id: candidate.strategy_version_id,
      snapshot_hash: candidate.snapshot_hash,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
    });
    if (authority.snapshotHash !== candidate.snapshot_hash) {
      throw new EnrichmentError(
        "snapshot hash mismatch against frozen strategy version",
        "PROVENANCE_INVALID",
        400
      );
    }
    return authority;
  } catch (err) {
    if (err instanceof EnrichmentError) throw err;
    throw new EnrichmentError(
      err instanceof Error ? err.message : "provenance revalidation failed",
      "PROVENANCE_INVALID",
      400
    );
  }
}
