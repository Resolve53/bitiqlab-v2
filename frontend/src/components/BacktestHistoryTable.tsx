/**
 * Backtest History Table Component
 * Displays recent backtest runs with comparison
 */

interface BacktestResult {
  id: string;
  timestamp: string;
  duration_days: number;
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
}

interface BacktestHistoryTableProps {
  backtests: BacktestResult[];
  loading?: boolean;
}

export default function BacktestHistoryTable({
  backtests,
  loading,
}: BacktestHistoryTableProps) {
  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center">
        <p className="text-slate-400">Loading backtest history...</p>
      </div>
    );
  }

  if (!backtests || backtests.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center">
        <p className="text-slate-400">No backtests available</p>
      </div>
    );
  }

  // Sort by timestamp descending
  const sorted = [...backtests].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Find best values for highlighting
  const bestReturn = Math.max(...sorted.map((b) => b.total_return));
  const bestSharpe = Math.max(...sorted.map((b) => b.sharpe_ratio));
  const bestWinRate = Math.max(...sorted.map((b) => b.win_rate));
  const lowestDrawdown = Math.min(...sorted.map((b) => b.max_drawdown));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  };

  const isBest = (value: number, bestValue: number, isLowerBetter: boolean = false) => {
    if (isLowerBetter) {
      return value === bestValue ? "bg-emerald-900/30 text-emerald-300" : "";
    }
    return value === bestValue ? "bg-emerald-900/30 text-emerald-300" : "";
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-6 border-b border-slate-700">
        <h3 className="text-lg font-bold text-white">📋 Recent Backtest Runs</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50">
              <th className="px-6 py-3 text-left text-slate-300 font-semibold">Date</th>
              <th className="px-6 py-3 text-left text-slate-300 font-semibold">Duration</th>
              <th className="px-6 py-3 text-right text-slate-300 font-semibold">Total Return</th>
              <th className="px-6 py-3 text-right text-slate-300 font-semibold">Sharpe Ratio</th>
              <th className="px-6 py-3 text-right text-slate-300 font-semibold">Max Drawdown</th>
              <th className="px-6 py-3 text-right text-slate-300 font-semibold">Win Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {sorted.map((backtest) => (
              <tr
                key={backtest.id}
                className="hover:bg-slate-700/20 transition-colors"
              >
                <td className="px-6 py-4 text-slate-300">
                  {formatDate(backtest.timestamp)}
                </td>
                <td className="px-6 py-4 text-slate-300">
                  {backtest.duration_days} days
                </td>
                <td
                  className={`px-6 py-4 text-right font-semibold ${
                    backtest.total_return >= 0 ? "text-emerald-400" : "text-red-400"
                  } ${isBest(backtest.total_return, bestReturn)}`}
                >
                  {backtest.total_return >= 0 ? "+" : ""}
                  {backtest.total_return.toFixed(2)}%
                </td>
                <td
                  className={`px-6 py-4 text-right font-semibold text-slate-300 ${isBest(
                    backtest.sharpe_ratio,
                    bestSharpe
                  )}`}
                >
                  {backtest.sharpe_ratio.toFixed(2)}
                </td>
                <td
                  className={`px-6 py-4 text-right font-semibold text-red-400 ${isBest(
                    backtest.max_drawdown,
                    lowestDrawdown,
                    true
                  )}`}
                >
                  {backtest.max_drawdown.toFixed(2)}%
                </td>
                <td
                  className={`px-6 py-4 text-right font-semibold text-slate-300 ${isBest(
                    backtest.win_rate,
                    bestWinRate
                  )}`}
                >
                  {backtest.win_rate.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 bg-slate-900/50 border-t border-slate-700 text-xs text-slate-400">
        <p>💡 Highlighted cells show best performance in each metric</p>
      </div>
    </div>
  );
}
