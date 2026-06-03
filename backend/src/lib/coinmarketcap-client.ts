/**
 * CoinMarketCap Pro API client
 * https://coinmarketcap.com/api/documentation/v1/
 */

import axios from "axios";

const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";

/** Common CMC IDs for top pairs (fallback if map call fails) */
const SYMBOL_TO_CMC_ID: Record<string, number> = {
  BTC: 1,
  ETH: 1027,
  SOL: 5426,
  BNB: 1839,
  XRP: 52,
  ADA: 2010,
  DOGE: 74,
  AVAX: 5805,
};

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
  derivativesVolume24h?: number;
  derivativesChange24hPct?: number;
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

export interface CmcDerivativesOverview {
  openInterestUsd: number;
  openInterestChange24hPct: number;
  futuresOpenInterestUsd: number;
  perpetualsOpenInterestUsd: number;
  avgFundingRatePct: number;
  btcFundingRatePct: number | null;
  ethFundingRatePct: number | null;
  liquidations24hUsd: number;
  longLiquidations24hUsd: number;
  shortLiquidations24hUsd: number;
  longLiquidationSharePct: number;
  derivativesVolume24h: number;
  lastUpdated: string;
  source: "coinmarketcap";
}

export interface CmcTechnicalRow {
  symbol: string;
  name?: string;
  rsi: number | null;
  rsiSignal: string;
  macdSignal?: string;
  lastUpdated?: string;
}

export interface CmcMarketTechnicalAnalysis {
  rsi: number | null;
  rsiSignal: string;
  macdSignal?: string;
  lastUpdated?: string;
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

/** Walk nested objects to find the first numeric value for any matching key */
function findNumeric(
  obj: unknown,
  keyPatterns: RegExp[],
  depth = 0
): number | null {
  if (obj == null || depth > 8) return null;
  if (typeof obj === "number" && Number.isFinite(obj)) return obj;
  if (typeof obj === "string" && obj !== "" && !Number.isNaN(Number(obj))) {
    return Number(obj);
  }
  if (typeof obj !== "object") return null;

  const record = obj as Record<string, unknown>;
  for (const [key, val] of Object.entries(record)) {
    if (keyPatterns.some((p) => p.test(key))) {
      const n = findNumeric(val, keyPatterns, depth + 1);
      if (n != null) return n;
    }
  }
  for (const val of Object.values(record)) {
    if (val && typeof val === "object") {
      const n = findNumeric(val, keyPatterns, depth + 1);
      if (n != null) return n;
    }
  }
  return null;
}

function rsiSignalFromValue(rsi: number | null): string {
  if (rsi == null || Number.isNaN(rsi)) return "Unknown";
  if (rsi >= 70) return "Overbought";
  if (rsi <= 30) return "Oversold";
  return "Neutral";
}

async function cmcGet(path: string, params?: Record<string, string>) {
  const res = await axios.get(`${CMC_BASE_URL}${path}`, {
    headers: cmcHeaders(),
    params,
    timeout: 15000,
  });
  assertCmcOk(res.data?.status);
  return res.data?.data;
}

/** Latest CMC Crypto Fear and Greed Index */
export async function fetchCmcFearGreedLatest(): Promise<CmcFearGreed> {
  const row = await cmcGet("/v3/fear-and-greed/latest");
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
    derivativesVolume24h: Number(usd.derivatives_volume_24h ?? 0),
    derivativesChange24hPct: Number(usd.derivatives_24h_percentage_change ?? 0),
    lastUpdated: String(usd.last_updated || new Date().toISOString()),
  };
}

/**
 * Global derivatives: open interest, funding rates, liquidations
 * GET /v3/global-metrics/derivatives/latest
 */
