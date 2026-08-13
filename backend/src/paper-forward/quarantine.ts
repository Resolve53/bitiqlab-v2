/**
 * Shared reject helper for quarantined legacy paper-execution endpoints.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendError } from "@/lib/utils";
import { LEGACY_PAPER_EXECUTION_DISABLED } from "@/lib/trading-safety";

export function rejectLegacyPaperExecution(
  req: NextApiRequest,
  res: NextApiResponse,
  statusCode: number = 410
) {
  return sendError(res, LEGACY_PAPER_EXECUTION_DISABLED, statusCode, req);
}
