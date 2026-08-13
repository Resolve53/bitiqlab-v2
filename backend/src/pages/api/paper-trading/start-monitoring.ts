/**
 * POST /api/paper-trading/start-monitoring — QUARANTINED (Phase 4A)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { asyncHandler, handleCORSPreflight } from "@/lib/utils";
import { rejectLegacyPaperExecution } from "@/paper-forward/quarantine";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  return rejectLegacyPaperExecution(req, res, 410);
});
