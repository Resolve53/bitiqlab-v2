/**
 * POST /api/paper-trading/tradingview-webhook — QUARANTINED (Phase 4A)
 * Public webhook must NOT place orders.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { asyncHandler, handleCORSPreflight } from "@/lib/utils";
import { rejectLegacyPaperExecution } from "@/paper-forward/quarantine";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  // 410 Gone — endpoint remains routable for clients but cannot execute.
  return rejectLegacyPaperExecution(req, res, 410);
});
