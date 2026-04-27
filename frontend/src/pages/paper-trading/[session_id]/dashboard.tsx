import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";

interface Trade {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  timestamp: string;
  pnl?: number;
}

interface OpenPosition {
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pl: number;
}

interface SessionStats {
  session_id: string;
  strategy_id: string;
  strategy_name: string;
  status: string;
  exchange: string;
  is_testnet: boolean;
  initial_balance: number;
  current_balance: number;
  total_pl: number;
  pl_percentage: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  trades: Trade[];
  open_positions: OpenPosition[];
}

export default function PaperTradingDashboard() {
  const router = useRouter();
  const { session_id } = router.query;
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoTrade, setAutoTrade] = useState(true);
  const [monitoring, setMonitoring] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!session_id) return;

    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [session_id]);

  const fetchStats = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await axios.get(
        `${apiUrl}/api/paper-trading/${session_id}/status`
      );
      setStats(response.data.data);
      setError(null);
    } catch (err) {
      console.error("Error fetching stats:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  };

  const handleStartMonitoring = async () => {
    try {
      setMonitoring(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      await axios.post(`${apiUrl}/api/paper-trading/monitor`, {
        session_id,
        auto_trade: autoTrade,
      });
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start monitoring");
      setMonitoring(false);
    }
  };

  const handleStopMonitoring = async () => {
    setMonitoring(false);
    // In a real app, you'd have a stop endpoint
  };

  const handleRegisterTradingView = async () => {
    if (!stats) return;
    try {
      setRegistering(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      await axios.post(`${apiUrl}/api/paper-trading/register-tradingview`, {
        strategy_id: stats.strategy_id,
        session_id: session_id,
      });
      setRegistered(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register with TradingView");
      setRegistered(false);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading paper trading dashboard...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-red-400">Session not found</div>
      </div>
    );
  }

  const isProfit = stats.total_pl >= 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-white">
                {stats.strategy_name} - Paper Trading
              </h1>
              <p className="mt-2 text-slate-400">
                Real-time simulation with Binance testnet
              </p>
            </div>
            <div className="flex gap-3">
              {!monitoring ? (
                <button
                  onClick={handleStartMonitoring}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg transition"
                >
                  ▶️ Start Monitoring
                </button>
              ) : (
                <button
                  onClick={handleStopMonitoring}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg transition"
                >
                  ⏹️ Stop Monitoring
                </button>
              )}
              <button
                onClick={() => router.push("/strategies")}
                className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-300">Error: {error}</p>
          </div>
        )}

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Initial Balance</p>
            <p className="text-2xl font-bold text-white">
              ${stats.initial_balance.toLocaleString()}
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Current Balance</p>
            <p className="text-2xl font-bold text-emerald-400">
              ${stats.current_balance.toLocaleString()}
            </p>
          </div>

          <div className={`rounded-lg p-6 border ${isProfit ? "bg-emerald-900/20 border-emerald-700" : "bg-red-900/20 border-red-700"}`}>
            <p className="text-slate-400 text-sm mb-2">Total P&L</p>
            <p className={`text-2xl font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
              ${Math.abs(stats.total_pl).toLocaleString()} ({stats.pl_percentage.toFixed(2)}%)
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Win Rate</p>
            <p className="text-2xl font-bold text-blue-400">
              {stats.win_rate.toFixed(1)}% ({stats.winning_trades}W/{stats.losing_trades}L)
            </p>
          </div>
        </div>

        {/* Auto-Trade Settings */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Trading Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="checkbox"
                id="autoTrade"
                checked={autoTrade}
                onChange={(e) => setAutoTrade(e.target.checked)}
                className="w-5 h-5 rounded"
                disabled={monitoring}
              />
              <label htmlFor="autoTrade" className="text-white">
                Auto-execute trades when signals are generated
              </label>
              {monitoring && (
                <span className="ml-4 text-emerald-400 text-sm font-semibold">
                  ● Monitoring Active
                </span>
              )}
            </div>

            <div className="pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-sm mb-3">
                {registered
                  ? "✓ Strategy registered with TradingView - Monitoring real-time chart signals"
                  : "Connect to TradingView to automatically add technical indicators and monitor live chart signals"
                }
              </p>
              <button
                onClick={handleRegisterTradingView}
                disabled={registering || registered}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  registered
                    ? "bg-emerald-900/30 text-emerald-400 cursor-default"
                    : registering
                    ? "bg-slate-600 text-slate-400 cursor-wait"
                    : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                }`}
              >
                {registered ? "✓ Registered with TradingView" : registering ? "Registering..." : "Register with TradingView"}
              </button>
            </div>
          </div>
        </div>

        {/* Open Positions */}
        {stats.open_positions.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Open Positions</h2>
            <div className="space-y-4">
              {stats.open_positions.map((position) => (
                <div
                  key={position.symbol}
                  className="bg-slate-700/50 border border-slate-600 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-white">{position.symbol}</p>
                      <p className="text-sm text-slate-400">
                        {position.quantity.toFixed(4)} @ ${position.entry_price.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white">
                        ${position.current_price.toFixed(2)}
                      </p>
                      <p
                        className={`text-sm font-semibold ${position.unrealized_pl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {position.unrealized_pl >= 0 ? "+" : ""}{position.unrealized_pl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade History */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Trade History</h2>
          {stats.trades.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No trades yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 text-sm font-semibold pb-3">
                      Symbol
                    </th>
                    <th className="text-left text-slate-400 text-sm font-semibold pb-3">
                      Side
                    </th>
                    <th className="text-left text-slate-400 text-sm font-semibold pb-3">
                      Quantity
                    </th>
                    <th className="text-left text-slate-400 text-sm font-semibold pb-3">
                      Price
                    </th>
                    <th className="text-left text-slate-400 text-sm font-semibold pb-3">
                      Time
                    </th>
                    {stats.trades.some((t) => t.pnl) && (
                      <th className="text-left text-slate-400 text-sm font-semibold pb-3">
                        P&L
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {stats.trades.map((trade) => (
                    <tr key={trade.id} className="border-b border-slate-700 hover:bg-slate-700/20 transition">
                      <td className="py-3 text-white">{trade.symbol}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-1 rounded text-sm font-semibold ${trade.side === "BUY" ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}
                        >
                          {trade.side}
                        </span>
                      </td>
                      <td className="py-3 text-white">{trade.quantity.toFixed(4)}</td>
                      <td className="py-3 text-white">${trade.price.toFixed(2)}</td>
                      <td className="py-3 text-slate-400 text-sm">
                        {new Date(trade.timestamp).toLocaleTimeString()}
                      </td>
                      {stats.trades.some((t) => t.pnl) && (
                        <td className="py-3">
                          {trade.pnl !== undefined && (
                            <span
                              className={`font-semibold ${trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                            >
                              {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
