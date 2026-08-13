/**
 * POST /api/strategies/optimize-parameters
 * Parameter optimization (Phase 2+) — fake random evaluation removed.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { asyncHandler, sendError, handleCORSPreflight } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", 405, req);
  }

  return sendError(
    res,
    "Parameter optimization with random/fake metrics has been removed. Phase 1 supports deterministic POST /api/backtest/run only.",
    501,
    req
  );
});
