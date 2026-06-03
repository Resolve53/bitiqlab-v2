/**
 * GET /api/analysis/on-chain-overview
 * Aggregated on-chain dashboard: CMC Fear/Greed, global metrics, per-symbol scores, whale order-book signals
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getFearGreedIndex } from "@/lib/fear-greed-service";
import { scanOnChainSignals } from "@/lib/on-chain-service";
import { scanWhalesAcrossCoins } from "@/lib/whale-monitor";
import {
  fetchCmcGlobalMetrics,
  fetchCmcQuotesLatest,
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

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const querySymbols = req.query.symbols
    ? String(req.query.symbols).split(",").map((s) => s.trim().toUpperCase())
    : DEFAULT_SYMBOLS;

  const symbols = querySymbols.filter(Boolean);

  try {
    const [fearGreed, metrics, whales, globalMetrics, cmcQuotes] =
      await Promise.all([
        getFearGreedIndex(),
        scanOnChainSignals(symbols),
        scanWhalesAcrossCoins(symbols),
        isCoinMarketCapConfigured()
          ? fetchCmcGlobalMetrics().catch((e) => {
              console.warn("[on-chain-overview] CMC global metrics:", e);
              return null;
            })
          : Promise.resolve(null),
        isCoinMarketCapConfigured()
          ? fetchCmcQuotesLatest(symbols).catch((e) => {
              console.warn("[on-chain-overview] CMC quotes:", e);
              return [];
            })
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
      cmcQuotes.map((q) => [q.symbol, q])
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
              lastUpdated: globalMetrics.lastUpdated,
              source: "coinmarketcap",
            }
          : null,
        cmcQuotes,
        metrics: metrics.map((m) => {
          const base = m.symbol.replace(/USDT$/i, "");
          const quote = quotesBySymbol[base];
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
          cmcConfigured: isCoinMarketCapConfigured(),
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
