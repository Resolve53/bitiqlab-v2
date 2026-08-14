import type {
  EnrichmentRunStatus,
  IntelligenceSnapshot,
  ProviderHealth,
  ProviderStatusMap,
} from "./types";
import { evaluateFreshness, isReadyForAiReview } from "./freshness";
import { scoreIntelligence } from "./score";

export function mergeProviderHealth(parts: {
  binanceOk: boolean;
  binancePartial: boolean;
  coinapi: ProviderHealth;
  coinglass: ProviderHealth;
  macro: ProviderHealth;
  sentiment: ProviderHealth;
}): ProviderStatusMap {
  return {
    binance: parts.binanceOk ? "OK" : parts.binancePartial ? "PARTIAL" : "FAILED",
    coinapi: parts.coinapi,
    coinglass: parts.coinglass,
    macro: parts.macro,
    sentiment: parts.sentiment,
  };
}

export function finalizeSnapshot(
  snap: Omit<IntelligenceSnapshot, "freshness" | "score">,
  nowMs = Date.now()
): IntelligenceSnapshot {
  const withFresh: IntelligenceSnapshot = {
    ...snap,
    freshness: {
      market_ok: false,
      oi_ok: false,
      funding_ok: false,
      liquidations_ok: false,
      macro_ok: false,
      stale_fields: [],
      missing_critical: [],
    },
    score: {
      trend_alignment: 0,
      liquidity_edge: 0,
      positioning: 0,
      orderbook_support: 0,
      event_risk: 0,
      data_quality: 0,
      raw_score: 0,
      grade: "F",
    },
  };
  withFresh.freshness = evaluateFreshness(withFresh, nowMs);
  try {
    withFresh.score = scoreIntelligence(withFresh);
  } catch (err) {
    throw new Error(
      `deterministic score engine failed: ${err instanceof Error ? err.message : "unknown"}`
    );
  }
  return withFresh;
}

export function statusFromSnapshot(snap: IntelligenceSnapshot): EnrichmentRunStatus {
  if (isReadyForAiReview(snap.freshness)) return "READY_FOR_AI_REVIEW";
  if (snap.freshness.missing_critical.includes("market.price") && !snap.freshness.market_ok) {
    if (snap.market.availability !== "OK") return "ENRICHMENT_FAILED";
  }
  if (!snap.freshness.market_ok && snap.market.availability !== "OK") {
    return "ENRICHMENT_FAILED";
  }
  return "ENRICHMENT_PARTIAL";
}
