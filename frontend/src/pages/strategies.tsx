import { useEffect, useState } from "react";
import { apiUrl, getApiUrl } from "@/lib/api";
import axios from "axios";
import MainLayout from "@/components/MainLayout";

interface Strategy {
  id: string;
  name: string;
  status: string;
  sharpe_ratio: number;
  profit_factor: number;
  win_rate: number;
  avg_pnl: number;
  created_at: string;
}

interface StrategyAnalysis {
  strategy_id: string;
  total_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  sharpe_ratio: number;
  status: string;
  decision_reason: string;
}

export default function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [analyses, setAnalyses] = useState<{ [key: string]: StrategyAnalysis }>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "live" | "paper" | "archived">("all");

  useEffect(() => {
    fetchStrategies();
    const interval = setInterval(fetchStrategies, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchStrategies = async () => {
    try {
      // In a real app, this would fetch from backend
      const mockStrategies: Strategy[] = [
        { id: "1", name: "ETH BB Breakout", status: "live", sharpe_ratio: 1.78, profit_factor: 2.15, win_rate: 52, avg_pnl: 145.50, created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "2", name: "BTC RSI+MACD", status: "paper", sharpe_ratio: 1.42, profit_factor: 1.82, win_rate: 48, avg_pnl: 92.30, created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "3", name: "AVAX Momentum", status: "paper", sharpe_ratio: 1.15, profit_factor: 1.54, win_rate: 45, avg_pnl: 67.80, created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "4", name: "SOL Trend Follow", status: "archived", sharpe_ratio: 0.78, profit_factor: 1.23, win_rate: 42, avg_pnl: 34.20, created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() },
      ];
      setStrategies(mockStrategies);

      // Fetch analysis for each strategy
      const analysisMap: { [key: string]: StrategyAnalysis } = {};
      for (const strategy of mockStrategies) {
        try {
          const res = await axios.get(`/* removed */${strategy.id}`).catch(() => null);
          if (res?.data?.data) {
            analysisMap[strategy.id] = res.data.data;
          }
        } catch (error) {
          console.error(`Error fetching analysis for strategy ${strategy.id}:`, error);
        }
      }
      setAnalyses(analysisMap);
    } catch (error) {
      console.error("Error fetching strategies:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredStrategies = strategies.filter((s) => {
    if (filter === "live") return s.status === "live";
    if (filter === "paper") return s.status === "paper";
    if (filter === "archived") return s.status === "archived";
    return true;
  });

  const liveCount = strategies.filter((s) => s.status === "live").length;
  const paperCount = strategies.filter((s) => s.status === "paper").length;
  const archivedCount = strategies.filter((s) => s.status === "archived").length;
  const avgSharpe = strategies.length > 0
    ? (strategies.reduce((sum, s) => sum + s.sharpe_ratio, 0) / strategies.length).toFixed(2)
    : "0";

  return (
    <MainLayout title="Strategies">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total Strategies</p>
            <p className="text-3xl font-bold text-white">{strategies.length}</p>
            <p className="text-xs text-slate-500 mt-2">{liveCount} live · {paperCount} paper</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Avg Sharpe Ratio</p>
            <p className="text-3xl font-bold text-white">{avgSharpe}</p>
            <p className="text-xs text-slate-500 mt-2">Target ≥ 1.0</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Live Performance</p>
            <p className="text-3xl font-bold text-emerald-400">+8.4%</p>
            <p className="text-xs text-slate-500 mt-2">This week</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Strategies Promoted</p>
            <p className="text-3xl font-bold text-white">1</p>
            <p className="text-xs text-slate-500 mt-2">This month</p>
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
            All ({strategies.length})
          </button>
          <button
            onClick={() => setFilter("live")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "live"
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Live ({liveCount})
          </button>
          <button
            onClick={() => setFilter("paper")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "paper"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Paper ({paperCount})
          </button>
          <button
            onClick={() => setFilter("archived")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "archived"
                ? "bg-slate-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Archived ({archivedCount})
          </button>
        </div>

        {/* Strategies Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredStrategies.length > 0 ? (
            filteredStrategies.map((strategy) => {
              const analysis = analyses[strategy.id];
              const statusColor = strategy.status === "live"
                ? "bg-emerald-500/20 text-emerald-400"
                : strategy.status === "paper"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-slate-500/20 text-slate-400";

              const decisionColor = analysis?.status === "PROMOTE"
                ? "bg-emerald-500/20 text-emerald-400"
                : analysis?.status === "ARCHIVE"
                ? "bg-red-500/20 text-red-400"
                : "bg-yellow-500/20 text-yellow-400";

              return (
                <div key={strategy.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{strategy.name}</h3>
                      <p className="text-slate-400 text-xs mt-1">
                        Created {new Date(strategy.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${statusColor}`}>
                      {strategy.status.charAt(0).toUpperCase() + strategy.status.slice(1)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Sharpe Ratio</span>
                      <span className="text-white font-bold">{strategy.sharpe_ratio.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Profit Factor</span>
                      <span className="text-white font-bold">{strategy.profit_factor.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Win Rate</span>
                      <span className="text-white font-bold">{strategy.win_rate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Avg P&L</span>
                      <span className={strategy.avg_pnl > 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                        {strategy.avg_pnl > 0 ? "+" : ""}${strategy.avg_pnl.toFixed(2)}
                      </span>
                    </div>

                    {analysis && (
                      <div className="pt-3 border-t border-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-sm">Decision</span>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${decisionColor}`}>
                            {analysis.status}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs mt-2">{analysis.decision_reason}</p>
                      </div>
                    )}
                  </div>

                  <button className="w-full mt-4 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded transition">
                    View Details
                  </button>
                </div>
              );
            })
          ) : (
            <div className="col-span-2 text-center py-12 text-slate-500">
              No strategies found
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
