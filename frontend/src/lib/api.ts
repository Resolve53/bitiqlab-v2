export function getApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getApiUrl()}${normalized}`;
}
