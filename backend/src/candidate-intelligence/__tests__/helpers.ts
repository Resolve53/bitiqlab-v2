import { ingestTradingViewCandidate } from "@/tradingview-pipeline";
import {
  TOKEN,
  authorityDeps,
  longFrozen,
  frozenFromGenerated,
  memoryCandidates,
  validPayload,
  validLongStrategy,
} from "@/tradingview-pipeline/__tests__/helpers";
import type { TradingViewCandidateRow } from "@/tradingview-pipeline/types";
import type { CandidateStatus } from "@/tradingview-pipeline/constants";
import type { IntelligencePersistence, EnrichmentProviders } from "../enrich";
import { createMemoryClaimLock, claimEligibleCandidatesInMemory } from "../claim";
import type { WorkerHeartbeatRow, WorkerPersistence } from "../worker";
import type {
  FundingBlock,
  LiquidationClustersBlock,
  LiquidationsBlock,
  LongShortBlock,
  MacroBlock,
  MarketBlock,
  MicrostructureBlock,
  OpenInterestBlock,
  ProviderCallStat,
  SentimentBlock,
  TakerFlowBlock,
  ExchangeFlowsBlock,
} from "../types";

export { TOKEN, longFrozen, authorityDeps, validPayload };

export const NOW_MS = Date.parse("2026-08-14T12:30:00.000Z");

export function iso(nowMs = NOW_MS, ageMs = 0): string {
  return new Date(nowMs - ageMs).toISOString();
}

export function futuresFrozen() {
  return frozenFromGenerated(
    { ...validLongStrategy(), market_type: "futures", leverage: 3 },
    {
      strategyId: "aaaaaaaa-1111-1111-1111-111111111111",
      versionId: "bbbbbbbb-2222-2222-2222-222222222222",
      version: 4,
    }
  );
}

function stat(provider: string, ok = true): ProviderCallStat {
  return { provider, ok, latency_ms: 4, retries: 0 };
}

function unavailablePlanFlows(): ExchangeFlowsBlock {
  return {
    net_flow_usd: null,
    fetched_at: null,
    availability: "UNAVAILABLE_PLAN",
    source: "coinglass",
    detail: "exchange flows/balances not available on current CoinGlass plan",
  };
}

function unavailableClusters(): LiquidationClustersBlock {
  return {
    above: [],
    below: [],
    fetched_at: null,
    availability: "UNAVAILABLE_PLAN",
    source: "coinglass",
    detail: "liquidation heatmap UNAVAILABLE_PLAN",
  };
}

export function okMarket(nowMs = NOW_MS, ageMs = 0): MarketBlock {
  return {
    price: 64000,
    spread_pct: 0.01,
    volume: 1200,
    atr: 180,
    volatility_ratio: 180 / 64000,
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "binance",
  };
}

export function okMicro(nowMs = NOW_MS, ageMs = 0): MicrostructureBlock {
  return {
    orderbook_imbalance: 0.12,
    bid_depth: 2_500_000,
    ask_depth: 2_000_000,
    spot_perp_basis: 0.02,
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "binance",
  };
}

export function okOi(nowMs = NOW_MS, ageMs = 0): OpenInterestBlock {
  return {
    value: 12_000,
    delta_pct: 1.4,
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "binance",
  };
}

export function okFunding(nowMs = NOW_MS, ageMs = 0): FundingBlock {
  return {
    value: 0.01,
    trend: "positive",
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "binance",
  };
}

export function okLs(nowMs = NOW_MS, ageMs = 0): LongShortBlock {
  return {
    global: 0.92,
    top_traders: 0.88,
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "binance",
  };
}

export function okTaker(nowMs = NOW_MS, ageMs = 0): TakerFlowBlock {
  return {
    buy: 800,
    sell: 500,
    cvd: 300,
    bias: "BUY",
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "binance",
  };
}

export function unavailableLiq(): LiquidationsBlock {
  return {
    long_usd: null,
    short_usd: null,
    window: "24h",
    fetched_at: null,
    availability: "UNAVAILABLE",
    source: "binance",
    detail: "Binance public REST does not expose liquidation USD totals",
  };
}

export function okLiq(nowMs = NOW_MS, ageMs = 0): LiquidationsBlock {
  return {
    long_usd: 12_000_000,
    short_usd: 8_000_000,
    window: "24h",
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "coinglass",
  };
}

export function okSentiment(nowMs = NOW_MS, ageMs = 0): SentimentBlock {
  return {
    fear_greed: 42,
    label: "Fear",
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "alternative.me",
  };
}

