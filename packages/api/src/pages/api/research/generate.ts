/**
 * POST /api/research/generate - Generate strategy from prompt
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { StrategyGenerator } from "@bitiqlab/autoresearch";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface GenerateRequest {
  prompt: string;
  symbol: string;
  timeframe: string;
  market_type: "spot" | "futures";
  leverage?: number;
  created_by?: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405);
  }

  const {
    prompt,
    symbol,
    timeframe,
    market_type,
    leverage,
    created_by,
  }: GenerateRequest = req.body;

  // Validate required fields
  if (!prompt || !symbol || !timeframe || !market_type) {
    return sendError(
      res,
      "Missing required fields: prompt, symbol, timeframe, market_type",
      400
    );
  }

  if (!["spot", "futures"].includes(market_type)) {
    return sendError(res, "Invalid market_type. Must be 'spot' or 'futures'", 400);
  }

  try {
    // Generate strategy using Claude
    const generator = new StrategyGenerator(process.env.ANTHROPIC_API_KEY);
    const strategy = await generator.generate({
      prompt,
      symbol,
      timeframe: timeframe as any,
      market_type,
      leverage: leverage || (market_type === "spot" ? 1 : 3),
    });

    // Save to database
    const db = getDB();
    const savedStrategy = await db.createStrategy({
      ...strategy,
      created_by: created_by || "system",
    });

    // Log audit
    await db.createAuditLog({
      action: "GENERATE",
      entity_type: "strategy",
      entity_id: savedStrategy.id,
      user_id: created_by,
      new_values: savedStrategy,
      description: `Generated strategy from prompt: ${prompt.substring(0, 100)}...`,
    });

    sendSuccess(
      res,
      {
        strategy: savedStrategy,
        message: "Strategy generated successfully",
      },
      201
    );
  } catch (error) {
    console.error("Strategy generation error:", error);
    sendError(
      res,
      error instanceof Error ? error.message : "Failed to generate strategy",
      500
    );
  }
});
