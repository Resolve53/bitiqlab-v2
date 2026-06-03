import type { NextApiRequest } from "next";
import { User } from "@supabase/supabase-js";
import { getUserFromAccessToken, isAuthConfigured } from "./supabase-auth";

export interface AuthUser {
  id: string;
  email?: string;
  username?: string;
}

const PUBLIC_API_PATHS = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/bootstrap",
  "/api/auth/diagnose",
  "/api/paper-trading/tradingview-webhook",
];

export function isAuthRequired(): boolean {
  if (process.env.AUTH_REQUIRED === "false") return false;
  if (process.env.AUTH_REQUIRED === "true") return true;
  return isAuthConfigured();
}

export function isPublicApiPath(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split("?")[0];
  return PUBLIC_API_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
}

export function getBearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)bitiq_access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function authenticateRequest(
  req: NextApiRequest
): Promise<AuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const user = await getUserFromAccessToken(token);
  if (!user) return null;

  const username =
    (user.user_metadata?.username as string | undefined) ||
    user.email?.split("@")[0];

  return {
    id: user.id,
    email: user.email,
    username,
  };
}

export function attachUser(
  req: NextApiRequest & { user?: AuthUser },
  user: AuthUser
): void {
  req.user = user;
}

export type { User };
