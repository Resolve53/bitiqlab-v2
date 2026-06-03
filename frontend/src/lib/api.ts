/**
 * Central API client — all frontend calls should use this module.
 */

const DEFAULT_API_URL = "http://localhost:3001";

export function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  return url.replace(/\/$/, "");
}

export function apiPath(path: string): string {
  const base = getApiUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** @deprecated Use apiPath — kept for existing imports */
export function apiUrl(path: string): string {
  return apiPath(path);
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(apiPath(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(
      json.error || json.message || `Request failed (${res.status})`
    );
  }

  if (json.success === false) {
    throw new Error(json.error || "Request failed");
  }

  return (json.data !== undefined ? json.data : json) as T;
}
