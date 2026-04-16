/**
 * Performance Metrics Card Component
 * Displays strategy metrics in a grid format
 */

interface MetricsData {
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  profit_factor: number;
  total_return: number;
}

interface RiskMetricsData {
  sortino_ratio: number;
  calmar_ratio: number;
  recovery_factor: number;
  var_95: number;
}

interface PerformanceMetricsCardProps {
  metrics: MetricsData;
  riskMetrics: RiskMetricsData;
}

export default function PerformanceMetricsCard({
  metrics,
  riskMetrics,
}: PerformanceMetricsCardProps) {
  const metricItem = (label: string, value: number | string, unit: string = "") => (
    <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-emerald-400">
        {typeof value === "number" ? value.toFixed(2) : value}
        <span className="text-sm text-slate-400 ml-1">{unit}</span>
      </p>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Return & Profitability Metrics */}
      <div>
        <h3 className="text-lg font-bold text-white mb-4">📈 Return & Profitability</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metricItem("Total Return", metrics.total_return, "%")}
          {metricItem("Profit Factor", metrics.profit_factor)}
          {metricItem("Win Rate", metrics.win_rate, "%")}
          {metricItem("Sharpe Ratio", metrics.sharpe_ratio)}
        </div>
      </div>

      {/* Risk Metrics */}
      <div>
        <h3 className="text-lg font-bold text-white mb-4">⚠️ Risk Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metricItem("Max Drawdown", metrics.max_drawdown, "%")}
          {metricItem("Sortino Ratio", riskMetrics.sortino_ratio)}
          {metricItem("Calmar Ratio", riskMetrics.calmar_ratio)}
          {metricItem("Recovery Factor", riskMetrics.recovery_factor)}
        </div>
      </div>

      {/* Interpretation Guide */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <p className="text-slate-300 text-sm">
          <strong>📊 Metric Guide:</strong>
          <br />
          <span className="text-slate-400">
            • <strong>Sharpe Ratio:</strong> Risk-adjusted returns (higher is better, &gt;1 is good)
            <br />
            • <strong>Max Drawdown:</strong> Largest peak-to-trough decline (lower is better)
            <br />
            • <strong>Win Rate:</strong> % of profitable trades (higher is better, &gt;50% needed)
            <br />
            • <strong>Profit Factor:</strong> Gross profit / gross loss (higher is better, &gt;1.5 is strong)
          </span>
        </p>
      </div>
    </div>
  );
}
