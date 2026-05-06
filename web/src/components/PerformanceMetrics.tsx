import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, BarChart3, AlertCircle } from 'lucide-react';

interface Statistics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  break_even_trades: number;
  win_rate: number;
  total_pnl: number;
  total_pnl_percent: number;
  avg_win: number;
  avg_loss: number;
  largest_win: number;
  largest_loss: number;
  profit_factor: number;
  expectancy: number;
  sharpe_ratio: number;
  max_drawdown: number;
  max_drawdown_percent: number;
  avg_duration_minutes: number;
  shortest_duration_minutes: number;
  longest_duration_minutes: number;
  avg_mfe: number;
  avg_mae: number;
  avg_efficiency: number;
  by_symbol: Record<string, {
    total_trades: number;
    win_rate: number;
    total_pnl: number;
  }>;
}

interface PerformanceMetricsProps {
  sessionId: string;
}

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ sessionId }) => {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatistics();
    const interval = setInterval(fetchStatistics, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [sessionId]);

  const fetchStatistics = async () => {
    try {
      const response = await fetch(`/api/paper-trading/${sessionId}/statistics`);
      if (!response.ok) throw new Error('Failed to fetch statistics');

      const data = await response.json();
      setStats(data.statistics);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading metrics...</div>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">{error}</div>;
  if (!stats) return <div className="text-center py-8">No data available</div>;

  const MetricCard: React.FC<{
    label: string;
    value: React.ReactNode;
    subtext?: string;
    highlight?: 'positive' | 'negative' | 'neutral';
  }> = ({ label, value, subtext, highlight = 'neutral' }) => {
    const bgColor = {
      positive: 'bg-green-50',
      negative: 'bg-red-50',
      neutral: 'bg-gray-50',
    }[highlight];

    const textColor = {
      positive: 'text-green-700',
      negative: 'text-red-700',
      neutral: 'text-gray-700',
    }[highlight];

    return (
      <div className={`${bgColor} border rounded p-4`}>
        <div className="text-sm text-gray-600 font-semibold uppercase">{label}</div>
        <div className={`text-2xl font-bold ${textColor} mt-2`}>{value}</div>
        {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
      </div>
    );
  };

  const healthScore = (
    stats.win_rate * 0.3 +
    Math.min(stats.profit_factor * 10, 100) * 0.3 +
    Math.max(0, 50 - Math.abs(stats.sharpe_ratio - 1) * 10) * 0.2 +
    Math.max(0, 100 - stats.max_drawdown_percent * 5) * 0.2
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Performance Metrics</h2>

      {/* Health Score */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600 font-semibold uppercase">Overall Health Score</div>
            <div className="text-4xl font-bold text-blue-700 mt-2">{healthScore.toFixed(0)}/100</div>
          </div>
          <BarChart3 size={40} className="text-blue-400" />
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Trades"
          value={stats.total_trades}
          highlight="neutral"
        />
        <MetricCard
          label="Win Rate"
          value={`${stats.win_rate.toFixed(1)}%`}
          subtext={`${stats.winning_trades}W / ${stats.losing_trades}L`}
          highlight={stats.win_rate > 50 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Total P&L"
          value={`$${stats.total_pnl.toFixed(2)}`}
          subtext={`${stats.total_pnl_percent > 0 ? '+' : ''}${stats.total_pnl_percent.toFixed(2)}%`}
          highlight={stats.total_pnl > 0 ? 'positive' : stats.total_pnl < 0 ? 'negative' : 'neutral'}
        />
        <MetricCard
          label="Profit Factor"
          value={stats.profit_factor === Infinity ? '∞' : stats.profit_factor.toFixed(2)}
          subtext="Win/Loss Ratio"
          highlight={stats.profit_factor > 1 ? 'positive' : 'negative'}
        />
      </div>

      {/* Risk Metrics */}
      <div className="border rounded p-6 bg-white">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertCircle size={20} />
          Risk Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Sharpe Ratio"
            value={stats.sharpe_ratio.toFixed(2)}
            subtext="Risk-adjusted return"
            highlight={stats.sharpe_ratio > 1 ? 'positive' : 'negative'}
          />
          <MetricCard
            label="Max Drawdown"
            value={`${stats.max_drawdown_percent.toFixed(2)}%`}
            subtext={`$${stats.max_drawdown.toFixed(2)}`}
            highlight={stats.max_drawdown_percent < 20 ? 'positive' : 'negative'}
          />
          <MetricCard
            label="Expectancy"
            value={`$${stats.expectancy.toFixed(2)}`}
            subtext="Average profit per trade"
            highlight={stats.expectancy > 0 ? 'positive' : 'negative'}
          />
        </div>
      </div>

      {/* Trade Analysis */}
      <div className="border rounded p-6 bg-white">
        <h3 className="text-lg font-semibold mb-4">Trade Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Average Win"
            value={`$${stats.avg_win.toFixed(2)}`}
            highlight="positive"
          />
          <MetricCard
            label="Average Loss"
            value={`$${Math.abs(stats.avg_loss).toFixed(2)}`}
            highlight="negative"
          />
          <MetricCard
            label="Largest Win/Loss"
            value={`${stats.largest_win > 0 ? '+' : ''}${stats.largest_win.toFixed(2)} / ${stats.largest_loss.toFixed(2)}`}
          />
          <MetricCard
            label="Avg Trade Duration"
            value={`${stats.avg_duration_minutes.toFixed(0)}m`}
            subtext={`${stats.shortest_duration_minutes.toFixed(0)}m - ${stats.longest_duration_minutes.toFixed(0)}m`}
          />
          <MetricCard
            label="Avg MFE"
            value={`$${stats.avg_mfe.toFixed(2)}`}
            subtext="Max favorable excursion"
          />
          <MetricCard
            label="Trade Efficiency"
            value={`${stats.avg_efficiency.toFixed(2)}x`}
            subtext="MFE / MAE ratio"
            highlight={stats.avg_efficiency > 1.5 ? 'positive' : 'negative'}
          />
        </div>
      </div>

      {/* By Symbol Breakdown */}
      {Object.keys(stats.by_symbol).length > 0 && (
        <div className="border rounded p-6 bg-white">
          <h3 className="text-lg font-semibold mb-4">Performance by Symbol</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Symbol</th>
                  <th className="border p-2 text-right">Trades</th>
                  <th className="border p-2 text-right">Win Rate</th>
                  <th className="border p-2 text-right">Total P&L</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_symbol).map(([symbol, data]) => (
                  <tr
                    key={symbol}
                    className={data.total_pnl > 0 ? 'bg-green-50' : data.total_pnl < 0 ? 'bg-red-50' : 'bg-white'}
                  >
                    <td className="border p-2 font-mono font-semibold">{symbol}</td>
                    <td className="border p-2 text-right">{data.total_trades}</td>
                    <td className="border p-2 text-right">{data.win_rate.toFixed(1)}%</td>
                    <td className="border p-2 text-right">
                      <span className={data.total_pnl > 0 ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                        ${data.total_pnl.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
