/**
 * CoinMarketCap Pro API client
 * https://coinmarketcap.com/api/documentation/v1/
 */

import axios from "axios";

const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";

export interface CmcFearGreed {
  value: number;
  classification: string;
  updateTime: string;
  timestamp: number;
}

export interface CmcGlobalMetrics {
  btcDominance: number;
  ethDominance: number;
  totalMarketCap: number;
  totalVolume24h: number;
  marketCapChange24hPct: number;
  volumeChange24hPct: number;
  lastUpdated: string;
}

export interface CmcQuote {
  symbol: string;
  name: string;
  price: number;
  percentChange24h: number;
  percentChange7d: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: string;
}

function getApiKey(): string {
  const key = process.env.COINMARKETCAP_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "COINMARKETCAP_API_KEY is not set. Add it to Railway/backend environment variables."
    );
  }
  return key;
}

function cmcHeaders() {
  return {
    "X-CMC_PRO_API_KEY": getApiKey(),
    Accept: "application/json",
  };
}

function assertCmcOk(status: { error_code?: string | number; error_message?: string }) {
  const code = String(status?.error_code ?? "");
  if (code !== "0") {
    throw new Error(status?.error_message || `CoinMarketCap error ${code}`);
  }
}

/** Latest CMC Crypto Fear and Greed Index */
export async function fetchCmcFearGreedLatest(): Promise<CmcFearGreed> {
  const res = await axios.get(`${CMC_BASE_URL}/v3/fear-and-greed/latest`, {
    headers: cmcHeaders(),
    timeout: 10000,
  });

  assertCmcOk(res.data?.status);
  const row = res.data?.data;
  if (!row || row.value == null) {
    throw new Error("CoinMarketCap fear/greed response missing data");
  }

  const updateTime = String(row.update_time || new Date().toISOString());
  return {
    value: Number(row.value),
    classification: String(row.value_classification || "Neutral"),
    updateTime,
    timestamp: new Date(updateTime).getTime(),
  };
}

/** Global crypto market metrics (BTC dominance, total cap, volume) */
export async function fetchCmcGlobalMetrics(): Promise<CmcGlobalMetrics> {
  const res = await axios.get(`${CMC_BASE_URL}/v1/global-metrics/quotes/latest`, {
    headers: cmcHeaders(),
    timeout: 10000,
  });

  assertCmcOk(res.data?.status);
  const data = res.data?.data;
  const usd = data?.quote?.USD;
  if (!usd) {
    throw new Error("CoinMarketCap global metrics response missing USD quote");
  }

  return {
    btcDominance: Number(data.btc_dominance ?? 0),
    ethDominance: Number(data.eth_dominance ?? 0),
    totalMarketCap: Number(usd.total_market_cap ?? 0),
    totalVolume24h: Number(usd.total_volume_24h ?? 0),
    marketCapChange24hPct: Number(
      usd.total_market_cap_yesterday_percentage_change ?? 0
    ),
    volumeChange24hPct: Number(
      usd.total_volume_24h_yesterday_percentage_change ?? 0
    ),
    lastUpdated: String(usd.last_updated || new Date().toISOString()),
  };
}

/** Map BTCUSDT → BTC for CMC symbol param */
export function toCmcSymbol(tradingPair: string): string {
  return tradingPair.replace(/USDT$/i, "").toUpperCase();
}

/** Latest quotes for one or more base symbols (BTC, ETH, …) */
export async function fetchCmcQuotesLatest(
  tradingPairs: string[]
): Promise<CmcQuote[]> {
  const symbols = [
    ...new Set(tradingPairs.map(toCmcSymbol).filter(Boolean)),
  ];
  if (symbols.length === 0) return [];

  const res = await axios.get(`${CMC_BASE_URL}/v1/cryptocurrency/quotes/latest`, {
    headers: cmcHeaders(),
    params: { symbol: symbols.join(","), convert: "USD" },
    timeout: 12000,
  });

  assertCmcOk(res.data?.status);
  const data = res.data?.data as Record<
    string,
    {
      symbol: string;
      name: string;
      quote?: { USD?: Record<string, number | string> };
    }
  >;

  if (!data) return [];

  return Object.values(data).map((asset) => {
    const usd = asset.quote?.USD || {};
    return {
      symbol: asset.symbol,
      name: asset.name,
      price: Number(usd.price ?? 0),
      percentChange24h: Number(usd.percent_change_24h ?? 0),
      percentChange7d: Number(usd.percent_change_7d ?? 0),
      volume24h: Number(usd.volume_24h ?? 0),
      marketCap: Number(usd.market_cap ?? 0),
      lastUpdated: String(usd.last_updated || ""),
    };
  });
}

export function isCoinMarketCapConfigured(): boolean {
  return Boolean(process.env.COINMARKETCAP_API_KEY?.trim());
}
