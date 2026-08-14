import { fetchEconomicCalendarResult } from "@/lib/calendar-service";
import { isoNow } from "./http";
import {
  MACRO_ELEVATED_MINUTES,
  MACRO_SEVERE_MINUTES,
  MACRO_WARNING_MINUTES,
} from "../config";
import type {
  MacroBlock,
  MacroEvent,
  MacroRiskFlag,
  ProviderCallStat,
} from "../types";

function minutesUntil(eventTime: string, nowMs: number): number | null {
  const t = new Date(eventTime).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - nowMs) / 60000);
}

function riskFlag(events: MacroEvent[], nowMs: number): MacroRiskFlag {
  const high = events.filter((e) => e.importance === "high");
  const soonestHigh = high
    .map((e) => minutesUntil(e.event_time, nowMs))
    .filter((m): m is number => m != null && m >= 0)
    .sort((a, b) => a - b)[0];
  if (soonestHigh != null && soonestHigh <= MACRO_SEVERE_MINUTES) {
    return "HIGH_IMPACT_EVENT_SOON";
  }
  if (soonestHigh != null && soonestHigh <= MACRO_ELEVATED_MINUTES) {
    return "HIGH_IMPACT_EVENT_ELEVATED";
  }
  if (soonestHigh != null && soonestHigh <= MACRO_WARNING_MINUTES) {
    return "HIGH_IMPACT_EVENT_WARNING";
  }
  const mediumSoon = events.some((e) => {
    if (e.importance !== "medium") return false;
    const m = minutesUntil(e.event_time, nowMs);
    return m != null && m >= 0 && m <= MACRO_ELEVATED_MINUTES;
  });
  if (mediumSoon) return "MEDIUM_IMPACT_EVENT_SOON";
  return "NO_MAJOR_EVENT";
}

export async function fetchMacro(symbol: string, nowMs = Date.now()): Promise<{
  macro: MacroBlock;
  stat: ProviderCallStat;
}> {
  const started = Date.now();
  const start = new Date(nowMs - 24 * 3600_000).toISOString().slice(0, 10);
  const end = new Date(nowMs + 48 * 3600_000).toISOString().slice(0, 10);
  try {
    const result = await fetchEconomicCalendarResult(start, end);
    if (!result.ok) {
      return {
        macro: {
          next_high_impact_event: null,
          events_48h: [],
          risk_flag: "NO_MAJOR_EVENT",
          fetched_at: null,
          availability: "UNAVAILABLE",
          source: "alpha_vantage",
          detail: result.error || "calendar unavailable",
        },
        stat: {
          provider: "macro",
          ok: false,
          latency_ms: Date.now() - started,
          retries: 0,
          error: result.error || "calendar_unavailable",
        },
      };
    }
    const raw = result.events;
    const fetched_at = isoNow(nowMs);
    const events_48h: MacroEvent[] = raw.map((e) => {
      const event_time = e.eventDate.includes("T")
        ? new Date(e.eventDate).toISOString()
        : `${e.eventDate}T00:00:00.000Z`;
      return {
        name: e.eventName,
        country: e.country,
        event_time,
        importance: e.importance,
        minutes_until: minutesUntil(event_time, nowMs),
        affected_symbols: e.affectedSymbols || [],
      };
    });

    const relevant = events_48h.filter((e) => {
      if (!e.affected_symbols.length) return true;
      return e.affected_symbols.some(
        (s) => s.toUpperCase() === symbol.toUpperCase() || symbol.toUpperCase().startsWith(s.replace(/USDT$/i, ""))
      );
    });

    const highUpcoming = relevant
      .filter((e) => e.importance === "high")
      .filter((e) => e.minutes_until == null || e.minutes_until >= 0)
      .sort((a, b) => (a.minutes_until ?? 0) - (b.minutes_until ?? 0))[0];

    const macro: MacroBlock = {
      next_high_impact_event: highUpcoming
        ? {
            name: highUpcoming.name,
            country: highUpcoming.country,
            event_time: highUpcoming.event_time,
            minutes_until: highUpcoming.minutes_until,
          }
        : null,
      events_48h: relevant,
      risk_flag: riskFlag(relevant, nowMs),
      fetched_at,
      availability: "OK",
      source: "alpha_vantage",
    };

    return {
      macro,
      stat: {
        provider: "macro",
        ok: true,
        latency_ms: Date.now() - started,
        retries: 0,
      },
    };
  } catch (err) {
    return {
      macro: {
        next_high_impact_event: null,
        events_48h: [],
        risk_flag: "NO_MAJOR_EVENT",
        fetched_at: null,
        availability: "UNAVAILABLE",
        source: "alpha_vantage",
        detail: err instanceof Error ? err.message : "calendar fetch failed",
      },
      stat: {
        provider: "macro",
        ok: false,
        latency_ms: Date.now() - started,
        retries: 0,
        error: err instanceof Error ? err.message : "macro_failed",
      },
    };
  }
}
