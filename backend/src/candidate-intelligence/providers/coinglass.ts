/**
 * CoinGlass overlay. Premium metrics (heatmap, exchange flows/balances) stay
 * UNAVAILABLE_PLAN unless the live API actually returns them.
 */

import { timedGetJson, finiteOrNull, isoNow } from "./http";
import type {
  ExchangeFlowsBlock,
  LiquidationClustersBlock,
  LiquidationsBlock,
  ProviderCallStat,
} from "../types";

const COINGLASS_V4 = "https://open-api-v4.coinglass.com";

export function isCoinGlassConfigured(): boolean {
  return Boolean(process.env.COINGLASS_API_KEY?.trim());
}

function headers(): Record<string, string> {
  return {
    accept: "application/json",
    "CG-API-KEY": process.env.COINGLASS_API_KEY?.trim() || "",
  };
}

export async function fetchCoinGlassOverlay(symbol: string): Promise<{
  liquidations: LiquidationsBlock | null;
  liquidation_clusters: LiquidationClustersBlock;
  exchange_flows: ExchangeFlowsBlock;
  exchange_balances: ExchangeFlowsBlock;
  stats: ProviderCallStat[];
  health: "OK" | "PARTIAL" | "FAILED" | "UNAVAILABLE";
}> {
  const emptyClusters: LiquidationClustersBlock = {
    above: [],
    below: [],
    fetched_at: null,
    availability: "UNAVAILABLE_PLAN",
    source: "coinglass",
    detail: "liquidation heatmap not implemented without a CoinGlass heatmap endpoint response",
  };
  const emptyFlows: ExchangeFlowsBlock = {
    net_flow_usd: null,
    fetched_at: null,
    availability: "UNAVAILABLE_PLAN",
    source: "coinglass",
    detail: "exchange flows/balances not available on current CoinGlass plan",
  };

  if (!isCoinGlassConfigured()) {
    return {
      liquidations: null,
      liquidation_clusters: emptyClusters,
      exchange_flows: emptyFlows,
      exchange_balances: { ...emptyFlows },
      stats: [
        {
          provider: "coinglass",
          ok: false,
          latency_ms: 0,
          retries: 0,
          error_code: "NO_KEY",
          error: "COINGLASS_API_KEY unset",
        },
      ],
      health: "UNAVAILABLE",
    };
  }

  const coin = symbol.replace(/USDT$/i, "").toUpperCase();
  const fetched_at = isoNow();
  const [liqs, heatmap, flows] = await Promise.all([
    timedGetJson<{ code?: string; data?: { longLiqUsd?: unknown; shortLiqUsd?: unknown } | Array<{ longLiqUsd?: unknown; shortLiqUsd?: unknown }> }>({
      provider: "coinglass_liquidations",
      url: `${COINGLASS_V4}/api/futures/liquidation/aggregated-history`,
      headers: headers(),
      params: { symbol: coin, interval: "1h", limit: 24 },
    }),
    timedGetJson<unknown>({
      provider: "coinglass_heatmap",
      url: `${COINGLASS_V4}/api/futures/liquidation/heatmap/model1`,
      headers: headers(),
      params: { symbol: coin },
    }),
    timedGetJson<unknown>({
      provider: "coinglass_exchange_flow",
      url: `${COINGLASS_V4}/api/exchange/flow`,
      headers: headers(),
      params: { symbol: coin },
    }),
  ]);

  const stats = [liqs.stat, heatmap.stat, flows.stat];
  let liquidations: LiquidationsBlock | null = null;

  const rows = Array.isArray(liqs.data?.data)
    ? liqs.data?.data
    : liqs.data?.data
      ? [liqs.data.data]
      : null;
  if (liqs.stat.ok && rows && rows.length) {
    let long_usd = 0;
    let short_usd = 0;
    let saw = false;
    for (const r of rows) {
      const l = finiteOrNull(r.longLiqUsd);
      const s = finiteOrNull(r.shortLiqUsd);
      if (l != null) {
        long_usd += l;
        saw = true;
      }
      if (s != null) {
        short_usd += s;
        saw = true;
      }
    }
    if (saw) {
      liquidations = {
        long_usd,
        short_usd,
        window: "24h",
        fetched_at,
        availability: "OK",
        source: "coinglass",
      };
    }
  } else if (liqs.stat.error_code === "401" || liqs.stat.error_code === "403" || liqs.stat.error === "plan_or_auth") {
    liquidations = {
      long_usd: null,
      short_usd: null,
      window: "24h",
      fetched_at: null,
      availability: "UNAVAILABLE_PLAN",
      source: "coinglass",
      detail: "CoinGlass liquidations endpoint rejected (plan/auth)",
    };
  }

  let liquidation_clusters = emptyClusters;
  if (heatmap.stat.ok && heatmap.data) {
    const parsed = parseHeatmap(heatmap.data, fetched_at);
    if (parsed) liquidation_clusters = parsed;
  } else if (
    heatmap.stat.error === "plan_or_auth" ||
    heatmap.stat.error_code === "401" ||
    heatmap.stat.error_code === "403"
  ) {
    liquidation_clusters = {
      ...emptyClusters,
      detail: "CoinGlass heatmap UNAVAILABLE_PLAN",
    };
  }

  let exchange_flows = emptyFlows;
  if (flows.stat.ok && flows.data) {
    const net = extractNetFlow(flows.data);
    if (net != null) {
      exchange_flows = {
        net_flow_usd: net,
        fetched_at,
        availability: "OK",
        source: "coinglass",
      };
    }
  }

  const anyOk = Boolean(liquidations?.availability === "OK" || liquidation_clusters.availability === "OK" || exchange_flows.availability === "OK");
  const health = anyOk ? "PARTIAL" : liqs.stat.ok || heatmap.stat.ok || flows.stat.ok ? "PARTIAL" : "FAILED";

  return {
    liquidations,
    liquidation_clusters,
    exchange_flows,
    exchange_balances: {
      net_flow_usd: null,
      fetched_at: null,
      availability: "UNAVAILABLE_PLAN",
      source: "coinglass",
      detail: "exchange balances not returned by current CoinGlass overlay",
    },
    stats,
    health,
  };
}

function parseHeatmap(raw: unknown, fetched_at: string): LiquidationClustersBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const data = (rec.data || rec) as Record<string, unknown>;
  const aboveRaw = data.above || data.high || data.liquidationAbove;
  const belowRaw = data.below || data.low || data.liquidationBelow;
  const above = Array.isArray(aboveRaw) ? mapClusters(aboveRaw) : [];
  const below = Array.isArray(belowRaw) ? mapClusters(belowRaw) : [];
  if (!above.length && !below.length) return null;
  return {
    above,
    below,
    fetched_at,
    availability: "OK",
    source: "coinglass",
  };
}

function mapClusters(rows: unknown[]): Array<{ price: number; usd: number }> {
  const out: Array<{ price: number; usd: number }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const price = finiteOrNull(r.price ?? r.p);
    const usd = finiteOrNull(r.usd ?? r.value ?? r.volUsd);
    if (price != null && usd != null) out.push({ price, usd });
  }
  return out;
}

function extractNetFlow(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const data = rec.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return finiteOrNull((data as Record<string, unknown>).netFlowUsd ?? (data as Record<string, unknown>).net_flow);
  }
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    const row = data[0] as Record<string, unknown>;
    return finiteOrNull(row.netFlowUsd ?? row.net_flow);
  }
  return null;
}