export async function fetchCmcDerivativesLatest(): Promise<CmcDerivativesOverview> {
  const data = await cmcGet("/v3/global-metrics/derivatives/latest");

  const openInterestUsd =
    findNumeric(data, [/open_interest$/i, /total_open_interest/i, /^open_interest_usd$/i]) ??
    findNumeric(data, [/open_interest/i]) ??
    0;

  const openInterestChange24hPct =
    findNumeric(data, [/open_interest.*24h.*percent/i, /open_interest.*change/i]) ?? 0;

  const futuresOi =
    findNumeric(data, [/futures.*open_interest/i]) ?? 0;
  const perpetualsOi =
    findNumeric(data, [/perpetual.*open_interest/i]) ?? 0;

  const avgFundingRatePct =
    findNumeric(data, [/avg.*funding/i, /average.*funding/i, /funding_rate_avg/i]) ??
    findNumeric(data, [/funding_rate/i, /funding/i]) ??
    0;

  const btcFunding =
    findNumeric(data, [/btc.*funding/i]) ??
    findNumeric((data as Record<string, unknown>)?.btc, [/funding/i]);
  const ethFunding =
    findNumeric(data, [/eth.*funding/i]) ??
    findNumeric((data as Record<string, unknown>)?.eth, [/funding/i]);

  const liquidations24hUsd =
    findNumeric(data, [/liquidation.*24h/i, /total_liquidation/i, /liquidations_usd/i]) ??
    findNumeric(data, [/liquidation/i]) ??
    0;

  const longLiq =
    findNumeric(data, [/long.*liquidation/i]) ?? 0;
  const shortLiq =
    findNumeric(data, [/short.*liquidation/i]) ?? 0;

  const longShare =
    longLiq + shortLiq > 0 ? (longLiq / (longLiq + shortLiq)) * 100 : 50;

  const lastUpdated = String(
    (data as Record<string, unknown>)?.last_updated ||
      (data as Record<string, unknown>)?.update_time ||
      new Date().toISOString()
  );

  return {
    openInterestUsd,
    openInterestChange24hPct,
    futuresOpenInterestUsd: futuresOi,
    perpetualsOpenInterestUsd: perpetualsOi,
    avgFundingRatePct,
    btcFundingRatePct: btcFunding,
    ethFundingRatePct: ethFunding,
    liquidations24hUsd,
    longLiquidations24hUsd: longLiq,
    shortLiquidations24hUsd: shortLiq,
    longLiquidationSharePct: longShare,
    derivativesVolume24h:
      findNumeric(data, [/derivatives_volume/i]) ?? 0,
    lastUpdated,
    source: "coinmarketcap",
  };
}

/** Total market cap technical analysis (RSI, MACD) */
export async function fetchCmcMarketCapTechnicalAnalysis(): Promise<CmcMarketTechnicalAnalysis> {
  const data = await cmcGet("/v3/global-metrics/technical-analysis/latest");
  const rsi =
    findNumeric(data, [/^rsi$/i, /rsi_value/i, /relative_strength/i]) ?? null;
  const macd = (data as Record<string, unknown>)?.macd;
  const macdSignal =
    typeof macd === "object" && macd !== null
      ? String((macd as Record<string, unknown>).signal || (macd as Record<string, unknown>).status || "")
      : typeof macd === "string"
        ? macd
        : undefined;

  return {
    rsi,
    rsiSignal: rsiSignalFromValue(rsi),
    macdSignal: macdSignal || undefined,
    lastUpdated: String(
      (data as Record<string, unknown>)?.last_updated || ""
    ),
  };
}

/** Per-asset technical analysis (RSI, MACD) */
export async function fetchCmcCryptoTechnicalAnalysis(
  tradingPairs: string[]
): Promise<CmcTechnicalRow[]> {
  const symbols = [...new Set(tradingPairs.map(toCmcSymbol).filter(Boolean))];
  const ids = symbols
    .map((s) => SYMBOL_TO_CMC_ID[s])
    .filter((id): id is number => id != null);

  if (ids.length === 0) return [];

  const data = await cmcGet("/v3/cryptocurrency/technical-analysis/latest", {
    id: ids.join(","),
  });

  const rows: CmcTechnicalRow[] = [];

  const pushRow = (symbol: string, block: unknown) => {
    const rsi =
      findNumeric(block, [/^rsi$/i, /rsi_value/i, /relative_strength_index/i]) ??
      findNumeric(block, [/rsi/i]);
    const macd = (block as Record<string, unknown>)?.macd;
    rows.push({
      symbol,
      name: String((block as Record<string, unknown>)?.name || symbol),
      rsi,
      rsiSignal: rsiSignalFromValue(rsi),
      macdSignal:
        typeof macd === "object" && macd
          ? String((macd as Record<string, unknown>).signal || "")
          : undefined,
      lastUpdated: String((block as Record<string, unknown>)?.last_updated || ""),
    });
  };

  if (Array.isArray(data)) {
    for (const item of data) {
      const sym = String((item as Record<string, unknown>).symbol || "");
      if (sym) pushRow(sym, item);
    }
    return rows;
  }

  if (data && typeof data === "object") {
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      const sym =
        SYMBOL_TO_CMC_ID[key] != null
          ? Object.entries(SYMBOL_TO_CMC_ID).find(([, id]) => String(id) === key)?.[0]
          : null;
      const symbol =
        sym ||
        String((val as Record<string, unknown>)?.symbol || key).toUpperCase();
      pushRow(symbol, val);
    }
  }

  return rows;
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
