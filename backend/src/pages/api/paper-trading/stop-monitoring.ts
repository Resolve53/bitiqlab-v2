/**
 * POST /api/paper-trading/stop-monitoring
 * Stop a monitoring job
 *
 * Request body:
 * {
 *   job_id: string;
 * }
 *
 * Response:
 * {
 *   status: "success" | "error";
 *   message: string;
 *   job_id: string;
 * }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { stopMonitoringJob } from "@/lib/coin-monitor";

interface StopMonitoringRequest {
  job_id: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { job_id }: StopMonitoringRequest = req.body;

  if (!job_id) {
    return sendError(res, "Missing job_id", 400, req);
  }

  try {
    console.log(`[STOP-MONITORING] Stopping job ${job_id}`);

    const stopped = stopMonitoringJob(job_id);

    if (!stopped) {
      return sendError(res, `Monitoring job not found: ${job_id}`, 404, req);
    }

    return sendSuccess(
      res,
      {
        status: "success",
        message: `Monitoring job stopped: ${job_id}`,
        job_id,
      },
      200,
      req
    );
  } catch (error) {
    console.error("[STOP-MONITORING] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to stop monitoring",
      500,
      req
    );
  }
});
