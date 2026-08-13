/**
 * POST /api/paper-forward/sessions — create immutable paper session (Phase 4A)
 * GET  /api/paper-forward/sessions?strategyId= — list sessions for strategy
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
import {
  createPaperForwardSession,
  PaperEligibilityError,
  Phase4PersistenceError,
} from "@/paper-forward";
import { asPaperForwardPersistence } from "@/paper-forward/db-adapter";
import { PaperAuthError, requireHumanActor } from "@/paper-forward/auth";
import { PaperLifecycleError } from "@/paper-forward/lifecycle";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;

  if (req.method === "GET") {
    const strategyId = String(req.query.strategyId || "");
    if (!strategyId) {
      return sendError(res, "Missing strategyId", 400, req);
    }
    const db = getDB();
    const sessions = await db.listTradingSessions({ strategy_id: strategyId });
    const phase4 = (sessions || []).filter(
      (s: { lifecycle_status?: string | null }) => Boolean(s.lifecycle_status)
    );
    return sendSuccess(
      res,
      { sessions: phase4, safety: getTradingSafetyState() },
      200,
      req
    );
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  try {
    const body = req.body || {};
    const actor = await requireHumanActor(
      req,
      body.createdBy || body.created_by
    );

    const db = getDB();
    const result = await createPaperForwardSession(
      asPaperForwardPersistence(db),
      {
        strategyId: body.strategyId || body.strategy_id,
        strategyVersionId: body.strategyVersionId || body.strategy_version_id,
        validationId: body.validationId || body.validation_id,
        researchRunId: body.researchRunId || body.research_run_id || null,
        initialCapital: body.initialCapital ?? body.initial_capital,
        acknowledgeConditional: Boolean(
          body.acknowledgeConditional ?? body.acknowledge_conditional
        ),
        createdBy: actor,
      }
    );

    return sendSuccess(
      res,
      {
        session: result.session,
        eligibility: result.eligibility,
        safety: result.safety,
        notice:
          "Paper Forward Engine pending / not executing trades yet (Phase 4A).",
      },
      201,
      req
    );
  } catch (error) {
    if (error instanceof PaperAuthError) {
      return sendError(res, error.message, error.statusCode, req);
    }
    if (error instanceof PaperEligibilityError) {
      return sendError(res, error.message, 400, req);
    }
    if (error instanceof PaperLifecycleError) {
      return sendError(res, error.message, 400, req);
    }
    if (error instanceof Phase4PersistenceError) {
      return sendError(res, error.message, 503, req);
    }
    if (
      error instanceof Error &&
      /ENABLE_PAPER_TRADING|Paper-forward session creation is disabled/i.test(
        error.message
      )
    ) {
      return sendError(res, error.message, 403, req);
    }
    throw error;
  }
});
