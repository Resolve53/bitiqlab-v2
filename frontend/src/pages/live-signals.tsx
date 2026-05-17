import { useEffect, useState } from "react";
import axios from "axios";
import MainLayout from "@/components/MainLayout";

interface Signal {
  id: string;
  coin: string;
  direction: string;
  entry_price: number;
  ai_score: number;
  reason: string;
  created_at: string;
  strategy_id: string;
}

export default function LiveSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "buy" | "sell">("all");

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchSignals = async () => {
    try {
      const res = await axios.get(`http://localhost:4001/api/signals?limit=100`).catch(() => ({ data: { data: [] } }));
      setSignals(res.data.data || []);
    } catch (error) {
      console.error("Error fetching signals:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSignals = signals.filter((s) => {
    if (filter === "buy") return s.direction === "BUY";
    if (filter === "sell") return s.direction === "SELL";
    return true;
  });

  const buyCount = signals.filter((s) => s.direction === "BUY").length;
  const sellCount = signals.filter((s) => s.direction === "SELL").length;

  return (
    <MainLayout title="Live Signals">
      <div className="space-y-6">
        {/* Signal Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total Active Signals</p>
            <p className="text-3xl font-bold text-white">{signals.length}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Buy Signals</p>
            <p className="text-3xl font-bold text-emerald-400">{buyCount}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Sell Signals</p>
            <p className="text-3xl font-bold text-red-400">{sellCount}</p>
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
            All ({signals.length})
          </button>
          <button
            onClick={() => setFilter("buy")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "buy"
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Buy ({buyCount})
          </button>
          <button
            onClick={() => setFilter("sell")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "sell"
                ? "bg-red-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Sell ({sellCount})
          </button>
        </div>

        {/* Signals Table */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">SIGNAL FEED</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300">TIME</th>
                  <th className="text-left py-3 px-4 text-slate-300">SYMBOL</th>
                  <th className="text-left py-3 px-4 text-slate-300">SIGNAL</th>
                  <th className="text-left py-3 px-4 text-slate-300">ENTRY PRICE</th>
                  <th className="text-left py-3 px-4 text-slate-300">SCORE</th>
                  <th className="text-left py-3 px-4 text-slate-300">REASON</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignals.length > 0 ? (
                  filteredSignals.map((signal) => (
                    <tr key={signal.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {new Date(signal.created_at).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 text-white font-bold">{signal.coin}</td>
                      <td className="py-3 px-4 font-bold">
                        <span
                          className={
                            signal.direction === "BUY" ? "text-emerald-400" : "text-red-400"
                          }
                        >
                          {signal.direction}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white">
                        ${signal.entry_price.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-3 py-1 rounded font-bold text-xs ${
                            signal.ai_score > 75
                              ? "bg-emerald-500/20 text-emerald-400"
                              : signal.ai_score > 50
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {signal.ai_score}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 text-xs max-w-xs truncate">
                        {signal.reason}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-4 px-4 text-center text-slate-500">
                      No signals found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
