/**
 * POST /api/research/claude-generate
 * Legacy alias — delegates to real Claude generation (same as /api/research/generate)
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

  const {
    symbol,
    timeframe,
    strategy_idea,
    market_type = "spot",
    created_by = "system",
  } = req.body;

  if (!symbol || !timeframe || !strategy_idea) {
    return sendError(
      res,
      "Missing required fields: symbol, timeframe, strategy_idea",
      400,
      req
    );
  }

  try {
    const result = await generateStrategyFromPrompt({
      prompt: strategy_idea,
      symbol,
      timeframe,
      market_type,
      created_by,
    });

    return sendSuccess(res, result, 201, req);
  } catch (error) {
    console.error("Claude generate error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to generate strategy",
      500,
      req
    );
  }
});
