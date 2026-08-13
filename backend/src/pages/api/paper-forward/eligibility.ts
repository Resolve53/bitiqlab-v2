/**
 * GET /api/paper-forward/eligibility
 * Preview eligibility for an immutable version + validation (no session created).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import { checkPaperEligibility, Phase4PersistenceError } from "@/paper-forward";
import { getTradingSafetyState } from "@/lib/trading-safety";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const strategyId = String(req.query.strategyId || "");
  const strategyVersionId = String(req.query.strategyVersionId || "");
  const validationId = String(req.query.validationId || "");
  const researchRunId = req.query.researchRunId
    ? String(req.query.researchRunId)
    : undefined;
  const acknowledgeConditional =
    String(req.query.acknowledgeConditional || "") === "true";

  if (!strategyId || !strategyVersionId || !validationId) {
    return sendError(
      res,
      "strategyId, strategyVersionId, and validationId are required",
      400,
      req
    );
  }

  try {
    const db = getDB();
    const eligibility = await checkPaperEligibility(
      {
        getStrategyVersionById: (id) => db.getStrategyVersionById(id),
        getStrategyValidationById: (id) => db.getStrategyValidationById(id),
        getResearchRunById: (id) => db.getResearchRunById(id),
      },
      {
        strategyId,
        strategyVersionId,
        validationId,
        researchRunId,
        acknowledgeConditional,
      }
    );
    return sendSuccess(
      res,
      { eligibility, safety: getTradingSafetyState() },
      200,
      req
    );
  } catch (error) {
    if (error instanceof Phase4PersistenceError) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
