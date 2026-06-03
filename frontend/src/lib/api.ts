/**
 * Central API client — all frontend calls should use this module.
 *
 * In production, requests go to same-origin `/api/*` and Vercel rewrites
 * proxy to Railway (see next.config.js). No CORS or localhost issues.
 */

const DEFAULT_API_URL = "http://localhost:3001";

const PRODUCTION_BACKEND =
  "https://bitiqlab-v2-production.up.railway.app";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function configuredUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!url) return undefined;
  return url.replace(/\/$/, "");
}

/**
 * Base URL for API calls. Empty string = same-origin `/api/...` (proxied).
 */
export function getApiUrl(): string {
  const configured = configuredUrl();
  const useProxy =
    process.env.NEXT_PUBLIC_API_USE_PROXY !== "false";

  if (isBrowser() && useProxy) {
    if (
      !configured ||
      configured.includes("localhost") ||
      configured.includes("127.0.0.1")
    ) {
      return "";
    }
    if (configured === PRODUCTION_BACKEND) {
      return "";
    }
  }

  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    return "";
  }

  return DEFAULT_API_URL;
}

export function apiPath(path: string): string {
  const base = getApiUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** @deprecated Use apiPath */
export function apiUrl(path: string): string {
  return apiPath(path);
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

function formatFetchError(err: unknown, path: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("fetch failed") || msg.includes("Failed to fetch")) {
    if (isBrowser() && getApiUrl().includes("localhost")) {
      return `Cannot reach API at ${getApiUrl()}. Redeploy with Vercel rewrites or set NEXT_PUBLIC_API_URL to your Railway URL.`;
    }
    return `Network error calling ${path}. The backend may be down or the database (Supabase) is unreachable on Railway.`;
  }
  return msg;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiPath(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new Error(formatFetchError(err, path));
  }

  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    const apiErr = json.error || json.message;
    if (apiErr?.includes("fetch failed")) {
      throw new Error(
        "Backend database is unreachable. In Railway, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase project must be active)."
      );
    }
    throw new Error(apiErr || `Request failed (${res.status})`);
  }

  if (json.success === false) {
    const apiErr = json.error || "Request failed";
    if (apiErr.includes("fetch failed")) {
      throw new Error(
        "Backend database is unreachable. Check Supabase credentials on Railway."
      );
    }
    throw new Error(apiErr);
  }

  return (json.data !== undefined ? json.data : json) as T;
}

export async function checkBackendHealth(): Promise<{
  ok: boolean;
  database?: boolean;
  message?: string;
}> {
  try {
    const res = await fetch(apiPath("/api/health"));
    const health = (await res.json()) as { status?: string };
    if (!res.ok || health.status !== "ok") {
      return { ok: false, message: "API health check failed" };
    }

    const dbRes = await fetch(apiPath("/api/health/db"));
    const dbJson = (await dbRes.json()) as {
      database?: { ok?: boolean; error?: string };
    };
    const dbOk = dbJson.database?.ok === true;
    return {
      ok: true,
      database: dbOk,
      message: dbOk ? undefined : dbJson.database?.error,
    };
  } catch (err) {
    return {
      ok: false,
      message: formatFetchError(err, "/api/health"),
    };
  }
}
