import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.SUPABASE_ANON_KEY?.trim()
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for authentication."
    );
  }
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function getSupabaseAnon(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY are required for authentication."
    );
  }
  if (!anonClient) {
    anonClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonClient;
}

export async function resolveEmailForUsername(
  username: string
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("profile_email_for_username", {
    p_username: username.trim(),
  });
  if (error) {
    console.warn("[auth] profile_email_for_username:", error.message);
    return null;
  }
  return typeof data === "string" ? data : null;
}

export async function getUserFromAccessToken(
  accessToken: string
): Promise<User | null> {
  const anon = getSupabaseAnon();
  const { data, error } = await anon.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }
  return data.user;
}
