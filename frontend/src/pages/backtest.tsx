import { useEffect, useState } from "react";
import { apiUrl, getApiUrl } from "@/lib/api";
import axios from "axios";
import MainLayout from "@/components/MainLayout";

interface BacktestConfig {
  strategyId: string;
  startDate: string;
  endDate: string;
  symbol: string;
  timeframe: string;
}

interface BacktestResult {
  id: string;
  strategy_id: string;
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown: number;
  return_percent: number;
  status: string;
  started_at: string;
  completed_at: string;
}

export default function Backtest() {
  const [config, setConfig] = useState<BacktestConfig>({
    strategyId: "1",
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    symbol: "BTCUSDT",
    timeframe: "1h",
  });

  const [results, setResults] = useState<BacktestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBacktestHistory();
  }, []);

  const fetchBacktestHistory = async () => {
    try {
      // Mock backtest results
      const mockResults: BacktestResult[] = [
        {
          id: "1",
          strategy_id: "1",
          total_trades: 47,
          win_rate: 52.1,
          profit_factor: 2.15,
          sharpe_ratio: 1.78,
          max_drawdown: 12.4,
          return_percent: 28.5,
          status: "completed",
          started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          completed_at: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "2",
          strategy_id: "1",
          total_trades: 42,
          win_rate: 50.0,
          profit_factor: 1.92,
          sharpe_ratio: 1.45,
          max_drawdown: 15.2,
          return_percent: 22.3,
          status: "completed",
          started_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          completed_at: new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "3",
          strategy_id: "2",
          total_trades: 38,
          win_rate: 48.0,
          profit_factor: 1.82,
          sharpe_ratio: 1.42,
          max_drawdown: 18.6,
          return_percent: 19.8,
          status: "completed",
          started_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          completed_at: new Date(Date.now() - 13.5 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];
      setResults(mockResults);
    } catch (error) {
      console.error("Error fetching backtest history:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunBacktest = async () => {
    setRunning(true);
    try {
      const response = await axios.post(`/* removed */`, config).catch(() => null);
      if (response?.data?.data) {
        setResults([response.data.data, ...results]);
      }
    } catch (error) {
      console.error("Error running backtest:", error);
    } finally {
      setRunning(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-500/20 text-emerald-400";
      case "running":
        return "bg-blue-500/20 text-blue-400";
      case "failed":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-slate-500/20 text-slate-400";
    }
  };

  return (
    <MainLayout title="Backtest Engine">
      <div className="space-y-6">
        {/* Configuration Panel */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-6">BACKTEST CONFIGURATION</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Strategy Selection */}
            <div>
              <label className="block text-slate-400 text-sm mb-2">Strategy</label>
              <select
                value={config.strategyId}
                onChange={(e) => setConfig({ ...config, strategyId: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
              >
                <option value="1">ETH BB Breakout</option>
                <option value="2">BTC RSI+MACD</option>
                <option value="3">AVAX Momentum</option>
              </select>
            </div>

            {/* Symbol Selection */}
            <div>
              <label className="block text-slate-400 text-sm mb-2">Symbol</label>
              <select
                value={config.symbol}
                onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
              >
                <option value="BTCUSDT">BTC/USDT</option>
                <option value="ETHUSDT">ETH/USDT</option>
                <option value="AVAXUSDT">AVAX/USDT</option>
                <option value="SOLUSDT">SOL/USDT</option>
              </select>
            </div>

            {/* Timeframe Selection */}
            <div>
              <label className="block text-slate-400 text-sm mb-2">Timeframe</label>
              <select
                value={config.timeframe}
                onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
              >
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-slate-400 text-sm mb-2">Start Date</label>
              <input
                type="date"
                value={config.startDate}
                onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-slate-400 text-sm mb-2">End Date</label>
              <input
                type="date"
                value={config.endDate}
                onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={handleRunBacktest}
              disabled={running}
              className={`px-6 py-3 rounded font-bold transition ${
                running
                  ? "bg-slate-600 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {running ? "Running..." : "▶ Run Backtest"}
            </button>

            <button className="px-6 py-3 rounded font-bold bg-slate-700 hover:bg-slate-600 text-white transition">
              📊 Advanced Settings
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total Backtests</p>
            <p className="text-3xl font-bold text-white">{results.length}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Best Sharpe</p>
            <p className="text-3xl font-bold text-emerald-400">
              {Math.max(...results.map((r) => r.sharpe_ratio)).toFixed(2)}
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Avg Win Rate</p>
            <p className="text-3xl font-bold text-white">
              {(results.reduce((sum, r) => sum + r.win_rate, 0) / results.length).toFixed(1)}%
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Best Return</p>
            <p className="text-3xl font-bold text-emerald-400">
              +{Math.max(...results.map((r) => r.return_percent)).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Backtest History */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">BACKTEST HISTORY</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300">ID</th>
                  <th className="text-left py-3 px-4 text-slate-300">STRATEGY</th>
                  <th className="text-left py-3 px-4 text-slate-300">STATUS</th>
                  <th className="text-left py-3 px-4 text-slate-300">TRADES</th>
                  <th className="text-left py-3 px-4 text-slate-300">WIN RATE</th>
                  <th className="text-left py-3 px-4 text-slate-300">SHARPE</th>
                  <th className="text-left py-3 px-4 text-slate-300">PROFIT FACTOR</th>
                  <th className="text-left py-3 px-4 text-slate-300">RETURN</th>
                  <th className="text-left py-3 px-4 text-slate-300">MAX DD</th>
                  <th className="text-left py-3 px-4 text-slate-300">COMPLETED</th>
                </tr>
              </thead>
              <tbody>
                {results.length > 0 ? (
                  results.map((result) => (
                    <tr key={result.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-white font-bold"># {result.id}</td>
                      <td className="py-3 px-4 text-white">
                        {config.strategyId === result.strategy_id ? "ETH BB Breakout" : "Other Strategy"}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${getStatusColor(result.status)}`}>
                          {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white">{result.total_trades}</td>
                      <td className="py-3 px-4 text-white">{result.win_rate.toFixed(1)}%</td>
                      <td className={`py-3 px-4 font-bold ${result.sharpe_ratio >= 1.0 ? "text-emerald-400" : "text-red-400"}`}>
                        {result.sharpe_ratio.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-white">{result.profit_factor.toFixed(2)}</td>
                      <td className={`py-3 px-4 font-bold ${result.return_percent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {result.return_percent >= 0 ? "+" : ""}
                        {result.return_percent.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-red-400">-{result.max_drawdown.toFixed(1)}%</td>
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {new Date(result.completed_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="py-4 px-4 text-center text-slate-500">
                      No backtest results yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comparison & Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">PERFORMANCE METRICS</h3>
            <div className="space-y-3">
              {results.length > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Best Sharpe Ratio</span>
                    <span className="text-white font-bold">
                      {Math.max(...results.map((r) => r.sharpe_ratio)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Avg Profit Factor</span>
                    <span className="text-white font-bold">
                      {(results.reduce((sum, r) => sum + r.profit_factor, 0) / results.length).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Worst Drawdown</span>
                    <span className="text-red-400 font-bold">
                      -{Math.max(...results.map((r) => r.max_drawdown)).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Best Return</span>
                    <span className="text-emerald-400 font-bold">
                      +{Math.max(...results.map((r) => r.return_percent)).toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">💡 INSIGHTS</h3>
            <div className="space-y-2 text-slate-300 text-sm">
              <p>
                ✓ Strategy shows strong risk-adjusted returns with Sharpe ratio of {results[0]?.sharpe_ratio.toFixed(2)}.
              </p>
              <p>
                ✓ Win rate of {results[0]?.win_rate.toFixed(1)}% is above market average (50%).
              </p>
              <p>
                ⚠️ Max drawdown of {results[0]?.max_drawdown.toFixed(1)}% is acceptable for equity strategy.
              </p>
              <p>
                → Consider running with real capital if profit factor &gt; 1.5.
              </p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
