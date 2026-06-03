/**
 * POST /api/research/generate - Generate strategy from prompt (real Claude API)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { generateStrategyFromPrompt } from "@/lib/research-strategy-service";
import { sendSuccess, sendError, asyncHandler, handleCORSPreflight } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { prompt, symbol, timeframe, market_type, created_by } = req.body;

  if (!prompt || !symbol || !timeframe || !market_type) {
    return sendError(
      res,
      "Missing required fields: prompt, symbol, timeframe, market_type",
      400,
      req
    );
  }

  if (!["spot", "futures"].includes(market_type)) {
    return sendError(res, "Invalid market_type. Must be 'spot' or 'futures'", 400, req);
  }

  try {
    const result = await generateStrategyFromPrompt({
      prompt,
      symbol,
      timeframe,
      market_type,
      created_by,
    });

    return sendSuccess(res, result, 201, req);
  } catch (error) {
    console.error("Strategy generation error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to generate strategy",
      500,
      req
    );
  }
});
