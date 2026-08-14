import { describe, expect, it } from "vitest";
import { scoreIntelligence } from "../score";
import { finalizeSnapshot } from "../assemble";
import {
  NOW_MS,
  okMarket,
  okMicro,
  okOi,
  okFunding,
  okLs,
  okTaker,
  okLiq,
  okSentiment,
  okMacro,
} from "./helpers";
import type { IntelligenceSnapshot } from "../types";

function draft(
  over: Partial<Omit<IntelligenceSnapshot, "freshness" | "score">> = {}
): Omit<IntelligenceSnapshot, "freshness" | "score"> {
  return {
    candidate_id: "c",
    strategy_id: "s",
    strategy_version_id: "v",
    snapshot_hash: "h",
    symbol: "BTCUSDT",
    timeframe: "1h",
    direction: "LONG",
    signal_candle_ts: new Date(NOW_MS).toISOString(),
    market_type: "spot",
    market: okMarket(),
    derivatives: {
      open_interest: okOi(),
      funding: okFunding(),
      long_short_ratio: okLs(),
      liquidations: okLiq(),
      liquidation_clusters: {
        above: [],
        below: [],
        fetched_at: null,
        availability: "UNAVAILABLE_PLAN",
      },
      taker_flow: okTaker(),
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
    microstructure: okMicro(),
    sentiment: okSentiment(),
    macro: okMacro(),
    provider_status: {
      binance: "OK",
      coinapi: "UNAVAILABLE",
      coinglass: "UNAVAILABLE",
      macro: "OK",
      sentiment: "OK",
    },
    fetched_at: new Date(NOW_MS).toISOString(),
    ...over,
  };
}

describe("F. Deterministic score", () => {
  it("same inputs produce the same result", () => {
    const a = finalizeSnapshot(draft(), NOW_MS);
    const b = finalizeSnapshot(draft(), NOW_MS);
    expect(a.score).toEqual(b.score);
    expect(scoreIntelligence(a)).toEqual(scoreIntelligence(b));
  });

  it("stores raw numeric score plus breakdown", () => {
    const snap = finalizeSnapshot(draft(), NOW_MS);
    expect(snap.score.trend_alignment).toBeGreaterThanOrEqual(0);
    expect(snap.score.liquidity_edge).toBeGreaterThanOrEqual(0);
    expect(snap.score.positioning).toBeGreaterThanOrEqual(0);
    expect(snap.score.orderbook_support).toBeGreaterThanOrEqual(0);
    expect(snap.score.event_risk).toBeGreaterThanOrEqual(0);
    expect(snap.score.data_quality).toBeGreaterThanOrEqual(0);
    expect(snap.score.raw_score).toBe(
      snap.score.trend_alignment +
        snap.score.liquidity_edge +
        snap.score.positioning +
        snap.score.orderbook_support +
        snap.score.event_risk +
        snap.score.data_quality
    );
    expect(snap.score.grade).toMatch(/^[A-F][+-]?$/);
  });

  it("missing optional fields reduce data_quality", () => {
    const full = finalizeSnapshot(draft(), NOW_MS);
    const missing = finalizeSnapshot(
      draft({
        derivatives: {
          ...draft().derivatives,
          taker_flow: {
            buy: null,
            sell: null,
            cvd: null,
            bias: null,
            fetched_at: null,
            availability: "UNAVAILABLE",
          },
          long_short_ratio: {
            global: null,
            top_traders: null,
            fetched_at: null,
            availability: "UNAVAILABLE",
          },
        },
        sentiment: {
          fear_greed: null,
          label: null,
          fetched_at: null,
          availability: "UNAVAILABLE",
        },
        microstructure: {
          orderbook_imbalance: null,
          bid_depth: null,
          ask_depth: null,
          spot_perp_basis: null,
          fetched_at: null,
          availability: "UNAVAILABLE",
        },
      }),
      NOW_MS
    );
    expect(missing.score.data_quality).toBeLessThan(full.score.data_quality);
  });

  it("HIGH_IMPACT_EVENT_SOON lowers event_risk vs NO_MAJOR_EVENT", () => {
    const calm = finalizeSnapshot(
      draft({
        macro: { ...okMacro(), risk_flag: "NO_MAJOR_EVENT" },
      }),
      NOW_MS
    );
    const soon = finalizeSnapshot(
      draft({
        macro: { ...okMacro(), risk_flag: "HIGH_IMPACT_EVENT_SOON" },
      }),
      NOW_MS
    );
    expect(soon.score.event_risk).toBeLessThan(calm.score.event_risk);
    expect(soon.score.event_risk).toBe(1);
  });

  it("is backend-computed (scoreIntelligence is a pure sync function)", () => {
    expect(scoreIntelligence.constructor.name).toBe("Function");
    const snap = finalizeSnapshot(draft(), NOW_MS);
    const scored = scoreIntelligence(snap);
    expect(scored.raw_score).toEqual(
      scored.trend_alignment +
        scored.liquidity_edge +
        scored.positioning +
        scored.orderbook_support +
        scored.event_risk +
        scored.data_quality
    );
  });
});
