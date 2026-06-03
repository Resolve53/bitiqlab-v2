import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  isAuthConfigured,
  getSupabaseAnon,
  resolveEmailForUsername,
} from "@/lib/supabase-auth";
import { asyncHandler, sendError, sendSuccess } from "@/lib/utils";

const bodySchema = z
  .object({
    email: z.string().min(3).max(255).optional(),
    username: z.string().min(2).max(255).optional(),
    password: z.string().min(6).max(128),
  })
  .refine((b) => Boolean(b.email?.trim() || b.username?.trim()), {
    message: "Email is required",
  });

function sessionCookie(accessToken: string, maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `bitiq_access_token=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

async function emailForLogin(
  email?: string,
  username?: string
): Promise<string | null> {
  const direct = email?.trim() || username?.trim() || "";
  if (!direct) return null;
  if (direct.includes("@")) {
    return direct.toLowerCase();
  }
  return resolveEmailForUsername(direct);
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
    return sendError(res, "Enter your email and password", 400, req);
  }

  const { email, username, password } = parsed.data;
  const loginEmail = await emailForLogin(email, username);
  if (!loginEmail) {
    return sendError(res, "Invalid email or password", 401, req);
  }

  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password,
  });

  if (error || !data.session) {
    const msg = error?.message?.toLowerCase() ?? "";
    if (msg.includes("email not confirmed") || msg.includes("confirm")) {
      return sendError(
        res,
        "Email not confirmed. In Supabase → Authentication → Users, confirm the user or disable Confirm email.",
        401,
        req
      );
    }
    if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
      return sendError(
        res,
        "Wrong password. Reset it in Supabase → Authentication → Users → your user.",
        401,
        req
      );
    }
    console.warn("[auth/login] signIn failed:", error?.message);
    return sendError(res, "Invalid email or password", 401, req);
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
        username:
          (user.user_metadata?.username as string | undefined) ||
          user.email?.split("@")[0],
      },
    },
    200,
    req
  );
});
