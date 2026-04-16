/**
 * Metrics Comparison Table Component
 * Side-by-side comparison of strategy metrics
 */

interface StrategyMetrics {
  strategy_id: string;
  name: string;
  symbol: string;
  metrics: {
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_return: number;
  };
}

interface MetricsComparisonTableProps {
  strategies: StrategyMetrics[];
  bestStrategies: {
    best_sharpe: string;
    best_return: string;
    lowest_drawdown: string;
    best_win_rate: string;
  };
}

export default function MetricsComparisonTable({
  strategies,
  bestStrategies,
}: MetricsComparisonTableProps) {
  if (strategies.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center">
        <p className="text-slate-400">Select strategies to compare</p>
      </div>
    );
  }

  const isBest = (strategyId: string, metricType: keyof typeof bestStrategies) => {
    return bestStrategies[metricType] === strategyId;
  };

  const metricRow = (label: string, getValue: (s: StrategyMetrics) => number, unit: string = "", metricKey?: keyof typeof bestStrategies) => (
    <tr className="border-b border-slate-700/50">
      <td className="px-4 py-3 font-semibold text-slate-300">{label}</td>
      {strategies.map((strategy) => {
        const value = getValue(strategy);
        const isBestVal = metricKey && isBest(strategy.strategy_id, metricKey);
        return (
          <td
            key={strategy.strategy_id}
            className={`px-4 py-3 text-right font-semibold ${
              isBestVal
                ? "bg-emerald-900/30 text-emerald-300"
                : value < 0 && unit === "%"
                ? "text-red-400"
                : "text-slate-300"
            }`}
          >
            {value >= 0 && unit === "%" ? "+" : ""}
            {value.toFixed(2)}
            <span className="text-xs text-slate-400 ml-1">{unit}</span>
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-6 border-b border-slate-700">
        <h3 className="text-lg font-bold text-white">📊 Metrics Comparison</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/50 border-b border-slate-700">
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Metric</th>
              {strategies.map((strategy) => (
                <th
                  key={strategy.strategy_id}
                  className="px-4 py-3 text-right font-semibold text-slate-300"
                >
                  <div className="font-bold text-white">{strategy.name}</div>
                  <div className="text-xs text-slate-500">{strategy.symbol}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRow("Total Return", (s) => s.metrics.total_return, "%", "best_return")}
            {metricRow("Sharpe Ratio", (s) => s.metrics.sharpe_ratio, "", "best_sharpe")}
            {metricRow("Win Rate", (s) => s.metrics.win_rate, "%", "best_win_rate")}
            {metricRow("Profit Factor", (s) => s.metrics.profit_factor)}
            {metricRow("Max Drawdown", (s) => s.metrics.max_drawdown, "%", "lowest_drawdown")}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 bg-slate-900/50 border-t border-slate-700 text-xs text-slate-400">
        <p>✨ Highlighted cells indicate best performance in each metric</p>
      </div>
    </div>
  );
}
