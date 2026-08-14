import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { enrichCandidate } from "../enrich";
import { evaluateFreshness, isReadyForAiReview } from "../freshness";
import { getFreshnessTtlMs } from "../config";
import {
  TOKEN,
  NOW_MS,
  fixtureProviders,
  okLiq,
  okMarket,
  okOi,
  okFunding,
  okMacro,
  okSentiment,
  okMicro,
  okTaker,
  okLs,
  unavailableLiq,
  seedCandidate,
} from "./helpers";
import type { IntelligenceSnapshot } from "../types";

function baseSnap(over: Partial<IntelligenceSnapshot> = {}): IntelligenceSnapshot {
  const now = NOW_MS;
  return {
    candidate_id: "c",
    strategy_id: "s",
    strategy_version_id: "v",
    snapshot_hash: "h",
    symbol: "BTCUSDT",
    timeframe: "1h",
    direction: "LONG",
    signal_candle_ts: new Date(now).toISOString(),
    market_type: "futures",
    market: okMarket(now),
    derivatives: {
      open_interest: okOi(now),
      funding: okFunding(now),
      long_short_ratio: okLs(now),
      liquidations: okLiq(now),
      liquidation_clusters: {
        above: [],
        below: [],
        fetched_at: null,
        availability: "UNAVAILABLE_PLAN",
      },
      taker_flow: okTaker(now),
      exchange_flows: {
        net_flow_usd: null,
        fetched_at: null,
        availability: "UNAVAILABLE_PLAN",
      },
      exchange_balances: {
        net_flow_usd: null,
        fetched_at: null,
        availability: "UNAVAILABLE_PLAN",
      },
    },
    microstructure: okMicro(now),
    sentiment: okSentiment(now),
    macro: okMacro(now),
    freshness: {
      market_ok: true,
      oi_ok: true,
      funding_ok: true,
      liquidations_ok: true,
      macro_ok: true,
      stale_fields: [],
      missing_critical: [],
    },
    provider_status: {
      binance: "OK",
      coinapi: "UNAVAILABLE",
      coinglass: "PARTIAL",
      macro: "OK",
      sentiment: "OK",
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
    fetched_at: new Date(now).toISOString(),
    ...over,
  };
}

describe("B. Freshness", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("freshness TTLs are configurable (not hardcoded-only)", () => {
    process.env.ENRICHMENT_TTL_MARKET_MS = "15000";
    expect(getFreshnessTtlMs().market).toBe(15_000);
    delete process.env.ENRICHMENT_TTL_MARKET_MS;
    expect(getFreshnessTtlMs().market).toBe(30_000);
    expect(getFreshnessTtlMs().oi).toBe(120_000);
    expect(getFreshnessTtlMs().funding).toBe(300_000);
    expect(getFreshnessTtlMs().liquidations).toBe(120_000);
    expect(getFreshnessTtlMs().macro).toBe(1_800_000);
    expect(getFreshnessTtlMs().sentiment).toBe(86_400_000);
  });

  it("fresh market is accepted", () => {
    const report = evaluateFreshness(baseSnap({ market_type: "spot" }), NOW_MS);
    expect(report.market_ok).toBe(true);
    expect(isReadyForAiReview(report)).toBe(true);
  });

  it("stale price is rejected from READY_FOR_AI_REVIEW", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        market: okMarket(NOW_MS, 45_000),
      }),
    });
    expect(result.status).not.toBe("READY_FOR_AI_REVIEW");
    expect(result.status).toBe("ENRICHMENT_PARTIAL");
    expect(result.snapshot.freshness.market_ok).toBe(false);
    expect(result.snapshot.freshness.stale_fields).toContain("market.price");
  });

  it("stale OI for futures blocks readiness", async () => {
    const { deps, candidate } = await seedCandidate({ futures: true });
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        liquidations: okLiq(),
        oi: okOi(NOW_MS, 3 * 60_000),
      }),
    });
    expect(result.snapshot.market_type).toBe("futures");
    expect(result.snapshot.freshness.oi_ok).toBe(false);
    expect(result.status).toBe("ENRICHMENT_PARTIAL");
  });

  it("stale funding for futures blocks readiness", async () => {
    const { deps, candidate } = await seedCandidate({ futures: true });
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        liquidations: okLiq(),
        funding: okFunding(NOW_MS, 6 * 60_000),
      }),
    });
    expect(result.snapshot.freshness.funding_ok).toBe(false);
    expect(result.status).not.toBe("READY_FOR_AI_REVIEW");
  });

  it("Fear & Greed within 24h TTL does not block readiness", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        sentiment: okSentiment(NOW_MS, 12 * 60 * 60_000),
      }),
    });
    expect(result.status).toBe("READY_FOR_AI_REVIEW");
    expect(result.snapshot.freshness.stale_fields).not.toContain("sentiment.fear_greed");
  });

  it("Fear & Greed older than 24h is marked stale but does not block", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        sentiment: okSentiment(NOW_MS, 36 * 60 * 60_000),
      }),
    });
    expect(result.snapshot.freshness.stale_fields).toContain("sentiment.fear_greed");
    expect(result.status).toBe("READY_FOR_AI_REVIEW");
  });

  it("stale macro marks not-ready (critical)", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        macro: okMacro(NOW_MS, 45 * 60_000),
      }),
    });
    expect(result.snapshot.freshness.macro_ok).toBe(false);
    expect(result.status).toBe("ENRICHMENT_PARTIAL");
  });

  it("unavailable liquidations on futures blocks readiness", async () => {
    const { deps, candidate } = await seedCandidate({ futures: true });
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ liquidations: unavailableLiq() }),
    });
    expect(result.snapshot.freshness.liquidations_ok).toBe(false);
    expect(result.snapshot.freshness.missing_critical).toContain("derivatives.liquidations");
    expect(result.status).toBe("ENRICHMENT_PARTIAL");
  });
});
