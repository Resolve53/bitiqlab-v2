import type { NextApiRequest, NextApiResponse } from "next";
import { authenticateRequest, getBearerToken } from "@/lib/auth";
import { getSupabaseAdmin, isAuthConfigured } from "@/lib/supabase-auth";
import { asyncHandler, sendError, sendSuccess } from "@/lib/utils";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", 405, req);
  }

  if (!isAuthConfigured()) {
    return sendError(res, "Authentication is not configured", 503, req);
  }

  const token = getBearerToken(req);
  if (!token) {
    return sendError(res, "Not signed in", 401, req);
  }

  const user = await authenticateRequest(req);
  if (!user) {
    return sendError(res, "Invalid or expired session", 401, req);
  }

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .maybeSingle();

  sendSuccess(
    res,
    {
      id: user.id,
      email: user.email,
      username: profile?.username || user.username,
      display_name: profile?.display_name,
    },
    200,
    req
  );
});
