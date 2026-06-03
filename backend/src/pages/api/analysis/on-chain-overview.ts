/**
 * GET /api/analysis/on-chain-overview
 * Aggregated on-chain dashboard: Fear/Greed, per-symbol metrics, whale order-book signals
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getFearGreedIndex } from "@/lib/fear-greed-service";
import { scanOnChainSignals } from "@/lib/on-chain-service";
import { scanWhalesAcrossCoins } from "@/lib/whale-monitor";
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
    const [fearGreed, metrics, whales] = await Promise.all([
      getFearGreedIndex(),
      scanOnChainSignals(symbols),
      scanWhalesAcrossCoins(symbols),
    ]);

    const avgOnChainScore =
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, m) => sum + m.combinedScore, 0) / metrics.length
          )
        : 50;

    const bullishWhales = whales.filter((w) => w.bullishSignal).length;

    res.status(200).json({
      success: true,
      data: {
        fearGreed: {
          value: fearGreed.value,
          classification: fearGreed.classification,
          timestamp: fearGreed.timestamp,
        },
        metrics,
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
        },
      },
    });
  } catch (error) {
    console.error("[on-chain-overview] Error:", error);
    res.status(500).json({ error: "Failed to fetch on-chain overview" });
  }
});
