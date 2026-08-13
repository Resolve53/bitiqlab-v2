/**
 * GET /api/paper-forward/versions?strategyId=
 * List immutable versions + recent validations for Start Paper UI.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import { getTradingSafetyState } from "@/lib/trading-safety";
import { Phase3PersistenceError } from "@/research-engine/persistence-errors";
import { Phase4PersistenceError } from "@/paper-forward";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const strategyId = String(req.query.strategyId || "");
  if (!strategyId) {
    return sendError(res, "Missing strategyId", 400, req);
  }

  try {
    const db = getDB();
    const [versions, validations, researchRuns] = await Promise.all([
      db.listStrategyVersions(strategyId),
      db.listStrategyValidations(strategyId),
      db.listResearchRuns(strategyId).catch(() => []),
    ]);

    return sendSuccess(
      res,
      {
        versions,
        validations,
        researchRuns,
        safety: getTradingSafetyState(),
      },
      200,
      req
    );
  } catch (error) {
    if (
      error instanceof Phase3PersistenceError ||
      error instanceof Phase4PersistenceError
    ) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
