/**
 * Central API base URL for all frontend → backend (Railway) requests.
 * Set NEXT_PUBLIC_API_URL in Vercel to your backend origin (e.g. https://xxx.up.railway.app).
 */
export function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  return url.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getApiUrl()}${normalized}`;
}
