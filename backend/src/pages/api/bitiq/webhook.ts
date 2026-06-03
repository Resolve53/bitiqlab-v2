/**
 * POST /api/bitiq/webhook — Inbound callbacks from Bitiq live platform
 */

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";
import { handleBitiqWebhookEvent } from "@/lib/bitiq-promotion-service";

function verifySignature(req: NextApiRequest, rawBody: string): boolean {
  const secret = process.env.BITIQ_INBOUND_WEBHOOK_SECRET;
  if (!secret) return true;

  const signature =
    (req.headers["x-bitiq-signature"] as string) ||
    (req.headers["x-bitiq-webhook-signature"] as string);

  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return signature === expected || signature === `sha256=${expected}`;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const rawBody = JSON.stringify(req.body);
  if (!verifySignature(req, rawBody)) {
    return sendError(res, "Invalid webhook signature", 401, req);
  }

  try {
    const result = await handleBitiqWebhookEvent(req.body);
    if (!result.ok) {
      return sendError(res, result.message, 400, req);
    }
    return sendSuccess(res, result, 200, req);
  } catch (error) {
    return sendError(
      res,
      error instanceof Error ? error.message : "Webhook processing failed",
      500,
      req
    );
  }
});
