import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { getSupabaseAdmin, isAuthConfigured } from "@/lib/supabase-auth";
import { asyncHandler, sendError, sendSuccess } from "@/lib/utils";

const bodySchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
  email: z.string().email().optional(),
});

/**
 * One-time admin bootstrap when no profiles exist.
 * POST with header: x-bootstrap-secret: <AUTH_BOOTSTRAP_SECRET>
 */
export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", 405, req);
  }

  const secret = process.env.AUTH_BOOTSTRAP_SECRET?.trim();
  if (!secret) {
    return sendError(res, "Bootstrap is not enabled", 403, req);
  }

  const provided = req.headers["x-bootstrap-secret"];
  if (provided !== secret) {
    return sendError(res, "Forbidden", 403, req);
  }

  if (!isAuthConfigured()) {
    return sendError(res, "Supabase auth not configured", 503, req);
  }

  const admin = getSupabaseAdmin();
  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (countError) {
    return sendError(res, countError.message, 500, req);
  }

  if ((count ?? 0) > 0) {
    return sendError(res, "Bootstrap already completed (profiles exist)", 409, req);
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, "Invalid input", 400, req);
  }

  const { username, password, email: optionalEmail } = parsed.data;
  const email =
    optionalEmail || `${username.toLowerCase()}@users.bitiqlab.app`;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: username.toLowerCase() },
    });

  if (createError || !created.user) {
    return sendError(res, createError?.message || "Failed to create user", 400, req);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username: username.toLowerCase(),
    display_name: username,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return sendError(res, profileError.message, 500, req);
  }

  sendSuccess(
    res,
    {
      message: "First admin user created. Sign in at /login.",
      username: username.toLowerCase(),
    },
    201,
    req
  );
});
