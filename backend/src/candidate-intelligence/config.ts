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
  // TAKER_FLOW is the spec name; TAKER is the Stage 2 env that already shipped.
  const takerDefault = envMs("ENRICHMENT_TTL_TAKER_MS", 2 * 60_000);
  return {
    market: envMs("ENRICHMENT_TTL_MARKET_MS", 30_000),
    orderbook: envMs("ENRICHMENT_TTL_ORDERBOOK_MS", 30_000),
    oi: envMs("ENRICHMENT_TTL_OI_MS", 2 * 60_000),
    funding: envMs("ENRICHMENT_TTL_FUNDING_MS", 5 * 60_000),
    liquidations: envMs("ENRICHMENT_TTL_LIQUIDATIONS_MS", 2 * 60_000),
    takerFlow: envMs("ENRICHMENT_TTL_TAKER_FLOW_MS", takerDefault),
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

export const ENRICHMENT_WORKER_VERSION = "candidate_intelligence_worker_v1";

function defaultWorkerId(): string {
  const host = process.env.HOSTNAME || "local";
  return `enrichment-${host}-${process.pid}`;
}

export function getEnrichmentWorkerConfig() {
  const concurrency = envInt("ENRICHMENT_WORKER_CONCURRENCY", 1);
  return {
    pollMs: envMs("ENRICHMENT_WORKER_POLL_MS", 5_000),
    batchSize: Math.max(1, envInt("ENRICHMENT_WORKER_BATCH_SIZE", 3)),
    concurrency: Math.max(1, concurrency || 1),
    maxAttempts: Math.max(1, envInt("ENRICHMENT_MAX_ATTEMPTS", 5)),
    retryBaseMs: envMs("ENRICHMENT_RETRY_BASE_MS", 5_000),
    retryMaxMs: envMs("ENRICHMENT_RETRY_MAX_MS", 15 * 60_000),
    staleLockMs: envMs("ENRICHMENT_STALE_LOCK_MS", 5 * 60_000),
    heartbeatStaleMs: envMs("ENRICHMENT_HEARTBEAT_STALE_MS", 30_000),
    workerId: process.env.ENRICHMENT_WORKER_ID?.trim() || defaultWorkerId(),
    workerVersion: ENRICHMENT_WORKER_VERSION,
    listenHttp: process.env.ENRICHMENT_WORKER_HTTP !== "false",
  };
}
