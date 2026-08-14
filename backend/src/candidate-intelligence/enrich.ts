/**
 * Stage 2: enrichCandidate(candidateId)
 * DATA + deterministic score only. No AI decision. No execution.
 */

import type { AuthorityDeps } from "@/tradingview-pipeline/authority";
import type { TradingViewCandidateRow } from "@/tradingview-pipeline/types";
import { ENRICHABLE_FROM_STATUSES, ENRICHMENT_ENGINE } from "./types";
import type {
  EnrichCandidateResult,
  EnrichmentObservability,
  EnrichmentRunStatus,
  IntelligenceSnapshot,
  ProviderCallStat,
} from "./types";
import { EnrichmentError, EnrichmentPersistenceError } from "./errors";
import { revalidateCandidateAuthority } from "./provenance";
import { fetchBinanceMarket } from "./providers/binance-market";
import { fetchBinanceDerivatives } from "./providers/binance-derivatives";
import { fetchCoinGlassOverlay } from "./providers/coinglass";
import { fetchCoinApiMarket } from "./providers/coinapi";
import { fetchSentiment } from "./providers/sentiment";
import { fetchMacro } from "./providers/macro";
import { finalizeSnapshot, statusFromSnapshot } from "./assemble";
import { isoNow } from "./providers/http";

export interface IntelligencePersistence {
  getTradingViewCandidateById: (id: string) => Promise<TradingViewCandidateRow | null>;
  getTradingViewCandidateByCandidateId: (
    candidateId: string
  ) => Promise<TradingViewCandidateRow | null>;
  updateTradingViewCandidateStatus: (
    id: string,
    status: string
  ) => Promise<TradingViewCandidateRow>;
  nextIntelligenceVersion: (candidateId: string) => Promise<number>;
  insertIntelligenceSnapshot: (row: {
    candidate_id: string;
    candidate_row_id: string;
    strategy_id: string;
    strategy_version_id: string;
    snapshot_hash: string;
    enrichment_version: number;
    symbol: string;
    timeframe: string;
    direction: string;
    market_type: string;
    market_data: unknown;
    derivatives_data: unknown;
    microstructure_data: unknown;
    sentiment_data: unknown;
    macro_data: unknown;
    freshness: unknown;
    provider_status: unknown;
    score_breakdown: unknown;
    quality_score: string;
    status: string;
    observability: unknown;
    intelligence: unknown;
    fetched_at: string;
  }) => Promise<{ id: string; enrichment_version: number }>;
}

export interface EnrichmentProviders {
  fetchBinanceMarket: typeof fetchBinanceMarket;
  fetchBinanceDerivatives: typeof fetchBinanceDerivatives;
  fetchCoinGlassOverlay: typeof fetchCoinGlassOverlay;
  fetchCoinApiMarket: typeof fetchCoinApiMarket;
  fetchSentiment: typeof fetchSentiment;
  fetchMacro: typeof fetchMacro;
}

const defaultProviders: EnrichmentProviders = {
  fetchBinanceMarket,
  fetchBinanceDerivatives,
  fetchCoinGlassOverlay,
  fetchCoinApiMarket,
  fetchSentiment,
  fetchMacro,
};

async function loadCandidate(
  db: IntelligencePersistence,
  id: string
): Promise<TradingViewCandidateRow> {
  const row =
    (await db.getTradingViewCandidateById(id)) ||
    (await db.getTradingViewCandidateByCandidateId(id));
  if (!row) {
    throw new EnrichmentError("candidate not found", "CANDIDATE_MISSING", 404);
  }
  if (!(ENRICHABLE_FROM_STATUSES as readonly string[]).includes(row.status)) {
    throw new EnrichmentError(
      `candidate status ${row.status} cannot be enriched`,
      "WRONG_STATUS",
      409
    );
  }
  return row;
}

