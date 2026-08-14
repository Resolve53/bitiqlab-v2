export const ENRICHMENT_ENGINE = "candidate_intelligence_v1";

export const ENRICHMENT_STATUSES = [
  "ENRICHING",
  "READY_FOR_AI_REVIEW",
  "ENRICHMENT_PARTIAL",
  "ENRICHMENT_FAILED",
] as const;

export type EnrichmentRunStatus = (typeof ENRICHMENT_STATUSES)[number];

export type ProviderHealth = "OK" | "PARTIAL" | "FAILED" | "UNAVAILABLE";

export type MetricAvailability =
  | "OK"
  | "UNAVAILABLE"
  | "UNAVAILABLE_PLAN"
  | "STALE"
  | "MALFORMED";

export type MacroRiskFlag =
  | "HIGH_IMPACT_EVENT_SOON"
  | "HIGH_IMPACT_EVENT_ELEVATED"
  | "HIGH_IMPACT_EVENT_WARNING"
  | "MEDIUM_IMPACT_EVENT_SOON"
  | "NO_MAJOR_EVENT";

export interface TimedValue<T> {
  value: T | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface OpenInterestBlock {
  value: number | null;
  delta_pct: number | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface FundingBlock {
  value: number | null;
  trend: string | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface LongShortBlock {
  global: number | null;
  top_traders: number | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface LiquidationsBlock {
  long_usd: number | null;
  short_usd: number | null;
  window: string | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface LiquidationClustersBlock {
  above: Array<{ price: number; usd: number }>;
  below: Array<{ price: number; usd: number }>;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface TakerFlowBlock {
  buy: number | null;
  sell: number | null;
  cvd: number | null;
  bias: "BUY" | "SELL" | "NEUTRAL" | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface ExchangeFlowsBlock {
  net_flow_usd: number | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface MarketBlock {
  price: number | null;
  spread_pct: number | null;
  volume: number | null;
  atr: number | null;
  volatility_ratio: number | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface MicrostructureBlock {
  orderbook_imbalance: number | null;
  bid_depth: number | null;
  ask_depth: number | null;
  spot_perp_basis: number | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface SentimentBlock {
  fear_greed: number | null;
  label: string | null;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface MacroEvent {
  name: string;
  country: string;
  event_time: string;
  importance: "low" | "medium" | "high";
  minutes_until: number | null;
  affected_symbols: string[];
}

export interface MacroBlock {
  next_high_impact_event: {
    name: string;
    country: string;
    event_time: string;
    minutes_until: number | null;
  } | null;
  events_48h: MacroEvent[];
  risk_flag: MacroRiskFlag;
  fetched_at: string | null;
  availability: MetricAvailability;
  source?: string;
  detail?: string;
}

export interface FreshnessReport {
  market_ok: boolean;
  oi_ok: boolean;
  funding_ok: boolean;
  liquidations_ok: boolean;
  macro_ok: boolean;
  stale_fields: string[];
  missing_critical: string[];
}

export interface ProviderStatusMap {
  coinglass: ProviderHealth;
  coinapi: ProviderHealth;
  binance: ProviderHealth;
  macro: ProviderHealth;
  sentiment: ProviderHealth;
}

export interface ScoreBreakdown {
  trend_alignment: number;
  liquidity_edge: number;
  positioning: number;
  orderbook_support: number;
  event_risk: number;
  data_quality: number;
  raw_score: number;
  grade: string;
}

export interface ProviderCallStat {
  provider: string;
  ok: boolean;
  latency_ms: number;
  retries: number;
  error_code?: string;
  error?: string;
}

export interface EnrichmentObservability {
  total_latency_ms: number;
  calls: ProviderCallStat[];
  engine: string;
}

export interface IntelligenceSnapshot {
  candidate_id: string;
  strategy_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  symbol: string;
  timeframe: string;
  direction: "LONG" | "SHORT";
  signal_candle_ts: string;
  market_type: "spot" | "futures";
  market: MarketBlock;
  derivatives: {
    open_interest: OpenInterestBlock;
    funding: FundingBlock;
    long_short_ratio: LongShortBlock;
    liquidations: LiquidationsBlock;
    liquidation_clusters: LiquidationClustersBlock;
    taker_flow: TakerFlowBlock;
    exchange_flows: ExchangeFlowsBlock;
    exchange_balances: ExchangeFlowsBlock;
  };
  microstructure: MicrostructureBlock;
  sentiment: SentimentBlock;
  macro: MacroBlock;
  freshness: FreshnessReport;
  provider_status: ProviderStatusMap;
  score: ScoreBreakdown;
  fetched_at: string;
}

export interface EnrichCandidateResult {
  candidate_id: string;
  enrichment_version: number;
  status: EnrichmentRunStatus;
  snapshot: IntelligenceSnapshot;
  observability: EnrichmentObservability;
}

export const ENRICHABLE_FROM_STATUSES = [
  "READY_FOR_ENRICHMENT",
  "ENRICHING",
  "ENRICHMENT_PARTIAL",
  "ENRICHMENT_FAILED",
  "READY_FOR_AI_REVIEW",
] as const;
