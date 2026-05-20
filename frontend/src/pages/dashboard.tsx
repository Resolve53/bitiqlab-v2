import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import MainLayout from "@/components/MainLayout";

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
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

      // Fetch signals
      const signalsRes = await axios.get(`${apiUrl}/api/signals?limit=10`).catch(() => ({ data: { data: [] } }));
      setSignals(signalsRes.data.data || []);

      // Fetch open trades (trade service is separate)
      const tradeUrl = process.env.NEXT_PUBLIC_TRADE_URL || "http://localhost:4002";
      const tradesRes = await axios.get(`${tradeUrl}/api/trades`).catch(() => ({ data: { data: [] } }));
      setTrades(tradesRes.data.data || []);

      // Fetch strategies (mock data)
      setStrategies([
        { id: "1", name: "ETH BB Breakout", status: "live", sharpe_ratio: 1.78, profit_factor: 2.15 },
        { id: "2", name: "BTC RSI+MACD", status: "paper", sharpe_ratio: 1.42, profit_factor: 1.82 },
        { id: "3", name: "AVAX Momentum", status: "paper", sharpe_ratio: 1.15, profit_factor: 1.54 },
      ]);
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
    <MainLayout title="Overview">
      <div className="space-y-8">
        {/* Premium Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Strategies */}
          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600/20 via-slate-900 to-slate-950 border border-blue-500/20 hover:border-blue-500/50 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-400 text-sm font-medium">TOTAL STRATEGIES</p>
                <span className="text-2xl">⚡</span>
              </div>
              <p className="text-4xl font-bold text-white mb-2">{totalStrategies}</p>
              <div className="flex gap-3">
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-medium">{liveStrategies} Live</span>
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full font-medium">{totalStrategies - liveStrategies} Paper</span>
              </div>
            </div>
          </div>

          {/* Live P&L */}
          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-600/20 via-slate-900 to-slate-950 border border-emerald-500/20 hover:border-emerald-500/50 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-400 text-sm font-medium">LIVE P&L</p>
                <span className="text-2xl">💰</span>
              </div>
              <p className={`text-4xl font-bold mb-2 ${totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalPnL >= 0 ? "+" : ""}${totalPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-400">{liveStrategies} strategies trading</p>
            </div>
          </div>

          {/* Active Trades */}
          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-600/20 via-slate-900 to-slate-950 border border-purple-500/20 hover:border-purple-500/50 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-400 text-sm font-medium">ACTIVE TRADES</p>
                <span className="text-2xl">📊</span>
              </div>
              <p className="text-4xl font-bold text-purple-400 mb-2">{trades.length}</p>
              <p className="text-xs text-slate-400">Open positions live</p>
            </div>
          </div>

          {/* Avg Sharpe */}
          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-600/20 via-slate-900 to-slate-950 border border-orange-500/20 hover:border-orange-500/50 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-400 text-sm font-medium">AVG SHARPE RATIO</p>
                <span className="text-2xl">📈</span>
              </div>
              <p className={`text-4xl font-bold mb-2 ${parseFloat(avgSharpe) >= 1.0 ? "text-emerald-400" : "text-orange-400"}`}>{avgSharpe}</p>
              <p className="text-xs text-slate-400">Target ≥ 1.0</p>
            </div>
          </div>
        </div>

        {/* Premium Agent Research Section */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-300 p-8">
          <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-full -ml-48 -mt-48"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">🤖 AI Research Agent</h2>
                <p className="text-slate-400 text-sm">Autonomous strategy optimization in progress</p>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-2 bg-cyan-500/20 border border-cyan-500/50 rounded-full px-4 py-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                  <span className="text-cyan-400 text-sm font-medium">Testing</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/50 rounded-lg p-4 mb-6 border border-slate-700/30">
              <p className="text-slate-300 font-medium mb-1">SOL Trend Follow Strategy</p>
              <p className="text-slate-400 text-sm italic">"Create a trend following strategy for SOL using EMA crossover + ADX filter"</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full w-7/12 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"></div>
                </div>
                <span className="text-slate-400 text-xs font-medium">7 / 15</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-4 p-3 rounded-lg bg-slate-950/30 border border-slate-700/20 hover:border-slate-600/40 transition-colors">
                <span className="text-slate-500 text-sm font-mono">[5]</span>
                <div className="flex-1">
                  <p className="text-slate-300 font-medium text-sm">run_backtest</p>
                  <p className="text-slate-400 text-xs">Sharpe 0.52 — below target, drawdown 22%</p>
                </div>
                <span className="text-slate-400 text-sm font-mono">0.52</span>
              </div>
              <div className="flex items-start gap-4 p-3 rounded-lg bg-slate-950/30 border border-slate-700/20 hover:border-slate-600/40 transition-colors">
                <span className="text-slate-500 text-sm font-mono">[6]</span>
                <div className="flex-1">
                  <p className="text-slate-300 font-medium text-sm">apply_rule_changes</p>
                  <p className="text-slate-400 text-xs">Added ADX &gt; 25 filter to reduce noise in choppy markets</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 rounded-lg bg-slate-950/30 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
                <span className="text-slate-500 text-sm font-mono">[7]</span>
                <div className="flex-1">
                  <p className="text-slate-300 font-medium text-sm">run_backtest</p>
                  <p className="text-slate-400 text-xs">Sharpe improved to 0.85 ✓ — drawdown reduced to 19%</p>
                </div>
                <span className="text-emerald-400 text-sm font-bold">0.85 ✓</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700/30">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider">Best Sharpe</p>
                  <p className="text-white font-bold text-lg">0.85</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider">Total Cost</p>
                  <p className="text-white font-bold text-lg">$0.31</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider">Next Step</p>
                  <p className="text-slate-300 text-sm">RSI confirmation</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Signals & Strategy Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Signals - Premium */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-300 p-6">
            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full -mr-20 -mt-20"></div>
            <div className="relative z-10">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <span>📡</span> Latest Signals
              </h3>
              <div className="space-y-3">
                {signals.slice(0, 3).map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-950/30 border border-slate-700/30 hover:border-slate-600/50 transition-colors group">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-slate-800/50 flex items-center justify-center font-bold text-white text-sm">
                        {signal.coin.substring(0, 2)}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{signal.coin}</p>
                        <p className="text-slate-400 text-xs">RSI+MACD</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-bold text-sm ${
                        signal.direction === "BUY"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {signal.direction === "BUY" ? "↗" : "↘"} {signal.direction}
                      </div>
                      <p className={`text-sm font-bold mt-1 ${signal.ai_score > 75 ? "text-emerald-400" : "text-yellow-400"}`}>
                        {signal.ai_score}%
                      </p>
                    </div>
                  </div>
                ))}
                {signals.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <p className="text-sm">Waiting for TradingView data...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Strategy Performance - Premium */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-300 p-6">
            <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/5 rounded-full -mr-20 -mt-20"></div>
            <div className="relative z-10">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <span>📈</span> Strategy Performance
              </h3>
              <div className="space-y-3">
                {strategies.map((strategy) => (
                  <div key={strategy.id} className="p-4 rounded-lg bg-slate-950/30 border border-slate-700/30 hover:border-slate-600/50 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-white font-semibold">{strategy.name}</p>
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        strategy.status === "live"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}>
                        {strategy.status === "live" ? "🔴 Live" : "📋 Paper"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider">Sharpe</p>
                        <p className={`font-bold text-lg ${strategy.sharpe_ratio >= 1.0 ? "text-emerald-400" : "text-orange-400"}`}>
                          {strategy.sharpe_ratio.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider">Profit</p>
                        <p className="text-white font-bold text-lg">{strategy.profit_factor.toFixed(2)}x</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider">Return</p>
                        <p className="text-emerald-400 font-bold text-lg">+{(strategy.profit_factor * 20).toFixed(0)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Premium CTA Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          <Link
            href="/live-signals"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 p-[1px] transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20"
          >
            <div className="relative z-10 bg-gradient-to-r from-blue-600 to-blue-700 group-hover:from-blue-500 group-hover:to-blue-600 rounded-xl px-6 py-4 text-center transition-all duration-300">
              <p className="text-white font-bold text-lg flex items-center justify-center gap-2">
                <span>📡</span> View All Signals
              </p>
              <p className="text-blue-100 text-sm mt-1">Monitor real-time trading signals</p>
            </div>
          </Link>

          <Link
            href="/strategies"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 p-[1px] transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20"
          >
            <div className="relative z-10 bg-gradient-to-r from-purple-600 to-purple-700 group-hover:from-purple-500 group-hover:to-purple-600 rounded-xl px-6 py-4 text-center transition-all duration-300">
              <p className="text-white font-bold text-lg flex items-center justify-center gap-2">
                <span>⚡</span> Manage Strategies
              </p>
              <p className="text-purple-100 text-sm mt-1">Edit and optimize your trading algorithms</p>
            </div>
          </Link>
        </div>
      </div>
    </MainLayout>
  );
}
