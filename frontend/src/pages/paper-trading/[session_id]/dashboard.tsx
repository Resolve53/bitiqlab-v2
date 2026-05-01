import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Script from "next/script";
import MultiCoinMonitorWizard from "@/components/MultiCoinMonitorWizard";
import TradeHistoryAnalysis from "@/components/TradeHistoryAnalysis";
import { sessionStorageManager } from "@/lib/sessionStorage";

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

interface MonitorConfig {
  coin_count: number;
  custom_coins: string[];
  scan_frequency: number;
  position_size_per_coin: number;
  max_concurrent_positions: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  trading_type: "spot" | "futures";
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
  multi_coin_config?: MonitorConfig;
  coins_being_monitored?: string[];
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
  const [registrationData, setRegistrationData] = useState<any>(null);
  const [showMultiCoinWizard, setShowMultiCoinWizard] = useState(false);
  const [multiCoinConfig, setMultiCoinConfig] = useState<any>(null);
  const [monitoredCoins, setMonitoredCoins] = useState<string[]>([]);
  const [showTradeHistory, setShowTradeHistory] = useState(false);

  useEffect(() => {
    if (!session_id || typeof session_id !== "string") return;

    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [session_id]);

  // Continuous monitoring loop
  useEffect(() => {
    if (!monitoring || !session_id) return;

    const monitoringInterval = setInterval(() => {
      handleStartMonitoring();
    }, 5000); // Call monitor endpoint every 5 seconds

    return () => clearInterval(monitoringInterval);
  }, [monitoring, session_id]);

  const prevTradeCountRef = useRef(0);

  const fetchStats = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await axios.get(
        `${apiUrl}/api/paper-trading/${session_id}/status`
      );
      const stats = response.data.data;
      setStats(stats);

      // Load monitored coins from multi-coin config if available
      if (stats.coins_being_monitored && stats.coins_being_monitored.length > 0) {
        setMonitoredCoins(stats.coins_being_monitored);
        setMultiCoinConfig(stats.multi_coin_config);
        // Auto-enable monitoring if config exists
        if (stats.multi_coin_config) {
          setMonitoring(true);
        }
      }

      setError(null);

      // Save session settings to localStorage
      if (stats && typeof session_id === "string") {
        sessionStorageManager.saveSessionSettings({
          session_id,
          strategy_id: stats.strategy_id,
          symbol: stats.trades[0]?.symbol || "BTCUSDT",
          timeframe: "1h",
          initial_balance: stats.initial_balance,
          auto_trade: autoTrade,
          monitoring_enabled: monitoring,
          monitored_coins: monitoredCoins,
          created_at: Date.now(),
          last_updated: Date.now(),
        });

        // Detect new trades and create alerts
        if (stats.trades.length > prevTradeCountRef.current) {
          const newTrades = stats.trades.slice(prevTradeCountRef.current);
          newTrades.forEach((trade: Trade) => {
            sessionStorageManager.addAlert({
              id: "",
              session_id,
              type: "trade",
              title: `${trade.side} Order Executed`,
              message: `${trade.symbol}: ${trade.quantity} @ $${trade.price.toFixed(2)}`,
              timestamp: new Date(trade.timestamp).getTime(),
              read: false,
              data: trade,
            });
          });
          prevTradeCountRef.current = stats.trades.length;
        }
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  };

  const handleStartMonitoring = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await axios.post(`${apiUrl}/api/paper-trading/monitor`, {
        session_id,
        auto_trade: autoTrade,
      });
      console.log("[Monitor] Cycle completed:", response.data);
      // Refresh stats after monitoring cycle
      await fetchStats();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to monitor session";
      console.error("[Monitor] Error:", errorMsg);
      setError(errorMsg);
      // Don't disable monitoring on error - let it retry next cycle
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
      const response = await axios.post(`${apiUrl}/api/paper-trading/register-tradingview`, {
        strategy_id: stats.strategy_id,
        session_id: session_id,
      });
      setRegistered(true);
      setRegistrationData(response.data.data);
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
              <button
                onClick={() => setShowTradeHistory(!showTradeHistory)}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg transition flex items-center gap-2"
              >
                📊 {showTradeHistory ? "Hide" : "Show"} History
              </button>
              {!monitoring ? (
                <button
                  onClick={() => setShowMultiCoinWizard(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg transition flex items-center gap-2"
                >
                  🚀 Advanced Monitor
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

      {/* TradingView Chart Script */}
      <Script
        src="https://s3.tradingview.com/tv.js"
        strategy="lazyOnload"
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-300">Error: {error}</p>
          </div>
        )}

        {/* TradingView Chart */}
        {stats && (
          <div className="mb-8 bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
            <TradingViewChart symbol={stats.open_positions[0]?.symbol || "BTCUSDT"} />
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
                  ? "✓ Strategy registered with TradingView - Monitor live chart signals"
                  : "Connect to TradingView to automatically monitor live chart signals and execute trades"
                }
              </p>
              <div className="flex gap-3 items-center">
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
                {registered && registrationData?.tradingview_url && (
                  <a
                    href={registrationData.tradingview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition"
                  >
                    Open TradingView →
                  </a>
                )}
              </div>

              {registered && registrationData?.setup_guide && (
                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                  <p className="text-blue-300 text-sm font-semibold mb-2">📋 TradingView Setup Guide:</p>
                  <p className="text-blue-300/80 text-sm whitespace-pre-wrap">{registrationData.setup_guide}</p>
                </div>
              )}
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
        {/* Monitored Coins Section */}
        {monitoredCoins.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">🔍 Monitoring {monitoredCoins.length} Coins</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {monitoredCoins.map((coin) => (
                <div key={coin} className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-emerald-400 font-bold text-sm">{coin}</p>
                  <p className="text-slate-500 text-xs mt-1">scanning...</p>
                </div>
              ))}
            </div>

            {multiCoinConfig && (
              <div className="mt-4 p-4 bg-slate-700/50 border border-slate-600 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Scan Frequency</p>
                    <p className="text-white font-bold">{multiCoinConfig.scan_frequency}s</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Per-Coin Capital</p>
                    <p className="text-white font-bold">${multiCoinConfig.position_size_per_coin.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Stop Loss</p>
                    <p className="text-white font-bold">{multiCoinConfig.stop_loss_percent}%</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Take Profit</p>
                    <p className="text-white font-bold">{multiCoinConfig.take_profit_percent}%</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trade History & Analysis */}
        {showTradeHistory && (
          <div className="mt-8">
            <TradeHistoryAnalysis
              session_id={session_id as string}
              trades={stats.trades}
              onExportTrades={(trades) => {
                const csv = [
                  ["Symbol", "Side", "Quantity", "Price", "P&L", "Timestamp"],
                  ...trades.map((t) => [
                    t.symbol,
                    t.side,
                    t.quantity,
                    t.price,
                    t.pnl || "",
                    t.timestamp,
                  ]),
                ]
                  .map((row) => row.join(","))
                  .join("\n");

                const blob = new Blob([csv], { type: "text/csv" });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `trades_${session_id}_${Date.now()}.csv`;
                a.click();
              }}
            />
          </div>
        )}
        </div>
      </main>

      {/* Multi-Coin Monitor Wizard */}
      {showMultiCoinWizard && stats && (
        <MultiCoinMonitorWizard
          sessionId={session_id as string}
          strategyId={stats.strategy_id}
          tradingType={stats.exchange === "binance" ? "spot" : "futures"}
          initialBalance={stats.initial_balance}
          onClose={() => setShowMultiCoinWizard(false)}
          onStart={(config) => {
            setMultiCoinConfig(config);
            setMonitoredCoins(config.custom_coins || []);
            setMonitoring(true);
            setShowMultiCoinWizard(false);
            fetchStats();
          }}
        />
      )}
    </div>
  );
}

function TradingViewChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (typeof (window as any).TradingView !== "undefined") {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: "D",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "rgba(255, 0, 0, 0)",
          enable_publishing: false,
          withdateranges: true,
          allow_symbol_change: true,
          details: true,
          hotlist: true,
          calendar: false,
          studies: ["RSI", "MACD", "BB@tv-basicstudies"],
          container_id: "tradingview-chart",
        });
      }
    };
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [symbol]);

  return (
    <div>
      <div className="px-6 py-4 border-b border-slate-700 bg-slate-900">
        <h2 className="text-xl font-bold text-white">📈 Live Chart - {symbol}</h2>
        <p className="text-sm text-slate-400 mt-1">Real-time price action with technical indicators</p>
      </div>
      <div ref={containerRef} style={{ height: "500px" }} id="tradingview-chart" />
    </div>
  );
}
