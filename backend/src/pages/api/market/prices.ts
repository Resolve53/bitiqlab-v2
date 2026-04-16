/**
 * GET /api/market/prices
 * Returns current prices from Binance with caching
 *
 * Query Parameters:
 * - symbols: Comma-separated list of trading pairs (e.g., "BTCUSDT,ETHUSDT,BNBUSDT")
 *
 * Example: GET /api/market/prices?symbols=BTCUSDT,ETHUSDT
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getPriceCache, type PriceData } from "@/lib/price-cache";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface PricesResponse {
  prices: Array<{
    symbol: string;
    price: number;
    change24h: number;
    timestamp: string;
  }>;
  cache_age_ms: number;
  is_stale: boolean;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405);
  }

  try {
    // Parse symbols from query
    const { symbols } = req.query;

    if (!symbols || typeof symbols !== "string") {
      return sendError(res, "symbols parameter is required (comma-separated list)", 400);
    }

    const symbolList = symbols
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    if (symbolList.length === 0) {
      return sendError(res, "At least one symbol is required", 400);
    }

    // Get price cache instance
    const cache = getPriceCache();

    // Update prices (respects internal cache intervals)
    await cache.updatePrices(symbolList);

    // Get prices from cache
    const prices = cache.getPrices(symbolList);

    // Format response
    const response: PricesResponse = {
      prices: prices.map((p: PriceData) => ({
        symbol: p.symbol,
        price: p.price,
        change24h: p.change24h,
        timestamp: p.timestamp.toISOString(),
      })),
      cache_age_ms: cache.getCacheAgeMs(),
      is_stale: cache.isStale(),
    };

    // Set cache headers
    res.setHeader("Cache-Control", "public, max-age=3, s-maxage=3");

    return sendSuccess(res, response);
  } catch (error) {
    console.error("Error in prices endpoint:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to fetch prices",
      500
    );
  }
});
