/**
 * GET /api/health - Health check endpoint
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { enableCORS, handleCORSPreflight } from "@/lib/utils";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle CORS preflight
  if (handleCORSPreflight(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    enableCORS(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  enableCORS(res);
  res.status(200).json({
    status: "ok",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
}