export function okMacro(nowMs = NOW_MS, ageMs = 0): MacroBlock {
  return {
    next_high_impact_event: {
      name: "FOMC",
      country: "US",
      event_time: iso(nowMs, -4 * 60 * 60_000),
      minutes_until: 240,
    },
    events_48h: [
      {
        name: "FOMC",
        country: "US",
        event_time: iso(nowMs, -4 * 60 * 60_000),
        importance: "high",
        minutes_until: 240,
        affected_symbols: ["BTCUSDT"],
      },
    ],
    risk_flag: "HIGH_IMPACT_EVENT_WARNING",
    fetched_at: iso(nowMs, ageMs),
    availability: "OK",
    source: "alpha_vantage",
  };
}

export function unavailableMacro(): MacroBlock {
  return {
    next_high_impact_event: null,
    events_48h: [],
    risk_flag: "NO_MAJOR_EVENT",
    fetched_at: null,
    availability: "UNAVAILABLE",
    source: "alpha_vantage",
    detail: "calendar unavailable",
  };
}

export interface SnapshotRow {
  id: string;
  candidate_id: string;
  enrichment_version: number;
  status: string;
  intelligence: unknown;
  quality_score: string;
  score_breakdown: unknown;
  freshness: unknown;
  provider_status: unknown;
  fetched_at: string;
}

export function memoryIntelligence(
  store: ReturnType<typeof memoryCandidates>
): IntelligencePersistence & {
  rows: TradingViewCandidateRow[];
  snapshots: SnapshotRow[];
  failInsert?: boolean;
} {
  const snapshots: SnapshotRow[] = [];
  const api: IntelligencePersistence & {
    rows: TradingViewCandidateRow[];
    snapshots: SnapshotRow[];
    failInsert?: boolean;
  } = {
    rows: store.rows,
    snapshots,
    async getTradingViewCandidateById(id) {
      return store.getTradingViewCandidateById(id);
    },
    async getTradingViewCandidateByCandidateId(candidateId) {
      return store.getTradingViewCandidateByCandidateId(candidateId);
    },
    async updateTradingViewCandidateStatus(id, status) {
      const row = store.rows.find((r) => r.id === id);
      if (!row) throw new Error("candidate row missing");
      row.status = status as TradingViewCandidateRow["status"];
      return row;
    },
    async nextIntelligenceVersion(candidateId) {
      const max = snapshots
        .filter((s) => s.candidate_id === candidateId)
        .reduce((m, s) => Math.max(m, s.enrichment_version), 0);
      return max + 1;
    },
    async insertIntelligenceSnapshot(row) {
      if (api.failInsert) throw new Error("insertIntelligenceSnapshot failed");
      if (
        snapshots.some(
          (s) =>
            s.candidate_id === row.candidate_id &&
            s.enrichment_version === row.enrichment_version
        )
      ) {
        throw new Error("duplicate key value violates unique constraint");
      }
      const stored: SnapshotRow = {
        id: `snap-${snapshots.length + 1}`,
        candidate_id: row.candidate_id,
        enrichment_version: row.enrichment_version,
        status: row.status,
        intelligence: row.intelligence,
        quality_score: row.quality_score,
        score_breakdown: row.score_breakdown,
        freshness: row.freshness,
        provider_status: row.provider_status,
        fetched_at: row.fetched_at,
      };
      snapshots.push(stored);
      return { id: stored.id, enrichment_version: stored.enrichment_version };
    },
  };
  return api;
}

