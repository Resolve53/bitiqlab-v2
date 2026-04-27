/**
 * POST /api/paper-trading/generate-pine-script
 * Generate TradingView Pine Script from strategy rules
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { PineScriptGenerator } from "@/lib/pine-script-generator";

interface GeneratePineScriptRequest {
  strategy_id: string;
  session_id: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { strategy_id, session_id }: GeneratePineScriptRequest = req.body;

  if (!strategy_id || !session_id) {
    return sendError(
      res,
      "Missing required fields: strategy_id, session_id",
      400,
      req
    );
  }

  try {
    const db = getDB();

    // Get strategy
    const strategy = await db.getStrategy(strategy_id);
    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    // Get session
    const session = await db.getTradingSession(session_id);
    if (!session) {
      return sendError(res, "Trading session not found", 404, req);
    }

    // Generate Pine Script
    const pineScript = PineScriptGenerator.generate(strategy);
    const webhookCode = PineScriptGenerator.generateWebhookCode(session_id, strategy.symbol);
    const completeScript = pineScript + "\n\n" + webhookCode;

    return sendSuccess(
      res,
      {
        strategy_id,
        session_id,
        strategy_name: strategy.name,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        pine_script: completeScript,
        instructions: `
1. Copy the Pine Script code above
2. Go to TradingView → New Chart or open existing chart
3. Open Pine Script Editor (Alt+E or menu)
4. Create New Script → paste code
5. Click "Save" → give it a name
6. Click "Add to Chart"
7. The script will now send signals to your Bitiq Lab platform
8. Signals will execute automatically on Binance testnet
        `,
      },
      200,
      req
    );
  } catch (error) {
    console.error("Pine Script generation error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to generate Pine Script",
      500,
      req
    );
  }
});
