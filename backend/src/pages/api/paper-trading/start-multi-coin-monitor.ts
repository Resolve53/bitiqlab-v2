/**
 * POST /api/paper-trading/start-multi-coin-monitor — QUARANTINED (Phase 4A)
 * Multi-coin automatic spray disabled.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { asyncHandler, handleCORSPreflight } from "@/lib/utils";
import { rejectLegacyPaperExecution } from "@/paper-forward/quarantine";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  return rejectLegacyPaperExecution(req, res, 410);
});