export async function enrichCandidate(
  deps: AuthorityDeps & IntelligencePersistence,
  candidateId: string,
  opts?: {
    nowMs?: number;
    providers?: Partial<EnrichmentProviders>;
  }
): Promise<EnrichCandidateResult> {
  const nowMs = opts?.nowMs ?? Date.now();
  const providers: EnrichmentProviders = {
    ...defaultProviders,
    ...opts?.providers,
  };
  const t0 = Date.now();

  const candidate = await loadCandidate(deps, candidateId);
  const authority = await revalidateCandidateAuthority(deps, candidate);
  const marketType = authority.strategy.marketType === "futures" ? "futures" : "spot";

  try {
    await deps.updateTradingViewCandidateStatus(candidate.id, "ENRICHING");
  } catch (err) {
    throw new EnrichmentPersistenceError(
      err instanceof Error ? err.message : "failed to mark ENRICHING"
    );
  }

  let snapshot: IntelligenceSnapshot;
  let status: EnrichmentRunStatus;
  let calls: ProviderCallStat[] = [];
  try {
    const [binanceMkt, binanceDeriv, glass, coinapi, sentiment, macro] =
      await Promise.all([
        providers.fetchBinanceMarket({
          symbol: candidate.symbol,
          timeframe: candidate.timeframe,
          marketType,
        }),
        providers.fetchBinanceDerivatives(candidate.symbol, candidate.timeframe),
        providers.fetchCoinGlassOverlay(candidate.symbol),
        providers.fetchCoinApiMarket({
          symbol: candidate.symbol,
          marketType,
        }),
        providers.fetchSentiment(),
        providers.fetchMacro(candidate.symbol, nowMs),
      ]);

    calls = [
      ...binanceMkt.stats,
      ...binanceDeriv.stats,
      ...glass.stats,
      ...coinapi.stats,
      sentiment.stat,
      macro.stat,
    ];

    let market = binanceMkt.market;
    let microstructure = binanceMkt.microstructure;
    if (coinapi.market?.price != null && market.price == null) {
      market = {
        ...market,
        price: coinapi.market.price,
        fetched_at: coinapi.market.fetched_at ?? market.fetched_at,
        availability: "OK",
        source: "coinapi",
      };
    }
    if (
      coinapi.microstructure?.orderbook_imbalance != null &&
      microstructure.orderbook_imbalance == null
    ) {
      microstructure = {
        ...microstructure,
        ...coinapi.microstructure,
        availability: "OK",
      };
    }

    const liquidations = glass.liquidations ?? binanceDeriv.liquidations;

    const draft: Omit<IntelligenceSnapshot, "freshness" | "score"> = {
      candidate_id: candidate.candidate_id,
      strategy_id: candidate.strategy_id,
      strategy_version_id: candidate.strategy_version_id,
      snapshot_hash: candidate.snapshot_hash,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      direction: candidate.direction,
      signal_candle_ts: String(candidate.signal_candle_ts),
      market_type: marketType,
      market,
      derivatives: {
        open_interest: binanceDeriv.open_interest,
        funding: binanceDeriv.funding,
        long_short_ratio: binanceDeriv.long_short_ratio,
        liquidations,
        liquidation_clusters: glass.liquidation_clusters,
        taker_flow: binanceDeriv.taker_flow,
        exchange_flows: glass.exchange_flows,
        exchange_balances: glass.exchange_balances,
      },
      microstructure,
      sentiment: sentiment.sentiment,
      macro: macro.macro,
      provider_status: {
        binance:
          market.availability === "OK"
            ? binanceDeriv.open_interest.availability === "OK" || marketType === "spot"
              ? "OK"
              : "PARTIAL"
            : "FAILED",
        coinapi: coinapi.health,
        coinglass: glass.health,
        macro: macro.stat.ok ? "OK" : "FAILED",
        sentiment: sentiment.stat.ok ? "OK" : "UNAVAILABLE",
      },
      fetched_at: isoNow(nowMs),
    };

    snapshot = finalizeSnapshot(draft, nowMs);
    status = statusFromSnapshot(snapshot);
  } catch (err) {
    try {
      await deps.updateTradingViewCandidateStatus(candidate.id, "ENRICHMENT_FAILED");
    } catch {
      /* still fail closed */
    }
    if (err instanceof EnrichmentError) throw err;
    throw new EnrichmentError(
      err instanceof Error ? err.message : "enrichment assemble failed",
      "ENRICHMENT_ASSEMBLE_FAILED",
      500
    );
  }

  const observability: EnrichmentObservability = {
    total_latency_ms: Date.now() - t0,
    calls,
    engine: ENRICHMENT_ENGINE,
  };

  let version: number;
  try {
    version = await deps.nextIntelligenceVersion(candidate.candidate_id);
    await deps.insertIntelligenceSnapshot({
      candidate_id: candidate.candidate_id,
      candidate_row_id: candidate.id,
      strategy_id: candidate.strategy_id,
      strategy_version_id: candidate.strategy_version_id,
      snapshot_hash: candidate.snapshot_hash,
      enrichment_version: version,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      direction: candidate.direction,
      market_type: marketType,
      market_data: snapshot.market,
      derivatives_data: snapshot.derivatives,
      microstructure_data: snapshot.microstructure,
      sentiment_data: snapshot.sentiment,
      macro_data: snapshot.macro,
      freshness: snapshot.freshness,
      provider_status: snapshot.provider_status,
      score_breakdown: snapshot.score,
      quality_score: snapshot.score.grade,
      status,
      observability,
      intelligence: snapshot,
      fetched_at: snapshot.fetched_at,
    });
    await deps.updateTradingViewCandidateStatus(candidate.id, status);
  } catch (err) {
    try {
      await deps.updateTradingViewCandidateStatus(candidate.id, "ENRICHMENT_FAILED");
    } catch {
      /* still fail closed */
    }
    throw new EnrichmentPersistenceError(
      err instanceof Error ? err.message : "failed to persist intelligence snapshot"
    );
  }

  return {
    candidate_id: candidate.candidate_id,
    enrichment_version: version,
    status,
    snapshot,
    observability,
  };
}