export function fixtureProviders(opts?: {
  nowMs?: number;
  marketAgeMs?: number;
  oiAgeMs?: number;
  fundingAgeMs?: number;
  liqAgeMs?: number;
  macroAgeMs?: number;
  sentimentAgeMs?: number;
  liquidations?: LiquidationsBlock;
  glassHealth?: "OK" | "PARTIAL" | "FAILED" | "UNAVAILABLE";
  coinapiHealth?: "OK" | "PARTIAL" | "FAILED" | "UNAVAILABLE";
  market?: MarketBlock;
  oi?: OpenInterestBlock;
  funding?: FundingBlock;
  taker?: TakerFlowBlock;
  ls?: LongShortBlock;
  macro?: MacroBlock;
  sentiment?: SentimentBlock;
  micro?: MicrostructureBlock;
}): Partial<EnrichmentProviders> {
  const nowMs = opts?.nowMs ?? NOW_MS;
  const liquidations = opts?.liquidations ?? unavailableLiq();
  const market = opts?.market ?? okMarket(nowMs, opts?.marketAgeMs ?? 0);
  return {
    async fetchBinanceMarket() {
      return {
        market,
        microstructure: opts?.micro ?? okMicro(nowMs),
        stats: [stat("binance_klines"), stat("binance_book_ticker")],
      };
    },
    async fetchBinanceDerivatives() {
      return {
        open_interest: opts?.oi ?? okOi(nowMs, opts?.oiAgeMs ?? 0),
        funding: opts?.funding ?? okFunding(nowMs, opts?.fundingAgeMs ?? 0),
        long_short_ratio: opts?.ls ?? okLs(nowMs),
        liquidations: unavailableLiq(),
        taker_flow: opts?.taker ?? okTaker(nowMs),
        stats: [stat("binance_oi"), stat("binance_funding")],
      };
    },
    async fetchCoinGlassOverlay() {
      const liq = liquidations.availability === "OK" ? liquidations : null;
      return {
        liquidations: liq,
        liquidation_clusters: unavailableClusters(),
        exchange_flows: unavailablePlanFlows(),
        exchange_balances: unavailablePlanFlows(),
        stats: [stat("coinglass", Boolean(liq))],
        health: opts?.glassHealth ?? (liq ? "PARTIAL" : "UNAVAILABLE"),
      };
    },
    async fetchCoinApiMarket() {
      return {
        market: null,
        microstructure: null,
        stats: [
          {
            provider: "coinapi",
            ok: false,
            latency_ms: 0,
            retries: 0,
            error_code: "NO_KEY",
            error: "COINAPI_KEY unset",
          },
        ],
        health: opts?.coinapiHealth ?? "UNAVAILABLE",
      };
    },
    async fetchSentiment() {
      const sentiment = opts?.sentiment ?? okSentiment(nowMs, opts?.sentimentAgeMs ?? 0);
      return {
        sentiment,
        stat: stat("sentiment", sentiment.availability === "OK"),
      };
    },
    async fetchMacro() {
      const macro = opts?.macro ?? okMacro(nowMs, opts?.macroAgeMs ?? 0);
      return {
        macro,
        stat: stat("macro", macro.availability === "OK"),
      };
    },
  };
}

export async function seedCandidate(opts?: {
  futures?: boolean;
  status?: CandidateStatus;
}) {
  process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
  const frozen = opts?.futures ? futuresFrozen() : longFrozen();
  const store = memoryCandidates();
  const ingested = await ingestTradingViewCandidate(
    { ...authorityDeps(frozen.row), ...store },
    {
      body: validPayload(frozen),
      query: { token: TOKEN },
      nowMs: NOW_MS,
    }
  );
  const intel = memoryIntelligence(store);
  if (opts?.status && opts.status !== ingested.candidate.status) {
    await intel.updateTradingViewCandidateStatus(ingested.candidate.id, opts.status);
  }
  const liveSpy = async () => {
    throw new Error("must not read live strategies during Stage 2");
  };
  return {
    frozen,
    store,
    intel,
    candidate: ingested.candidate,
    deps: {
      ...authorityDeps(frozen.row, liveSpy),
      ...intel,
    },
  };
}

export function memoryWorkerStore(
  intel: ReturnType<typeof memoryIntelligence>
): WorkerPersistence & {
  rows: TradingViewCandidateRow[];
  snapshots: SnapshotRow[];
  heartbeats: Map<string, WorkerHeartbeatRow>;
} {
  const lock = createMemoryClaimLock();
  const heartbeats = new Map<string, WorkerHeartbeatRow>();
  return {
    ...intel,
    heartbeats,
    async claimEnrichmentCandidates(opts) {
      return claimEligibleCandidatesInMemory(intel.rows, { ...opts, lock });
    },
    async updateEnrichmentOps(id, patch) {
      const row = intel.rows.find((r) => r.id === id);
      if (!row) throw new Error("candidate row missing");
      Object.assign(row, patch);
      if (patch.status) {
        row.status = patch.status as TradingViewCandidateRow["status"];
      }
      return row;
    },
    async getLatestIntelligenceSnapshot(candidateId) {
      const snaps = intel.snapshots
        .filter((s) => s.candidate_id === candidateId)
        .sort((a, b) => b.enrichment_version - a.enrichment_version);
      const latest = snaps[0];
      if (!latest) return null;
      return {
        status: latest.status,
        enrichment_version: latest.enrichment_version,
        fetched_at: latest.fetched_at,
        intelligence: latest.intelligence,
      };
    },
    async upsertEnrichmentWorkerHeartbeat(row) {
      heartbeats.set(row.worker_id, { ...row });
    },
    async listEnrichmentWorkerHeartbeats() {
      return [...heartbeats.values()];
    },
  };
}

export async function seedWorker(opts?: {
  futures?: boolean;
  status?: CandidateStatus;
}) {
  const seeded = await seedCandidate(opts);
  const worker = memoryWorkerStore(seeded.intel);
  return {
    ...seeded,
    worker,
    deps: {
      ...seeded.deps,
      ...worker,
    },
  };
}
