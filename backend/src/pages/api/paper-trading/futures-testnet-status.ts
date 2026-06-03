/**
 * GET /api/paper-trading/futures-testnet-status
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getTradingClient } from "@/lib/binance-trading";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const client = getTradingClient(true, "futures");
  const hasKey = Boolean(
    process.env.BINANCE_FUTURES_TESTNET_API_KEY ||
      process.env.BINANCE_TESTNET_API_KEY
  );

  try {
    const pingOk = await client.ping();
    const balance = hasKey ? await client.getBalance("USDT") : 0;

    return sendSuccess(
      res,
      {
        market_type: "futures",
        base_url:
          process.env.BINANCE_FUTURES_TESTNET_BASE_URL ||
          "https://demo-fapi.binance.com",
        ping_ok: pingOk,
        api_key_configured: hasKey,
        usdt_available: balance,
      },
      200,
      req
    );
  } catch (error) {
    return sendSuccess(
      res,
      {
        market_type: "futures",
        ping_ok: false,
        api_key_configured: hasKey,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      200,
      req
    );
  }
});
