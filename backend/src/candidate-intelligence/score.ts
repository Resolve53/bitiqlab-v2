/**
 * Deterministic Stage 2 context score. Same inputs → same result. No AI.
 */

import type { IntelligenceSnapshot, ScoreBreakdown } from "./types";

function clamp(n: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function gradeFor(raw: number): string {
  if (raw >= 54) return "A+";
  if (raw >= 48) return "A";
  if (raw >= 42) return "B+";
  if (raw >= 36) return "B";
  if (raw >= 30) return "C+";
  if (raw >= 24) return "C";
  if (raw >= 18) return "D";
  return "F";
}

function present(availability: string): boolean {
  return availability === "OK";
}

export function scoreIntelligence(snap: IntelligenceSnapshot): ScoreBreakdown {
  const long = snap.direction === "LONG";

  let trend_alignment = 5;
  if (present(snap.derivatives.taker_flow.availability) && snap.derivatives.taker_flow.bias) {
    if (snap.derivatives.taker_flow.bias === "NEUTRAL") trend_alignment = 5;
    else if ((snap.derivatives.taker_flow.bias === "BUY") === long) trend_alignment = 8;
    else trend_alignment = 3;
  }
  if (present(snap.derivatives.funding.availability) && snap.derivatives.funding.value != null) {
    const fr = snap.derivatives.funding.value;
    if (long && fr > 0.05) trend_alignment = clamp(trend_alignment + 1);
    if (long && fr < -0.05) trend_alignment = clamp(trend_alignment - 1);
    if (!long && fr < -0.05) trend_alignment = clamp(trend_alignment + 1);
    if (!long && fr > 0.05) trend_alignment = clamp(trend_alignment - 1);
  }

  let liquidity_edge = 4;
  if (present(snap.market.availability) && snap.market.volume != null && snap.market.volume > 0) {
    liquidity_edge = 6;
  }
  if (present(snap.microstructure.availability)) {
    const depth = (snap.microstructure.bid_depth ?? 0) + (snap.microstructure.ask_depth ?? 0);
    if (depth > 0) liquidity_edge = clamp(liquidity_edge + 2);
  }

  let positioning = 5;
  if (present(snap.derivatives.long_short_ratio.availability) && snap.derivatives.long_short_ratio.global != null) {
    const g = snap.derivatives.long_short_ratio.global;
    if (long && g < 1) positioning = 7;
    else if (long && g > 1.4) positioning = 3;
    else if (!long && g > 1.2) positioning = 7;
    else if (!long && g < 0.8) positioning = 3;
  }
  if (
    present(snap.derivatives.open_interest.availability) &&
    snap.derivatives.open_interest.delta_pct != null
  ) {
    const d = snap.derivatives.open_interest.delta_pct;
    if (Math.abs(d) > 2) positioning = clamp(positioning + (d > 0 ? 1 : -1));
  }

  let orderbook_support = 5;
  if (
    present(snap.microstructure.availability) &&
    snap.microstructure.orderbook_imbalance != null
  ) {
    const imb = snap.microstructure.orderbook_imbalance;
    if (long) orderbook_support = clamp(5 + imb * 5);
    else orderbook_support = clamp(5 - imb * 5);
  } else {
    orderbook_support = 3;
  }

  let event_risk = 8;
  switch (snap.macro.risk_flag) {
    case "HIGH_IMPACT_EVENT_SOON":
      event_risk = 1;
      break;
    case "HIGH_IMPACT_EVENT_ELEVATED":
      event_risk = 3;
      break;
    case "HIGH_IMPACT_EVENT_WARNING":
      event_risk = 5;
      break;
    case "MEDIUM_IMPACT_EVENT_SOON":
      event_risk = 6;
      break;
    default:
      event_risk = present(snap.macro.availability) ? 9 : 4;
  }

  const optionalOk = [
    snap.derivatives.taker_flow.availability,
    snap.derivatives.liquidation_clusters.availability,
    snap.microstructure.availability,
    snap.derivatives.long_short_ratio.availability,
    snap.sentiment.availability,
    snap.derivatives.exchange_flows.availability,
  ].filter((a) => a === "OK").length;
  let data_quality = 4 + optionalOk;
  if (!snap.freshness.market_ok) data_quality -= 2;
  if (snap.market_type === "futures") {
    if (!snap.freshness.oi_ok) data_quality -= 1;
    if (!snap.freshness.funding_ok) data_quality -= 1;
    if (!snap.freshness.liquidations_ok) data_quality -= 1;
  }
  if (!snap.freshness.macro_ok) data_quality -= 1;
  data_quality = clamp(data_quality);

  const dims = {
    trend_alignment: clamp(trend_alignment),
    liquidity_edge: clamp(liquidity_edge),
    positioning: clamp(positioning),
    orderbook_support: clamp(orderbook_support),
    event_risk: clamp(event_risk),
    data_quality,
  };
  const raw_score =
    dims.trend_alignment +
    dims.liquidity_edge +
    dims.positioning +
    dims.orderbook_support +
    dims.event_risk +
    dims.data_quality;

  return { ...dims, raw_score, grade: gradeFor(raw_score) };
}
