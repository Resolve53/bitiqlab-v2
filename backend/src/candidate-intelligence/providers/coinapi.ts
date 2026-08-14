/**
 * CoinAPI overlay for market/orderbook. When the key is missing we do not
 * invent values — Binance fills market structure instead and coinapi=UNAVAILABLE.
 */

import { timedGetJson, finiteOrNull, isoNow } from "./http";
import type { MarketBlock, MicrostructureBlock, ProviderCallStat, ProviderHealth } from "../types";

const COINAPI = "https://rest.coinapi.io/v1";

export function isCoinApiConfigured(): boolean {
  return Boolean(process.env.COINAPI_KEY?.trim() || process.env.COINAPI_API_KEY?.trim());
}

function apiKey(): string {
  return (process.env.COINAPI_KEY || process.env.COINAPI_API_KEY || "").trim();
}

function symbolId(symbol: string, marketType: "spot" | "futures"): string {
  const base = symbol.replace(/USDT$/i, "").toUpperCase();
  if (marketType === "futures") return `BINANCEFTS_PERP_${base}_USDT`;
  return `BINANCE_SPOT_${base}_USDT`;
}

export async function fetchCoinApiMarket(input: {
  symbol: string;
  marketType: "spot" | "futures";
}): Promise<{
  market: Partial<MarketBlock> | null;
  microstructure: Partial<MicrostructureBlock> | null;
  stats: ProviderCallStat[];
  health: ProviderHealth;
}> {
  if (!isCoinApiConfigured()) {
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
      health: "UNAVAILABLE",
    };
  }

  const id = symbolId(input.symbol, input.marketType);
  const headers = { "X-CoinAPI-Key": apiKey(), Accept: "application/json" };
  const fetched_at = isoNow();

  const [quote, book] = await Promise.all([
    timedGetJson<Record<string, unknown>>({
      provider: "coinapi_quote",
      url: `${COINAPI}/exchangerate/${input.symbol.replace(/USDT$/i, "")}/USDT`,
      headers,
    }),
    timedGetJson<{ bids?: Array<{ price?: number; size?: number }>; asks?: Array<{ price?: number; size?: number }> }>({
      provider: "coinapi_orderbook",
      url: `${COINAPI}/orderbooks/${id}/current`,
      headers,
    }),
  ]);

  const stats = [quote.stat, book.stat];
  const price = finiteOrNull(quote.data?.rate);
  let bid_depth: number | null = null;
  let ask_depth: number | null = null;
  let imbalance: number | null = null;
  if (book.data?.bids && book.data?.asks) {
    bid_depth = book.data.bids.reduce(
      (s, l) => s + (finiteOrNull(l.price) ?? 0) * (finiteOrNull(l.size) ?? 0),
      0
    );
    ask_depth = book.data.asks.reduce(
      (s, l) => s + (finiteOrNull(l.price) ?? 0) * (finiteOrNull(l.size) ?? 0),
      0
    );
    const total = bid_depth + ask_depth;
    if (total > 0) imbalance = (bid_depth - ask_depth) / total;
  }

  const any = price != null || imbalance != null;
  if (!any) {
    const plan = [quote, book].some(
      (r) => r.stat.error === "plan_or_auth" || r.status === 401 || r.status === 403
    );
    return {
      market: null,
      microstructure: null,
      stats,
      health: plan ? "UNAVAILABLE" : "FAILED",
    };
  }

  return {
    market: {
      price,
      fetched_at,
      availability: price != null ? "OK" : "UNAVAILABLE",
      source: "coinapi",
    },
    microstructure: {
      orderbook_imbalance: imbalance,
      bid_depth,
      ask_depth,
      fetched_at: imbalance != null ? fetched_at : null,
      availability: imbalance != null ? "OK" : "UNAVAILABLE",
      source: "coinapi",
    },
    stats,
    health: quote.stat.ok && book.stat.ok ? "OK" : "PARTIAL",
  };
}
