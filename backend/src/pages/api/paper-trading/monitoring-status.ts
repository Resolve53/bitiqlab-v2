/**
 * GET /api/paper-trading/monitoring-status?job_id=xxx
 * Check the status of a monitoring job
 *
 * Query parameters:
 * - job_id: string (required)
 * - include_results?: boolean (default: false)
 *
 * Response:
 * {
 *   status: "running" | "stopped" | "error";
 *   job_id: string;
 *   session_id: string;
 *   coins_monitored: string[];
 *   last_prices: { [symbol]: number };
 *   last_evaluation: Date;
 *   signals_generated: number;
 *   trades_executed: number;
 *   error?: string;
 *   results?: MonitoringResult[];
 * }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { getMonitoringJob, listMonitoringJobs } from "@/lib/coin-monitor";
import { getDB } from "@/lib/db";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { job_id, include_results } = req.query;

  // If no job_id provided, list all active monitoring jobs
  if (!job_id) {
    try {
      const jobs = listMonitoringJobs();
      const statuses = jobs.map((job) => ({
        ...job.getStatus(),
        last_prices: Object.fromEntries(job.getStatus().last_prices),
      }));

      return sendSuccess(
        res,
        {
          status: "success",
          active_jobs: statuses.length,
          jobs: statuses,
        },
        200,
        req
      );
    } catch (error) {
      console.error("[MONITORING-STATUS] Error listing jobs:", error);
      return sendError(
        res,
        error instanceof Error ? error.message : "Failed to list monitoring jobs",
        500,
        req
      );
    }
  }

  try {
    const db = getDB();
    let job = getMonitoringJob(String(job_id));

    // If not in memory, try to load from database
    if (!job) {
      const dbStatus = await db.getMonitoringJobStatus(String(job_id));
      if (dbStatus) {
        return sendSuccess(
          res,
          {
            status: dbStatus.status,
            job_id: dbStatus.job_id,
            session_id: dbStatus.session_id,
            coins_monitored: dbStatus.coins,
            last_prices: {},
            last_evaluation: dbStatus.last_evaluation,
            signals_generated: dbStatus.signals_generated || 0,
            trades_executed: dbStatus.trades_executed || 0,
            note: "Job status loaded from database - may still be running in background",
          },
          200,
          req
        );
      }
      return sendError(res, `Monitoring job not found: ${job_id}`, 404, req);
    }

    const status = job.getStatus();
    const response: any = {
      status: status.status,
      job_id: status.job_id,
      session_id: status.session_id,
      coins_monitored: status.coins_monitored,
      last_prices: Object.fromEntries(status.last_prices),
      last_evaluation: status.last_evaluation,
      signals_generated: status.signals_generated,
      trades_executed: status.trades_executed,
    };

    if (status.error) {
      response.error = status.error;
    }

    // Include results if requested
    if (include_results === "true") {
      response.results = job.getResults();
    }

    return sendSuccess(res, response, 200, req);
  } catch (error) {
    console.error("[MONITORING-STATUS] Error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to get monitoring status",
      500,
      req
    );
  }
});
