import { getFreshnessTtlMs } from "./config";
import type {
  FreshnessReport,
  IntelligenceSnapshot,
  MetricAvailability,
} from "./types";

function ageMs(fetchedAt: string | null, nowMs: number): number | null {
  if (!fetchedAt) return null;
  const t = new Date(fetchedAt).getTime();
  if (Number.isNaN(t)) return null;
  return nowMs - t;
}

function fresh(
  fetchedAt: string | null,
  availability: MetricAvailability,
  ttl: number,
  nowMs: number
): boolean {
  if (availability !== "OK") return false;
  const age = ageMs(fetchedAt, nowMs);
  if (age == null) return false;
  return age <= ttl;
}

export function evaluateFreshness(
  snap: Pick<
    IntelligenceSnapshot,
    "market" | "derivatives" | "microstructure" | "macro" | "sentiment" | "market_type"
  >,
  nowMs = Date.now()
): FreshnessReport {
  const ttl = getFreshnessTtlMs();
  const stale_fields: string[] = [];
  const missing_critical: string[] = [];
  const futures = snap.market_type === "futures";

  const market_ok = fresh(snap.market.fetched_at, snap.market.availability, ttl.market, nowMs);
  if (!market_ok) {
    if (snap.market.availability === "OK") stale_fields.push("market.price");
    else missing_critical.push("market.price");
  }

  const oi_ok = fresh(
    snap.derivatives.open_interest.fetched_at,
    snap.derivatives.open_interest.availability,
    ttl.oi,
    nowMs
  );
  const funding_ok = fresh(
    snap.derivatives.funding.fetched_at,
    snap.derivatives.funding.availability,
    ttl.funding,
    nowMs
  );
  const liquidations_ok = fresh(
    snap.derivatives.liquidations.fetched_at,
    snap.derivatives.liquidations.availability,
    ttl.liquidations,
    nowMs
  );
  const macro_ok = fresh(snap.macro.fetched_at, snap.macro.availability, ttl.macro, nowMs);

  if (futures) {
    if (!oi_ok) {
      if (snap.derivatives.open_interest.availability === "OK") stale_fields.push("derivatives.open_interest");
      else missing_critical.push("derivatives.open_interest");
    }
    if (!funding_ok) {
      if (snap.derivatives.funding.availability === "OK") stale_fields.push("derivatives.funding");
      else missing_critical.push("derivatives.funding");
    }
    if (!liquidations_ok) {
      if (snap.derivatives.liquidations.availability === "OK") stale_fields.push("derivatives.liquidations");
      else missing_critical.push("derivatives.liquidations");
    }
  }

  if (!macro_ok) {
    if (snap.macro.availability === "OK") stale_fields.push("macro");
    else missing_critical.push("macro");
  }

  if (
    snap.microstructure.availability === "OK" &&
    !fresh(snap.microstructure.fetched_at, snap.microstructure.availability, ttl.orderbook, nowMs)
  ) {
    stale_fields.push("microstructure.orderbook");
  }

  if (
    snap.derivatives.taker_flow.availability === "OK" &&
    !fresh(
      snap.derivatives.taker_flow.fetched_at,
      snap.derivatives.taker_flow.availability,
      ttl.takerFlow,
      nowMs
    )
  ) {
    stale_fields.push("derivatives.taker_flow");
  }

  if (
    snap.sentiment.availability === "OK" &&
    !fresh(snap.sentiment.fetched_at, snap.sentiment.availability, ttl.sentiment, nowMs)
  ) {
    stale_fields.push("sentiment.fear_greed");
  }

  return {
    market_ok,
    oi_ok: futures ? oi_ok : true,
    funding_ok: futures ? funding_ok : true,
    liquidations_ok: futures ? liquidations_ok : true,
    macro_ok,
    stale_fields,
    missing_critical,
  };
}

export function isReadyForAiReview(freshness: FreshnessReport): boolean {
  return (
    freshness.market_ok &&
    freshness.oi_ok &&
    freshness.funding_ok &&
    freshness.liquidations_ok &&
    freshness.macro_ok &&
    freshness.missing_critical.length === 0
  );
}
