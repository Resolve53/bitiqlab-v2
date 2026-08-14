import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { enrichCandidate } from "../enrich";
import { fetchCoinGlassOverlay } from "../providers/coinglass";
import { fetchCoinApiMarket } from "../providers/coinapi";
import { calcAtr } from "../providers/binance-market";
import { finiteOrNull } from "../providers/http";
import {
  TOKEN,
  NOW_MS,
  fixtureProviders,
  okLiq,
  okMarket,
  unavailableMacro,
  seedCandidate,
} from "./helpers";

describe("C. Provider failures", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
    delete process.env.COINGLASS_API_KEY;
    delete process.env.COINAPI_KEY;
    delete process.env.COINAPI_API_KEY;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("CoinGlass without key is UNAVAILABLE_PLAN for heatmap/flows (not fabricated)", async () => {
    const overlay = await fetchCoinGlassOverlay("BTCUSDT");
    expect(overlay.health).toBe("UNAVAILABLE");
    expect(overlay.liquidations).toBeNull();
    expect(overlay.liquidation_clusters.availability).toBe("UNAVAILABLE_PLAN");
    expect(overlay.exchange_flows.availability).toBe("UNAVAILABLE_PLAN");
    expect(overlay.exchange_balances.availability).toBe("UNAVAILABLE_PLAN");
    expect(overlay.exchange_flows.net_flow_usd).toBeNull();
    expect(overlay.liquidation_clusters.above).toEqual([]);
  });

  it("CoinAPI without key is UNAVAILABLE (Binance still fills market)", async () => {
    const overlay = await fetchCoinApiMarket({ symbol: "BTCUSDT", marketType: "spot" });
    expect(overlay.health).toBe("UNAVAILABLE");
    expect(overlay.market).toBeNull();
    expect(overlay.microstructure).toBeNull();
  });

  it("CoinGlass partial (heatmap plan-blocked, liquidations present) is recorded", async () => {
    const { deps, candidate } = await seedCandidate({ futures: true });
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        liquidations: okLiq(),
        glassHealth: "PARTIAL",
      }),
    });
    expect(result.snapshot.provider_status.coinglass).toBe("PARTIAL");
    expect(result.snapshot.derivatives.liquidation_clusters.availability).toBe(
      "UNAVAILABLE_PLAN"
    );
    expect(result.snapshot.derivatives.liquidations.availability).toBe("OK");
    expect(result.status).toBe("READY_FOR_AI_REVIEW");
  });

  it("CoinAPI partial does not invent market zeros", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ coinapiHealth: "PARTIAL" }),
    });
    expect(result.snapshot.provider_status.coinapi).toBe("PARTIAL");
    expect(result.snapshot.market.price).toBe(64000);
    expect(result.snapshot.market.price).not.toBe(0);
  });

  it("macro failure is critical and not READY_FOR_AI_REVIEW", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ macro: unavailableMacro() }),
    });
    expect(result.snapshot.provider_status.macro).toBe("FAILED");
    expect(result.snapshot.freshness.macro_ok).toBe(false);
    expect(result.snapshot.freshness.missing_critical).toContain("macro");
    expect(result.status).toBe("ENRICHMENT_PARTIAL");
  });

  it("optional metric missing still allows spot READY_FOR_AI_REVIEW", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        taker: {
          buy: null,
          sell: null,
          cvd: null,
          bias: null,
          fetched_at: null,
          availability: "UNAVAILABLE",
          source: "binance",
        },
      }),
    });
    expect(result.snapshot.derivatives.taker_flow.availability).toBe("UNAVAILABLE");
    expect(result.snapshot.derivatives.taker_flow.cvd).toBeNull();
    expect(result.status).toBe("READY_FOR_AI_REVIEW");
    expect(result.snapshot.score.data_quality).toBeLessThan(10);
  });

  it("critical market missing fails closed (ENRICHMENT_FAILED)", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        market: {
          price: null,
          spread_pct: null,
          volume: null,
          atr: null,
          volatility_ratio: null,
          fetched_at: null,
          availability: "UNAVAILABLE",
          source: "binance",
          detail: "ticker missing",
        },
      }),
    });
    expect(result.status).toBe("ENRICHMENT_FAILED");
    expect(result.snapshot.freshness.market_ok).toBe(false);
    expect(result.snapshot.market.price).toBeNull();
  });

  it("malformed market values are not replaced with zeros", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({
        market: {
          ...okMarket(),
          price: null,
          availability: "MALFORMED",
          fetched_at: null,
          detail: "non-numeric ticker",
        },
      }),
    });
    expect(result.snapshot.market.price).toBeNull();
    expect(result.snapshot.market.availability).toBe("MALFORMED");
    expect(result.status).not.toBe("READY_FOR_AI_REVIEW");
  });

  it("finiteOrNull refuses NaN/Infinity rather than inventing zero", () => {
    expect(finiteOrNull(NaN)).toBeNull();
    expect(finiteOrNull(Infinity)).toBeNull();
    expect(finiteOrNull("not-a-number")).toBeNull();
    expect(finiteOrNull("0")).toBe(0);
  });

  it("calcAtr is deterministic and returns null without enough bars", () => {
    expect(calcAtr([])).toBeNull();
    const bars = Array.from({ length: 20 }, (_, i) => ({
      high: 100 + i,
      low: 90 + i,
      close: 95 + i,
    }));
    const a = calcAtr(bars);
    const b = calcAtr(bars);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
