/**
 * GET /api/health - Health check endpoint
 */

import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.status(200).json({
    status: "ok",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
}
