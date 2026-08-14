/**
 * GET /api/health/enrichment-worker
 * Reads durable DB heartbeats (not process-local).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { enableCORS, handleCORSPreflight } from "@/lib/utils";
import { summarizeHeartbeats } from "@/candidate-intelligence/worker";
import { ENRICHMENT_WORKER_VERSION } from "@/candidate-intelligence/config";
import { Phase4PersistenceError } from "@/paper-forward";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (handleCORSPreflight(req, res)) return;

  if (req.method !== "GET") {
    enableCORS(res, req);
    return res.status(405).json({ error: "Method not allowed" });
  }

  enableCORS(res, req);

  try {
    const db = getDB();
    const rows = await db.listEnrichmentWorkerHeartbeats();
    const summary = summarizeHeartbeats(rows);
    const http = summary.status === "ok" ? 200 : 503;
    return res.status(http).json({
      ...summary,
      worker_version: summary.worker_version || ENRICHMENT_WORKER_VERSION,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Phase4PersistenceError) {
      return res.status(503).json({
        status: "unavailable",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    if (error instanceof Error && /SUPABASE/.test(error.message)) {
      return res.status(503).json({
        status: "unavailable",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    throw error;
  }
}
