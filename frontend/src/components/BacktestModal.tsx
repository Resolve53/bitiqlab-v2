import { useState } from "react";

interface BacktestModalProps {
  strategyId: string;
  symbol: string;
  onClose: () => void;
  onSuccess: (results: any) => void;
}

export default function BacktestModal({
  strategyId,
  symbol,
  onClose,
  onSuccess,
}: BacktestModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coins, setCoins] = useState(symbol);
  const [window, setWindow] = useState("12m");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [results, setResults] = useState<any>(null);

  const handleRunBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

      const response = await fetch(`${apiUrl}/api/backtest/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          strategy_id: strategyId,
          window,
          start_date: startDate,
          end_date: endDate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Backtest failed");
      }

      const data = await response.json();
      setResults(data.data);
      onSuccess(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  if (results) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
          <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">Backtest Results</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-2xl transition"
            >
              ×
            </button>
          </div>

          <div className="p-6 grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-slate-400">Sharpe Ratio</p>
              <p className="text-3xl font-bold text-emerald-400">
                {results.sharpe_ratio?.toFixed(2) || "N/A"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Max Drawdown</p>
              <p className="text-3xl font-bold text-red-400">
                {results.max_drawdown ? (results.max_drawdown * 100).toFixed(2) : "N/A"}%
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Win Rate</p>
              <p className="text-3xl font-bold text-blue-400">
                {results.win_rate ? (results.win_rate * 100).toFixed(1) : "N/A"}%
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Total Return</p>
              <p className="text-3xl font-bold text-purple-400">
                {results.total_return ? (results.total_return * 100).toFixed(2) : "N/A"}%
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Total Trades</p>
              <p className="text-3xl font-bold text-white">
                {results.total_trades || 0}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Profit Factor</p>
              <p className="text-3xl font-bold text-slate-300">
                {results.profit_factor?.toFixed(2) || "N/A"}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-700 p-6 flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition"
            >
              Close
            </button>
            <button
              onClick={() => setResults(null)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg transition"
            >
              Run Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-xl w-full">
        <div className="border-b border-slate-700 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Run Backtest</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl transition"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleRunBacktest} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Time Window
            </label>
            <select
              value={window}
              onChange={(e) => setWindow(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            >
              <option value="3m">Last 3 Months</option>
              <option value="6m">Last 6 Months</option>
              <option value="12m">Last 12 Months</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Or enter custom dates below
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Start Date (Optional)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              End Date (Optional)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Additional Coins (Optional)
            </label>
            <input
              type="text"
              value={coins}
              onChange={(e) => setCoins(e.target.value)}
              placeholder="e.g., BTCUSDT, ETHUSDT, BNBUSDT"
              className="w-full bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
            <p className="text-xs text-slate-500 mt-1">
              Comma-separated list. Backtest will run on all coins.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition disabled:opacity-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-2 rounded-lg transition"
            >
              {loading ? "Running Backtest..." : "Run Backtest"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
