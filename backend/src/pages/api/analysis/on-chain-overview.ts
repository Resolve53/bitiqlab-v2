/**
 * GET /api/analysis/on-chain-overview
 * Aggregated on-chain dashboard: CMC Fear/Greed, derivatives, technical analysis, whale signals
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getFearGreedIndex } from "@/lib/fear-greed-service";
import { scanOnChainSignals } from "@/lib/on-chain-service";
import { scanWhalesAcrossCoins } from "@/lib/whale-monitor";
import {
  fetchCmcGlobalMetrics,
  fetchCmcQuotesLatest,
  fetchCmcDerivativesLatest,
  fetchCmcCryptoTechnicalAnalysis,
  fetchCmcMarketCapTechnicalAnalysis,
  isCoinMarketCapConfigured,
} from "@/lib/coinmarketcap-client";
import { asyncHandler } from "@/lib/utils";

const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
];

async function safeCmc<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[on-chain-overview] ${label}:`, e);
    return null;
  }
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const querySymbols = req.query.symbols
    ? String(req.query.symbols).split(",").map((s) => s.trim().toUpperCase())
    : DEFAULT_SYMBOLS;

  const symbols = querySymbols.filter(Boolean);
  const cmcOn = isCoinMarketCapConfigured();

  try {
    const [
      fearGreed,
      metrics,
      whales,
      globalMetrics,
      cmcQuotes,
      derivatives,
      marketTa,
      cryptoTa,
    ] = await Promise.all([
      getFearGreedIndex(),
      scanOnChainSignals(symbols),
      scanWhalesAcrossCoins(symbols),
      cmcOn
        ? safeCmc("global metrics", fetchCmcGlobalMetrics)
        : Promise.resolve(null),
      cmcOn
        ? safeCmc("quotes", () => fetchCmcQuotesLatest(symbols))
        : Promise.resolve([]),
      cmcOn
        ? safeCmc("derivatives", fetchCmcDerivativesLatest)
        : Promise.resolve(null),
      cmcOn
        ? safeCmc("market TA", fetchCmcMarketCapTechnicalAnalysis)
        : Promise.resolve(null),
      cmcOn
        ? safeCmc("crypto TA", () => fetchCmcCryptoTechnicalAnalysis(symbols))
        : Promise.resolve([]),
    ]);

    const avgOnChainScore =
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, m) => sum + m.combinedScore, 0) / metrics.length
          )
        : 50;

    const bullishWhales = whales.filter((w) => w.bullishSignal).length;

    const quotesBySymbol = Object.fromEntries(
      (cmcQuotes || []).map((q) => [q.symbol, q])
    );

    res.status(200).json({
      success: true,
      data: {
        fearGreed: {
          value: fearGreed.value,
          classification: fearGreed.classification,
          timestamp: fearGreed.timestamp,
          source: fearGreed.source,
        },
        globalMetrics: globalMetrics
          ? {
              btcDominance: globalMetrics.btcDominance,
              ethDominance: globalMetrics.ethDominance,
              totalMarketCap: globalMetrics.totalMarketCap,
              totalVolume24h: globalMetrics.totalVolume24h,
              marketCapChange24hPct: globalMetrics.marketCapChange24hPct,
              volumeChange24hPct: globalMetrics.volumeChange24hPct,
              derivativesVolume24h: globalMetrics.derivativesVolume24h,
              derivativesChange24hPct: globalMetrics.derivativesChange24hPct,
              lastUpdated: globalMetrics.lastUpdated,
              source: "coinmarketcap",
            }
          : null,
        derivatives,
        technicalAnalysis: {
          market: marketTa,
          symbols: cryptoTa || [],
        },
        cmcQuotes: cmcQuotes || [],
        metrics: metrics.map((m) => {
          const base = m.symbol.replace(/USDT$/i, "");
          const quote = quotesBySymbol[base];
          const ta = (cryptoTa || []).find(
            (t) => t.symbol === base || t.symbol === m.symbol.replace(/USDT$/i, "")
          );
          return {
            ...m,
            cmcQuote: quote
              ? {
                  price: quote.price,
                  percentChange24h: quote.percentChange24h,
                  percentChange7d: quote.percentChange7d,
                  marketCap: quote.marketCap,
                  volume24h: quote.volume24h,
                }
              : null,
            cmcRsi: ta?.rsi ?? null,
            cmcRsiSignal: ta?.rsiSignal ?? null,
          };
        }),
        whales,
        summary: {
          avgOnChainScore,
          bullishWhaleCount: bullishWhales,
          symbolsScanned: symbols.length,
          marketSignal:
            avgOnChainScore >= 65
              ? "bullish"
              : avgOnChainScore <= 40
                ? "bearish"
                : "neutral",
          cmcConfigured: cmcOn,
        },
      },
    });
  } catch (error) {
    console.error("[on-chain-overview] Error:", error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to fetch on-chain overview",
    });
  }
});
