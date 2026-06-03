import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  getSupabaseAdmin,
  isAuthConfigured,
} from "@/lib/supabase-auth";
import { asyncHandler, sendError, sendSuccess } from "@/lib/utils";

const bodySchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username: letters, numbers, underscore only"),
  password: z.string().min(8).max(128),
  email: z.string().email().optional(),
});

function signupAllowed(): boolean {
  return process.env.ALLOW_PUBLIC_SIGNUP === "true";
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", 405, req);
  }

  if (!signupAllowed()) {
    return sendError(
      res,
      "Public registration is disabled. Ask an admin to create your account in Supabase.",
      403,
      req
    );
  }

  if (!isAuthConfigured()) {
    return sendError(res, "Authentication is not configured", 503, req);
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, parsed.error.errors[0]?.message || "Invalid input", 400, req);
  }

  const { username, password, email: optionalEmail } = parsed.data;
  const email =
    optionalEmail ||
    `${username.toLowerCase()}@users.bitiqlab.app`;

  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existing) {
    return sendError(res, "Username is already taken", 409, req);
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: username.toLowerCase() },
    });

  if (createError || !created.user) {
    const msg = createError?.message || "Failed to create user";
    if (msg.toLowerCase().includes("already")) {
      return sendError(res, "Email or username already registered", 409, req);
    }
    return sendError(res, msg, 400, req);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username: username.toLowerCase(),
    display_name: username,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return sendError(res, `Profile error: ${profileError.message}`, 500, req);
  }

  sendSuccess(
    res,
    {
      message: "Account created. You can sign in with your username and password.",
      username: username.toLowerCase(),
    },
    201,
    req
  );
});
