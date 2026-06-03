/**
 * Fallback market data when CMC v3 derivatives / technical-analysis endpoints fail.
 * Uses CMC v1 global metrics + Binance funding/OI/RSI (same sources as on-chain-service).
 */

import { BinanceDataFetcher, calculateIndicators } from "./binance-fetcher";
import {
  CmcDerivativesOverview,
  CmcGlobalMetrics,
  CmcMarketTechnicalAnalysis,
  CmcTechnicalRow,
  fetchCmcDerivativesLatest,
  fetchCmcCryptoTechnicalAnalysis,
  fetchCmcMarketCapTechnicalAnalysis,
} from "./coinmarketcap-client";
import { getFundingRates, getPerpetualOpenInterest } from "./funding-rates";

const CMC_V3_RETRIES = 4;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  for (let i = 0; i < CMC_V3_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[on-chain-market] ${label} attempt ${i + 1}:`, msg);
      if (i < CMC_V3_RETRIES - 1) await sleep(RETRY_DELAY_MS * (i + 1));
    }
  }
  return null;
}

export async function fetchDerivativesOverview(
  symbols: string[],
  globalMetrics: CmcGlobalMetrics | null
): Promise<CmcDerivativesOverview & { dataSource: string; notice?: string }> {
  const cmc = await withRetries("CMC derivatives v3", fetchCmcDerivativesLatest);
  if (cmc && cmc.openInterestUsd > 0) {
    return { ...cmc, dataSource: "coinmarketcap" };
  }

  const fundingSymbols = symbols.length ? symbols : ["BTCUSDT", "ETHUSDT"];
  const [fundingRates, btcOi, ethOi] = await Promise.all([
    getFundingRates(fundingSymbols),
    getPerpetualOpenInterest("BTCUSDT"),
    getPerpetualOpenInterest("ETHUSDT"),
  ]);

  const btcFr = fundingRates.find((f) => f.symbol.startsWith("BTC"));
  const ethFr = fundingRates.find((f) => f.symbol.startsWith("ETH"));
  const rates = fundingRates.map((f) => f.fundingRate);
  const avgFunding =
    rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

  const btcOiUsd =
    (btcOi?.openInterest ?? 0) * (btcFr?.markPrice ?? 0);
  const ethOiUsd =
    (ethOi?.openInterest ?? 0) * (ethFr?.markPrice ?? 0);
  const openInterestUsd = btcOiUsd + ethOiUsd;

  return {
    openInterestUsd,
    openInterestChange24hPct: 0,
    futuresOpenInterestUsd: btcOiUsd,
    perpetualsOpenInterestUsd: ethOiUsd,
    avgFundingRatePct: avgFunding,
    btcFundingRatePct: btcFr?.fundingRate ?? null,
    ethFundingRatePct: ethFr?.fundingRate ?? null,
    liquidations24hUsd: 0,
    longLiquidations24hUsd: 0,
    shortLiquidations24hUsd: 0,
    longLiquidationSharePct: 50,
    derivativesVolume24h: globalMetrics?.derivativesVolume24h ?? 0,
    lastUpdated: globalMetrics?.lastUpdated ?? new Date().toISOString(),
    source: "coinmarketcap",
    dataSource: "binance_funding_cmc_volume",
    notice:
      "CMC derivatives detail API is unavailable on your plan or temporarily down. Showing Binance funding rates, open interest (BTC+ETH), and CMC global derivatives volume.",
  };
}

export async function fetchTechnicalAnalysisOverview(
  symbols: string[]
): Promise<{
  market: (CmcMarketTechnicalAnalysis & { dataSource?: string }) | null;
  symbols: (CmcTechnicalRow & { dataSource?: string })[];
  notice?: string;
}> {
  const [market, cmcSymbols] = await Promise.all([
    withRetries("CMC market TA", fetchCmcMarketCapTechnicalAnalysis),
    withRetries("CMC crypto TA", () => fetchCmcCryptoTechnicalAnalysis(symbols)),
  ]);

  if (market?.rsi != null && (cmcSymbols?.length ?? 0) > 0) {
    return {
      market: { ...market, dataSource: "coinmarketcap" },
      symbols: cmcSymbols!.map((s) => ({ ...s, dataSource: "coinmarketcap" })),
    };
  }

  const fetcher = new BinanceDataFetcher();
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const pairs = symbols.length ? symbols : ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

  const symbolRows: CmcTechnicalRow[] = [];
  for (const pair of pairs) {
    try {
      const ohlcv = await fetcher.getOHLCV(pair, "1h", start, end);
      const ind = calculateIndicators(ohlcv);
      const rsi = ind.rsi;
      symbolRows.push({
        symbol: pair.replace(/USDT$/i, ""),
        rsi,
        rsiSignal:
          rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : "Neutral",
      });
    } catch (e) {
      console.warn(`[on-chain-market] RSI ${pair}:`, e);
    }
  }

  const marketRsi =
    symbolRows.length > 0
      ? symbolRows.reduce((s, r) => s + (r.rsi ?? 50), 0) / symbolRows.length
      : null;

  return {
    market: marketRsi != null
      ? {
          rsi: marketRsi,
          rsiSignal:
            marketRsi >= 70
              ? "Overbought"
              : marketRsi <= 30
                ? "Oversold"
                : "Neutral",
          dataSource: "binance_ohlcv",
        }
      : null,
    symbols: symbolRows.map((s) => ({ ...s, dataSource: "binance_ohlcv" })),
    notice:
      symbolRows.length > 0
        ? "CMC technical-analysis API unavailable; RSI computed from Binance 1h candles."
        : "RSI unavailable (CMC technical API down and Binance OHLCV could not be loaded).",
  };
}
