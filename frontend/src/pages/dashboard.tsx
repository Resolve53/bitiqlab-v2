import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";

interface DashboardStats {
  total_strategies: number;
  active_strategies: number;
  live_sessions: number;
  total_pnl: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    total_strategies: 0,
    active_strategies: 0,
    live_sessions: 0,
    total_pnl: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await axios.get(`${apiUrl}/api/dashboard/metrics`);
      const data = response.data.data || {};
      setStats({
        total_strategies: data.total_strategies ?? 0,
        active_strategies: data.active_strategies ?? 0,
        live_sessions: data.live_sessions ?? 0,
        total_pnl: data.total_pnl ?? 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      setStats({
        total_strategies: 0,
        active_strategies: 0,
        live_sessions: 0,
        total_pnl: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout title="Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {/* Total Strategies */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-blue-500/50 transition">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-sm">Total Strategies</p>
              <p className="text-3xl font-bold text-white mt-2">
                {loading ? "..." : stats.total_strategies}
              </p>
            </div>
            <span className="text-3xl">⚡</span>
          </div>
        </div>

        {/* Active Strategies */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-green-500/50 transition">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-sm">Live Strategies</p>
              <p className="text-3xl font-bold text-emerald-400 mt-2">
                {loading ? "..." : stats.active_strategies}
              </p>
            </div>
            <span className="text-3xl">🟢</span>
          </div>
        </div>

        {/* Live Sessions */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-purple-500/50 transition">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-sm">Live Sessions</p>
              <p className="text-3xl font-bold text-purple-400 mt-2">
                {loading ? "..." : stats.live_sessions}
              </p>
            </div>
            <span className="text-3xl">📊</span>
          </div>
        </div>

        {/* Total P&L */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-yellow-500/50 transition">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-sm">Total P&L</p>
              <p
                className={`text-3xl font-bold mt-2 ${
                  stats.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                ${stats.total_pnl.toLocaleString()}
              </p>
            </div>
            <span className="text-3xl">💰</span>
          </div>
        </div>
      </div>

      {/* Quick Start */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-white mb-6">Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Create Strategy */}
          <div className="flex flex-col">
            <div className="text-5xl mb-4">⚡</div>
            <h3 className="text-lg font-bold text-white mb-2">Create Strategy</h3>
            <p className="text-slate-400 text-sm mb-4">
              Describe your trading strategy in natural language and let Bitiq AI create it for you.
            </p>
            <Link
              href="/strategies/new"
              className="mt-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition text-center"
            >
              Start
            </Link>
          </div>

          {/* Configure Monitoring */}
          <div className="flex flex-col">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-lg font-bold text-white mb-2">Monitor Coins</h3>
            <p className="text-slate-400 text-sm mb-4">
              Set up multi-coin monitoring with custom scan frequency and risk management.
            </p>
            <Link
              href="/strategies"
              className="mt-auto bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg transition text-center"
            >
              Manage
            </Link>
          </div>

          {/* Test & Analyze */}
          <div className="flex flex-col">
            <div className="text-5xl mb-4">📈</div>
            <h3 className="text-lg font-bold text-white mb-2">Analyze Results</h3>
            <p className="text-slate-400 text-sm mb-4">
              Test on Binance demo testnet and analyze performance metrics.
            </p>
            <Link
              href="/analysis"
              className="mt-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg transition text-center"
            >
              Review
            </Link>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
