/**
 * Stage 2 freshness / timeout config. Override via env; do not scatter magic numbers.
 */

function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getFreshnessTtlMs() {
  return {
    market: envMs("ENRICHMENT_TTL_MARKET_MS", 30_000),
    orderbook: envMs("ENRICHMENT_TTL_ORDERBOOK_MS", 30_000),
    oi: envMs("ENRICHMENT_TTL_OI_MS", 2 * 60_000),
    funding: envMs("ENRICHMENT_TTL_FUNDING_MS", 5 * 60_000),
    liquidations: envMs("ENRICHMENT_TTL_LIQUIDATIONS_MS", 2 * 60_000),
    takerFlow: envMs("ENRICHMENT_TTL_TAKER_MS", 2 * 60_000),
    macro: envMs("ENRICHMENT_TTL_MACRO_MS", 30 * 60_000),
    sentiment: envMs("ENRICHMENT_TTL_SENTIMENT_MS", 24 * 60 * 60_000),
  };
}

export function getEnrichmentHttpConfig() {
  return {
    timeoutMs: envMs("ENRICHMENT_HTTP_TIMEOUT_MS", 8_000),
    maxRetries: envInt("ENRICHMENT_HTTP_MAX_RETRIES", 2),
    retryBackoffMs: envMs("ENRICHMENT_HTTP_RETRY_BACKOFF_MS", 250),
  };
}

export const MACRO_SEVERE_MINUTES = envInt("ENRICHMENT_MACRO_SEVERE_MINUTES", 30);
export const MACRO_ELEVATED_MINUTES = envInt("ENRICHMENT_MACRO_ELEVATED_MINUTES", 60);
export const MACRO_WARNING_MINUTES = envInt("ENRICHMENT_MACRO_WARNING_MINUTES", 180);
