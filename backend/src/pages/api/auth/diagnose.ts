import type { NextApiRequest, NextApiResponse } from "next";
import {
  isAuthConfigured,
  getSupabaseAdmin,
  resolveEmailForUsername,
} from "@/lib/supabase-auth";
import { asyncHandler, sendError, sendSuccess } from "@/lib/utils";

/**
 * GET /api/auth/diagnose?username=admin
 * Safe pre-login checks (no password). Enable with AUTH_DIAGNOSE=true on Railway.
 */
export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.AUTH_DIAGNOSE !== "true") {
    return sendError(res, "Diagnostics disabled", 404, req);
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", 405, req);
  }

  const username = String(req.query.username || "admin").trim();

  if (!isAuthConfigured()) {
    return sendSuccess(
      res,
      {
        authConfigured: false,
        message:
          "Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY on Railway.",
      },
      200,
      req
    );
  }

  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, username")
    .ilike("username", username)
    .maybeSingle();

  const { data: rpcEmail, error: rpcError } = await admin.rpc(
    "profile_email_for_username",
    { p_username: username }
  );

  const resolvedEmail = await resolveEmailForUsername(username);

  const { data: authUser, error: authError } = profile?.id
    ? await admin.auth.admin.getUserById(profile.id)
    : { data: { user: null }, error: null };

  sendSuccess(
    res,
    {
      authConfigured: true,
      username,
      profileFound: Boolean(profile),
      profileId: profile?.id ?? null,
      profileError: profileError?.message ?? null,
      rpcEmailFound: Boolean(rpcEmail),
      rpcError: rpcError?.message ?? null,
      resolveEmailFound: Boolean(resolvedEmail),
      authUserExists: Boolean(authUser?.user),
      emailConfirmedAt: authUser?.user?.email_confirmed_at ?? null,
      authUserEmail: authUser?.user?.email
        ? `${authUser.user.email.slice(0, 3)}***`
        : null,
      authLookupError: authError?.message ?? null,
      hints: [
        !profile
          ? "No profiles row for this username — run the INSERT again with the correct Auth user UUID."
          : null,
        profile && !resolvedEmail
          ? "RPC profile_email_for_username failed — re-run migrations/007_user_profiles.sql (GRANT to service_role)."
          : null,
        authUser?.user && !authUser.user.email_confirmed_at
          ? "Email not confirmed — in Supabase Auth disable confirm email or confirm the user."
          : null,
        profile && resolvedEmail && authUser?.user
          ? "Username resolves OK — if login still fails, the password is wrong or does not match Supabase Auth."
          : null,
      ].filter(Boolean),
    },
    200,
    req
  );
});
