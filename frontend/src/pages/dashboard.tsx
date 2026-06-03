import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";
import { apiUrl } from "@/lib/api";

interface Signal {
  id: string;
  coin: string;
  direction: string;
  entry_price: number;
  ai_score: number;
  reason: string;
  created_at: string;
}

interface Trade {
  id: string;
  coin: string;
  direction: string;
  entry_price: number;
  current_price: number;
  unrealized_pnl_usd: number;
  unrealized_pnl_percent: number;
  status: string;
}

interface Strategy {
  id: string;
  name: string;
  status: string;
  sharpe_ratio: number;
  profit_factor: number;
}

export default function Dashboard() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setSignals([]);

      const strategiesRes = await axios
        .get(apiUrl("/api/strategies"))
        .catch(() => ({ data: { data: { strategies: [] } } }));
      const list = strategiesRes.data?.data?.strategies || [];
      setStrategies(
        list.slice(0, 6).map((s: { id: string; name: string; status: string; current_sharpe?: number; total_return?: number }) => ({
          id: s.id,
          name: s.name,
          status: s.status === "approved" ? "live" : "paper",
          sharpe_ratio: s.current_sharpe ?? 0,
          profit_factor: Math.max(0.5, 1 + (s.total_return ?? 0) / 100),
        }))
      );

      setTrades([]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalPnL = trades.reduce((sum, t) => sum + t.unrealized_pnl_usd, 0);
  const paperTrades = trades.filter((t) => t.status === "paper").length;
  const liveStrategies = strategies.filter((s) => s.status === "live").length;
  const totalStrategies = strategies.length;
  const avgSharpe = strategies.length > 0 ? (strategies.reduce((sum, s) => sum + s.sharpe_ratio, 0) / strategies.length).toFixed(2) : "0";

  return (
    <MainLayout title="Dashboard">
      <div className="space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard
            label="Total Strategies"
            value={totalStrategies}
            icon="⚡"
            gradient="from-blue-600 to-cyan-600"
            subtitle={`${liveStrategies} live, ${totalStrategies - liveStrategies} paper`}
          />
          <KpiCard
            label="Live P&L"
            value={`${totalPnL >= 0 ? "+" : ""}$${totalPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon="💰"
            gradient="from-emerald-600 to-green-600"
            subtitle={`${liveStrategies} active strategies`}
            valueColor={totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <KpiCard
            label="Open Trades"
            value={trades.length}
            icon="📊"
            gradient="from-purple-600 to-pink-600"
            subtitle="Positions live"
          />
          <KpiCard
            label="Avg Sharpe"
            value={avgSharpe}
            icon="📈"
            gradient="from-orange-600 to-red-600"
            subtitle="Target ≥ 1.0"
            valueColor={parseFloat(avgSharpe) >= 1.0 ? "text-emerald-400" : "text-orange-400"}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Latest Signals - Large */}
          <div className="lg:col-span-2 rounded-xl border border-slate-800/50 bg-gradient-to-b from-slate-900/50 to-slate-950/50 backdrop-blur p-6 hover:border-slate-700/50 transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Recent Signals</h3>
              <Link href="/live-signals" className="text-sm text-cyan-400 hover:text-cyan-300 transition">
                View All →
              </Link>
            </div>

            {signals.length > 0 ? (
              <div className="space-y-3">
                {signals.slice(0, 4).map((signal) => (
                  <div
                    key={signal.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-slate-950/50 border border-slate-800/50 hover:border-slate-700/50 transition-all duration-200 group cursor-pointer"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center font-bold text-cyan-400">
                        {signal.coin.substring(0, 2)}
                      </div>
                      <div>
                        <p className="text-white font-semibold">{signal.coin}</p>
                        <p className="text-xs text-slate-400">{new Date(signal.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className={`px-3 py-1 rounded-full font-bold text-sm ${
                          signal.direction === "BUY"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {signal.direction === "BUY" ? "↗ BUY" : "↘ SELL"}
                      </div>
                      <div className={`text-right ${signal.ai_score > 75 ? "text-emerald-400" : "text-yellow-400"} font-bold`}>
                        {signal.ai_score}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-slate-500 text-sm">Waiting for TradingView data...</p>
              </div>
            )}
          </div>

          {/* Performance Summary */}
          <div className="rounded-xl border border-slate-800/50 bg-gradient-to-b from-slate-900/50 to-slate-950/50 backdrop-blur p-6 hover:border-slate-700/50 transition-all duration-300">
            <h3 className="text-xl font-bold text-white mb-6">Performance</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-slate-400 text-sm">Win Rate</p>
                  <p className="text-white font-bold">—</p>
                </div>
                <div className="w-full h-2 bg-slate-800/50 rounded-full overflow-hidden">
                  <div className="h-full w-0 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-slate-400 text-sm">Profit Factor</p>
                  <p className="text-emerald-400 font-bold">{strategies[0]?.profit_factor.toFixed(2)}x</p>
                </div>
                <div className="w-full h-2 bg-slate-800/50 rounded-full overflow-hidden">
                  <div className="h-full w-2/3 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-slate-400 text-sm">Sharpe Ratio</p>
                  <p className="text-cyan-400 font-bold">{avgSharpe}</p>
                </div>
                <div className="w-full h-2 bg-slate-800/50 rounded-full overflow-hidden">
                  <div className="h-full w-3/4 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"></div>
                </div>
              </div>
            </div>

            <Link
              href="/backtest"
              className="mt-6 w-full px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600/50 to-blue-600/50 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold transition-all duration-200 text-center border border-cyan-500/30 hover:border-cyan-500/50 block"
            >
              Run Backtest →
            </Link>
          </div>
        </div>

        {/* Strategies Grid */}
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-b from-slate-900/50 to-slate-950/50 backdrop-blur p-6 hover:border-slate-700/50 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Active Strategies</h3>
            <Link href="/strategies" className="text-sm text-cyan-400 hover:text-cyan-300 transition">
              View All →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {strategies.map((strategy) => (
              <div
                key={strategy.id}
                className="p-4 rounded-lg bg-slate-950/50 border border-slate-800/50 hover:border-slate-700/50 transition-all duration-200 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <h4 className="text-white font-semibold">{strategy.name}</h4>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${
                      strategy.status === "live"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {strategy.status === "live" ? "🔴 Live" : "📋 Paper"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Sharpe</p>
                    <p className={`font-bold text-lg mt-1 ${strategy.sharpe_ratio >= 1.0 ? "text-emerald-400" : "text-orange-400"}`}>
                      {strategy.sharpe_ratio.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Profit</p>
                    <p className="font-bold text-lg mt-1 text-cyan-400">{strategy.profit_factor.toFixed(2)}x</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/live-signals"
            className="group relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/30 hover:to-blue-600/30 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20"
          >
            <p className="text-white font-bold text-lg flex items-center gap-2">
              <span>📡</span> Live Signals Feed
            </p>
            <p className="text-slate-400 text-sm mt-2">Monitor real-time trading signals</p>
          </Link>

          <Link
            href="/strategies"
            className="group relative overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20"
          >
            <p className="text-white font-bold text-lg flex items-center gap-2">
              <span>⚡</span> Manage Strategies
            </p>
            <p className="text-slate-400 text-sm mt-2">Optimize & deploy new strategies</p>
          </Link>
        </div>
      </div>
    </MainLayout>
  );
}

function KpiCard({
  label,
  value,
  icon,
  gradient,
  subtitle,
  valueColor = "text-white",
}: {
  label: string;
  value: string | number;
  icon: string;
  gradient: string;
  subtitle: string;
  valueColor?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-800/50 bg-gradient-to-b from-slate-900/50 to-slate-950/50 backdrop-blur p-6 hover:border-slate-700/50 transition-all duration-300 group cursor-pointer relative overflow-hidden`}>
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-full -mr-12 -mt-12`}></div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-slate-400 text-sm font-medium uppercase tracking-wide">{label}</p>
          <span className="text-2xl">{icon}</span>
        </div>

        <p className={`text-4xl font-bold mb-2 ${valueColor}`}>{value}</p>
        <p className="text-slate-500 text-sm">{subtitle}</p>
      </div>
    </div>
  );
}
