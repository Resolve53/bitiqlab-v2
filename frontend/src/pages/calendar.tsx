import { useEffect, useState } from "react";
import axios from "axios";
import { PageHeader } from "@/components/AppShell";
import { apiUrl } from "@/lib/api";

interface EconomicEvent {
  date: string;
  time: string;
  country: string;
  impact: "high" | "medium" | "low";
  event: string;
  forecast: string;
  previous: string;
}

interface ApiCalendarEvent {
  eventName: string;
  country: string;
  eventDate: string;
  importance: "high" | "medium" | "low";
  forecastValue?: string;
  previousValue?: string;
}

export default function Calendar() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCalendar();
    const interval = setInterval(fetchCalendar, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchCalendar = async () => {
    try {
      setError(null);
      const res = await axios.get(apiUrl("/api/analysis/calendar-events"), {
        params: { days: 14 },
      });

      const raw: ApiCalendarEvent[] = res.data?.data?.events || [];
      const mapped: EconomicEvent[] = raw.map((e) => {
        const hasTime = e.eventDate?.includes("T");
        return {
          date: hasTime ? e.eventDate.split("T")[0] : e.eventDate,
          time: hasTime
            ? new Date(e.eventDate).toISOString().substring(11, 16)
            : "—",
          country: normalizeCountry(e.country),
          impact: e.importance || "low",
          event: e.eventName,
          forecast: e.forecastValue || "—",
          previous: e.previousValue || "—",
        };
      });

      mapped.sort((a, b) => a.date.localeCompare(b.date));
      setEvents(mapped);
    } catch (err) {
      console.error("Calendar fetch error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load economic calendar"
      );
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter((e) => {
    if (filter === "high") return e.impact === "high";
    if (filter === "medium") return e.impact === "medium";
    if (filter === "low") return e.impact === "low";
    return true;
  });

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high":
        return "bg-red-500/20 text-red-400";
      case "medium":
        return "bg-yellow-500/20 text-yellow-400";
      case "low":
        return "bg-blue-500/20 text-blue-400";
      default:
        return "bg-slate-500/20 text-slate-400";
    }
  };

  const getCountryFlag = (country: string) => {
    const flags: { [key: string]: string } = {
      USA: "🇺🇸",
      US: "🇺🇸",
      EU: "🇪🇺",
      JPY: "🇯🇵",
      JP: "🇯🇵",
      GBP: "🇬🇧",
      GB: "🇬🇧",
      CHF: "🇨🇭",
      CAD: "🇨🇦",
      AUD: "🇦🇺",
      NZD: "🇳🇿",
    };
    return flags[country] || "🌍";
  };

  const highCount = events.filter((e) => e.impact === "high").length;
  const mediumCount = events.filter((e) => e.impact === "medium").length;
  const lowCount = events.filter((e) => e.impact === "low").length;

  const nextHighEvent = events.find((e) => e.impact === "high");
  const nextEvent = events[0];

  const volatilityLevel =
    highCount >= 3 ? "High" : highCount >= 1 ? "Medium" : "Low";

  return (
    <><PageHeader title="Economic Calendar" subtitle="Macro events that can affect open positions." />
      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
            {error}. Ensure NEXT_PUBLIC_API_URL points to the backend and ALPHA_VANTAGE_API_KEY is set.
          </div>
        )}

        {loading && (
          <p className="text-slate-400 text-center py-4">Loading calendar from API…</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total Events (14d)</p>
            <p className="text-3xl font-bold text-white">{events.length}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">High Impact</p>
            <p className="text-3xl font-bold text-red-400">{highCount}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Medium Impact</p>
            <p className="text-3xl font-bold text-yellow-400">{mediumCount}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Next High-Impact</p>
            <p className="text-white font-bold text-sm">{nextHighEvent?.event || nextEvent?.event || "—"}</p>
            <p className="text-xs text-slate-500 mt-2">
              {nextHighEvent?.date || nextEvent?.date || "—"}{" "}
              {nextHighEvent?.country || ""}
            </p>
          </div>
        </div>

        {nextHighEvent && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">IMPACT ALERT</h2>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 font-bold">High volatility possible</p>
              <p className="text-slate-300 text-sm mt-2">
                {nextHighEvent.event} ({nextHighEvent.country}) on{" "}
                {new Date(nextHighEvent.date).toLocaleDateString()}
                {nextHighEvent.time !== "—" ? ` at ${nextHighEvent.time} UTC` : ""}. New BUY
                entries may be blocked by the confirmation gate during this window.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            All ({events.length})
          </button>
          <button
            onClick={() => setFilter("high")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "high"
                ? "bg-red-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            High ({highCount})
          </button>
          <button
            onClick={() => setFilter("medium")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "medium"
                ? "bg-yellow-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Medium ({mediumCount})
          </button>
          <button
            onClick={() => setFilter("low")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "low"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Low ({lowCount})
          </button>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">UPCOMING EVENTS</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300">DATE / TIME</th>
                  <th className="text-left py-3 px-4 text-slate-300">COUNTRY</th>
                  <th className="text-left py-3 px-4 text-slate-300">IMPACT</th>
                  <th className="text-left py-3 px-4 text-slate-300">EVENT</th>
                  <th className="text-left py-3 px-4 text-slate-300">FORECAST</th>
                  <th className="text-left py-3 px-4 text-slate-300">PREVIOUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.length > 0 ? (
                  filteredEvents.map((event, idx) => (
                    <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4">
                        <div className="text-white font-bold">
                          {new Date(event.date).toLocaleDateString()}
                        </div>
                        <div className="text-slate-400 text-xs">{event.time} UTC</div>
                      </td>
                      <td className="py-3 px-4 text-white font-bold">
                        {getCountryFlag(event.country)} {event.country}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-3 py-1 rounded text-xs font-bold ${getImpactColor(event.impact)}`}
                        >
                          {event.impact.charAt(0).toUpperCase() + event.impact.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white">{event.event}</td>
                      <td className="py-3 px-4 text-slate-400">{event.forecast}</td>
                      <td className="py-3 px-4 text-slate-400">{event.previous}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-4 px-4 text-center text-slate-500">
                      {loading ? "Loading…" : "No events in range"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">EXPECTED VOLATILITY</h3>
            <p className="text-2xl font-bold text-white">{volatilityLevel}</p>
            <p className="text-slate-400 text-sm mt-2">
              Based on {highCount} high-impact event(s) in the next 14 days
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">TRADING NOTE</h3>
            <p className="text-slate-300 text-sm">
              Events shown are filtered to macro releases that affect crypto. The same calendar
              data powers the pre-execution confirmation gate on paper trading sessions.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function normalizeCountry(country: string): string {
  const c = (country || "").toUpperCase();
  if (c === "UNITED STATES" || c === "US") return "USA";
  if (c.includes("EURO")) return "EU";
  if (c === "JAPAN") return "JPY";
  if (c === "UNITED KINGDOM") return "GBP";
  return c.length <= 4 ? c : c.slice(0, 3);
}
