/**
 * Resolve human actor for Phase 4A actions.
 * Prefer authenticated user; never invent automatic system starts.
 */

import type { NextApiRequest } from "next";
import {
  authenticateRequest,
  isAuthRequired,
} from "@/lib/auth";

export class PaperAuthError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "PaperAuthError";
    this.statusCode = statusCode;
  }
}

export async function requireHumanActor(
  req: NextApiRequest,
  bodyActor?: string
): Promise<string> {
  const user = await authenticateRequest(req);
  if (user?.id) {
    return user.email || user.username || user.id;
  }
  if (isAuthRequired()) {
    throw new PaperAuthError(
      "Authentication required to create or control paper-forward sessions"
    );
  }
  // Dev/unauthenticated labs: still require an explicit caller label from the request.
  if (typeof bodyActor === "string" && bodyActor.trim()) {
    return bodyActor.trim();
  }
  return "explicit_api_caller";
}

/**
 * Scheduler cron may authenticate with PAPER_FORWARD_SCHEDULER_TOKEN.
 * If the token is unset, a human actor is required (no anonymous mass-tick).
 */
export async function requireSchedulerActor(
  req: NextApiRequest,
  bodyActor?: string
): Promise<string> {
  const expected = process.env.PAPER_FORWARD_SCHEDULER_TOKEN;
  const provided = String(
    req.headers["x-paper-forward-scheduler-token"] ||
      req.headers["x-scheduler-token"] ||
      ""
  );
  if (expected && expected.trim()) {
    if (provided !== expected) {
      throw new PaperAuthError("Invalid paper-forward scheduler token", 401);
    }
    return "paper_forward_scheduler";
  }
  return requireHumanActor(req, bodyActor);
}
