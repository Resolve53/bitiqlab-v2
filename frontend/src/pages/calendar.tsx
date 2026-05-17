import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";

interface EconomicEvent {
  date: string;
  time: string;
  country: string;
  impact: "high" | "medium" | "low";
  event: string;
  forecast: string;
  previous: string;
}

export default function Calendar() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    // Mock economic calendar data
    const mockEvents: EconomicEvent[] = [
      {
        date: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split("T")[0],
        time: "14:30",
        country: "USA",
        impact: "high",
        event: "Nonfarm Payrolls",
        forecast: "210K",
        previous: "275K",
      },
      {
        date: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().split("T")[0],
        time: "15:00",
        country: "USA",
        impact: "medium",
        event: "Unemployment Rate",
        forecast: "3.8%",
        previous: "3.7%",
      },
      {
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        time: "08:00",
        country: "EU",
        impact: "high",
        event: "ECB Decision",
        forecast: "4.25%",
        previous: "4.50%",
      },
      {
        date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split("T")[0],
        time: "13:30",
        country: "USA",
        impact: "high",
        event: "CPI Release",
        forecast: "3.2%",
        previous: "3.4%",
      },
      {
        date: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().split("T")[0],
        time: "15:00",
        country: "USA",
        impact: "medium",
        event: "Retail Sales",
        forecast: "0.3%",
        previous: "-0.1%",
      },
      {
        date: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString().split("T")[0],
        time: "10:00",
        country: "JPY",
        impact: "medium",
        event: "BoJ Rate Decision",
        forecast: "-0.10%",
        previous: "-0.10%",
      },
      {
        date: new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString().split("T")[0],
        time: "11:00",
        country: "GBP",
        impact: "high",
        event: "BoE Decision",
        forecast: "5.25%",
        previous: "5.25%",
      },
      {
        date: new Date(Date.now() + 168 * 60 * 60 * 1000).toISOString().split("T")[0],
        time: "12:30",
        country: "USA",
        impact: "medium",
        event: "Initial Jobless Claims",
        forecast: "210K",
        previous: "213K",
      },
    ];

    setEvents(mockEvents);
  }, []);

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
      EU: "🇪🇺",
      JPY: "🇯🇵",
      GBP: "🇬🇧",
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

  const upcomingHigh = events.filter((e) => e.impact === "high").length;
  const nextEvent = events[0];

  return (
    <MainLayout title="Economic Calendar">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total Events (7d)</p>
            <p className="text-3xl font-bold text-white">{events.length}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">High Impact</p>
            <p className="text-3xl font-bold text-red-400">{highCount}</p>
            <p className="text-xs text-slate-500 mt-2">Next 7 days</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Medium Impact</p>
            <p className="text-3xl font-bold text-yellow-400">{mediumCount}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Next Event</p>
            <p className="text-white font-bold text-sm">{nextEvent?.event || "—"}</p>
            <p className="text-xs text-slate-500 mt-2">{nextEvent?.time || "—"} {nextEvent?.country || ""}</p>
          </div>
        </div>

        {/* Trading Recommendations */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">🎯 IMPACT ALERT</h2>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-400 font-bold">⚠️ High volatility expected</p>
            <p className="text-slate-300 text-sm mt-2">
              Nonfarm Payrolls data release at 14:30 UTC. Consider reducing position sizes or tightening stops during this period.
            </p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2">
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

        {/* Economic Calendar */}
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
                        <div className="text-white font-bold">{new Date(event.date).toLocaleDateString()}</div>
                        <div className="text-slate-400 text-xs">{event.time} UTC</div>
                      </td>
                      <td className="py-3 px-4 text-white font-bold">
                        {getCountryFlag(event.country)} {event.country}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded text-xs font-bold ${getImpactColor(event.impact)}`}>
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
                      No events found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Volatility Forecast */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">EXPECTED VOLATILITY</h3>
            <div className="space-y-3">
              <div>
                <p className="text-slate-400 text-sm mb-1">Next 24h</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                    <div className="h-full w-4/5 bg-red-500 rounded"></div>
                  </div>
                  <span className="text-white font-bold">High</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-sm mb-1">Next 7d</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                    <div className="h-full w-3/5 bg-yellow-500 rounded"></div>
                  </div>
                  <span className="text-white font-bold">Medium</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-sm mb-1">Next 30d</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                    <div className="h-full w-2/5 bg-blue-500 rounded"></div>
                  </div>
                  <span className="text-white font-bold">Low-Medium</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">TRADING RECOMMENDATION</h3>
            <div className="space-y-3">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <p className="text-yellow-400 font-bold text-sm">⚠️ Exercise Caution</p>
                <p className="text-slate-300 text-xs mt-1">
                  High impact events scheduled. Consider using tighter stops and smaller position sizes.
                </p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-blue-400 font-bold text-sm">💡 Opportunity Window</p>
                <p className="text-slate-300 text-xs mt-1">
                  Post-volatility periods often present good entry opportunities with better risk/reward.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
