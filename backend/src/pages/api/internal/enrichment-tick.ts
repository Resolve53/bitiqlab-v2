/**
 * POST /api/internal/enrichment-tick
 * Secured internal/cron trigger for the same worker tick used in production.
 * No AI decision. No execution.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import { runEnrichmentWorkerTick } from "@/candidate-intelligence/worker";
import { workerDepsFromDb } from "@/candidate-intelligence/worker-db";
import { Phase4PersistenceError } from "@/paper-forward";

function authorized(req: NextApiRequest): boolean {
  const expected = process.env.ENRICHMENT_WORKER_SECRET?.trim();
  if (!expected) return false;
  const header = String(
    req.headers["x-enrichment-worker-key"] ||
      req.headers["authorization"] ||
      ""
  );
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token === expected;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }
  if (!process.env.ENRICHMENT_WORKER_SECRET?.trim()) {
    return sendError(res, "ENRICHMENT_WORKER_SECRET is not configured", 503, req);
  }
  if (!authorized(req)) {
    return sendError(res, "Unauthorized", 401, req);
  }

  try {
    const db = getDB();
    const result = await runEnrichmentWorkerTick(workerDepsFromDb(db));
    return sendSuccess(
      res,
      {
        ...result,
        executed: false,
        ai_decision: null,
      },
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
