import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { isAuthConfigured, getSupabaseAnon, resolveEmailForUsername } from "@/lib/supabase-auth";
import { asyncHandler, sendError, sendSuccess, } from "@/lib/utils";

const bodySchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(6).max(128),
});

function sessionCookie(accessToken: string, maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `bitiq_access_token=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", 405, req);
  }

  if (!isAuthConfigured()) {
    return sendError(
      res,
      "Authentication is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY on Railway.",
      503,
      req
    );
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, "Invalid username or password format", 400, req);
  }

  const { username, password } = parsed.data;
  const email = await resolveEmailForUsername(username);
  if (!email) {
    return sendError(res, "Invalid username or password", 401, req);
  }

  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    return sendError(res, "Invalid username or password", 401, req);
  }

  const { session, user } = data;
  const maxAge = session.expires_in || 60 * 60 * 24 * 7;
  res.setHeader("Set-Cookie", sessionCookie(session.access_token, maxAge));

  sendSuccess(
    res,
    {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: {
        id: user.id,
        email: user.email,
        username: user.user_metadata?.username ?? username,
      },
    },
    200,
    req
  );
});
