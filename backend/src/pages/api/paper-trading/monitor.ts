/**
 * POST /api/paper-trading/monitor — QUARANTINED (Phase 4A)
 * Legacy heuristic auto_trade + Binance orders disabled.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { asyncHandler, handleCORSPreflight } from "@/lib/utils";
import { rejectLegacyPaperExecution } from "@/paper-forward/quarantine";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  return rejectLegacyPaperExecution(req, res, 410);
});
