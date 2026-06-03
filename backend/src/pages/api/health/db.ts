/**
 * GET /api/health/db — Supabase connectivity check
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import { enableCORS, handleCORSPreflight } from "@/lib/utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (handleCORSPreflight(req, res)) return;

  if (req.method !== "GET") {
    enableCORS(res, req);
    return res.status(405).json({ error: "Method not allowed" });
  }

  enableCORS(res, req);

  const hasUrl = Boolean(process.env.SUPABASE_URL?.trim());
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  if (!hasUrl || !hasKey) {
    return res.status(503).json({
      status: "degraded",
      database: {
        ok: false,
        error:
          "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on Railway.",
      },
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const db = getDB();
    const strategies = await db.listStrategies();
    return res.status(200).json({
      status: "ok",
      database: { ok: true, strategyCount: strategies.length },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database check failed";
    const hint = message.includes("fetch failed")
      ? "Supabase URL/key may be wrong, or the Supabase project is paused. Open Supabase dashboard → restore project → copy URL + service_role key to Railway."
      : message;

    return res.status(503).json({
      status: "degraded",
      database: { ok: false, error: hint },
      timestamp: new Date().toISOString(),
    });
  }
}
