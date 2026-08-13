/**
 * POST /api/paper-trading/start — QUARANTINED (Phase 4A)
 * Use POST /api/paper-forward/sessions instead.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendError, asyncHandler, handleCORSPreflight } from "@/lib/utils";
import { LEGACY_PAPER_EXECUTION_DISABLED } from "@/lib/trading-safety";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  return sendError(
    res,
    `${LEGACY_PAPER_EXECUTION_DISABLED} Use POST /api/paper-forward/sessions with an immutable strategy version.`,
    410,
    req
  );
});
