/**
 * POST /api/backtest/validate
 * Walk-forward validation is Phase 2 — not available.
 * Fake/random validation paths have been removed.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { asyncHandler, handleCORSPreflight, sendError } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", 405, req);
  }

  return sendError(
    res,
    "Walk-forward validation is not available in Phase 1. Use POST /api/backtest/run for deterministic real-historical backtests. Phase 2 will add walk-forward validation.",
    501,
    req
  );
});
