import axios, { AxiosError } from "axios";
import { getEnrichmentHttpConfig } from "../config";
import type { ProviderCallStat } from "../types";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function timedGetJson<T>(opts: {
  provider: string;
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number>;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<{ data: T | null; stat: ProviderCallStat; status?: number }> {
  const cfg = getEnrichmentHttpConfig();
  const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;
  const maxRetries = opts.maxRetries ?? cfg.maxRetries;
  let lastError = "";
  let lastCode: string | undefined;
  let lastStatus: number | undefined;
  const started = Date.now();
  let retries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      retries++;
      await sleep(cfg.retryBackoffMs * attempt);
    }
    try {
      const res = await axios.get<T>(opts.url, {
        headers: opts.headers,
        params: opts.params,
        timeout: timeoutMs,
        validateStatus: () => true,
      });
      lastStatus = res.status;
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        return {
          data: null,
          status: res.status,
          stat: {
            provider: opts.provider,
            ok: false,
            latency_ms: Date.now() - started,
            retries,
            error_code: String(res.status),
            error: "plan_or_auth",
          },
        };
      }
      if (res.status >= 200 && res.status < 300 && res.data != null) {
        return {
          data: res.data,
          status: res.status,
          stat: {
            provider: opts.provider,
            ok: true,
            latency_ms: Date.now() - started,
            retries,
          },
        };
      }
      lastError = `http_${res.status}`;
      lastCode = String(res.status);
      if (res.status >= 500 || res.status === 429) continue;
      break;
    } catch (err) {
      const ax = err as AxiosError;
      lastError = ax.code || ax.message || "network";
      lastCode = ax.code;
      lastStatus = ax.response?.status;
    }
  }

  return {
    data: null,
    status: lastStatus,
    stat: {
      provider: opts.provider,
      ok: false,
      latency_ms: Date.now() - started,
      retries,
      error_code: lastCode,
      error: lastError,
    },
  };
}

export function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isoNow(ms = Date.now()): string {
  return new Date(ms).toISOString();
}

export function unavailable<T extends { availability: string; fetched_at: string | null; detail?: string; source?: string }>(
  extra: Omit<T, "availability" | "fetched_at"> & { detail: string; source?: string }
): T {
  return {
    ...extra,
    availability: "UNAVAILABLE",
    fetched_at: null,
  } as unknown as T;
}

export function unavailablePlan<T extends { availability: string; fetched_at: string | null }>(
  extra: Omit<T, "availability" | "fetched_at"> & { detail: string; source?: string }
): T {
  return {
    ...extra,
    availability: "UNAVAILABLE_PLAN",
    fetched_at: null,
  } as unknown as T;
}
