import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react';

interface ComparisonData {
  backtest: {
    total_trades: number;
    win_rate: number;
    sharpe_ratio: number;
    total_return: number;
    max_drawdown: number;
    profit_factor: number;
  };
  paper_trading: {
    total_trades: number;
    win_rate: number;
    sharpe_ratio: number;
    total_return: number;
    max_drawdown: number;
    profit_factor: number;
  };
  divergence: {
    win_rate_diff: number;
    sharpe_diff: number;
    return_diff: number;
    max_drawdown_diff: number;
    summary: string;
  };
}

interface BacktestComparisonProps {
  strategyId: string;
  sessionId: string;
}

export const BacktestComparison: React.FC<BacktestComparisonProps> = ({
  strategyId,
  sessionId,
}) => {
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchComparison();
    const interval = setInterval(fetchComparison, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, [strategyId, sessionId]);

  const fetchComparison = async () => {
    try {
      const params = new URLSearchParams({
        strategy_id: strategyId,
        session_id: sessionId,
      });

      const response = await fetch(`/api/analysis/backtest-vs-paper?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch comparison');

      const data = await response.json();
      setComparison(data.comparison);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading comparison...</div>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">{error}</div>;
  if (!comparison) return <div className="text-center py-8">No comparison data available</div>;

  const MetricRow: React.FC<{
    label: string;
    backtest: number;
    paper: number;
    unit?: string;
    isGoodWhenHigher?: boolean;
  }> = ({ label, backtest, paper, unit = '', isGoodWhenHigher = true }) => {
    const diff = paper - backtest;
    const isPositive = isGoodWhenHigher ? diff > 0 : diff < 0;
    const showPositive = Math.abs(diff) > 0.01;

    return (
      <tr className="border-b hover:bg-gray-50">
        <td className="p-3 font-semibold text-gray-700">{label}</td>
        <td className="p-3 text-center font-mono">{backtest.toFixed(2)}{unit}</td>
        <td className="p-3 text-center font-mono">{paper.toFixed(2)}{unit}</td>
        <td className="p-3 text-center">
          {showPositive && (
            <span className={`flex items-center justify-center gap-1 font-semibold ${
              isPositive ? 'text-green-700' : 'text-red-700'
            }`}>
              {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {isPositive ? '+' : ''}{diff.toFixed(2)}{unit}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const divergenceColor = comparison.divergence.summary.includes('aligns well')
    ? 'bg-green-50 border-green-200'
    : 'bg-yellow-50 border-yellow-200';

  const divergenceIcon = comparison.divergence.summary.includes('aligns well')
    ? <CheckCircle className="text-green-600" size={20} />
    : <AlertCircle className="text-yellow-600" size={20} />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Backtest vs Paper Trading</h2>

      {/* Divergence Summary */}
      <div className={`border rounded p-4 flex items-start gap-3 ${divergenceColor}`}>
        {divergenceIcon}
        <div className="flex-1">
          <div className="font-semibold text-gray-800">Performance Analysis</div>
          <div className="text-sm text-gray-700 mt-1">{comparison.divergence.summary}</div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-3 text-left font-semibold">Metric</th>
              <th className="p-3 text-center font-semibold">Backtest</th>
              <th className="p-3 text-center font-semibold">Paper Trading</th>
              <th className="p-3 text-center font-semibold">Difference</th>
            </tr>
          </thead>
          <tbody>
            <MetricRow
              label="Total Trades"
              backtest={comparison.backtest.total_trades}
              paper={comparison.paper_trading.total_trades}
              isGoodWhenHigher={true}
            />
            <MetricRow
              label="Win Rate"
              backtest={comparison.backtest.win_rate}
              paper={comparison.paper_trading.win_rate}
              unit="%"
              isGoodWhenHigher={true}
            />
            <MetricRow
              label="Sharpe Ratio"
              backtest={comparison.backtest.sharpe_ratio}
              paper={comparison.paper_trading.sharpe_ratio}
              isGoodWhenHigher={true}
            />
            <MetricRow
              label="Total Return"
              backtest={comparison.backtest.total_return}
              paper={comparison.paper_trading.total_return}
              unit="%"
              isGoodWhenHigher={true}
            />
            <MetricRow
              label="Max Drawdown"
              backtest={comparison.backtest.max_drawdown}
              paper={comparison.paper_trading.max_drawdown}
              unit="%"
              isGoodWhenHigher={false}
            />
            <MetricRow
              label="Profit Factor"
              backtest={comparison.backtest.profit_factor}
              paper={comparison.paper_trading.profit_factor === 999 ? Infinity : comparison.paper_trading.profit_factor}
              isGoodWhenHigher={true}
            />
          </tbody>
        </table>
      </div>

      {/* Interpretation Guide */}
      <div className="border rounded p-4 bg-blue-50">
        <h3 className="font-semibold text-gray-800 mb-2">How to Interpret Results</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>✓ <strong>Aligned results:</strong> Paper trading is performing as expected</li>
          <li>⚠ <strong>Lower win rate:</strong> May indicate slippage or execution issues</li>
          <li>⚠ <strong>Higher drawdown:</strong> Could be due to real market volatility</li>
          <li>✓ <strong>Similar Sharpe:</strong> Good risk-adjusted returns match backtest</li>
        </ul>
      </div>

      {/* Divergence Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4 bg-gray-50">
          <div className="text-sm font-semibold text-gray-600 uppercase">Win Rate Divergence</div>
          <div className="text-2xl font-bold mt-2">{comparison.divergence.win_rate_diff > 0 ? '+' : ''}{comparison.divergence.win_rate_diff.toFixed(2)}%</div>
        </div>
        <div className="border rounded p-4 bg-gray-50">
          <div className="text-sm font-semibold text-gray-600 uppercase">Sharpe Divergence</div>
          <div className="text-2xl font-bold mt-2">{comparison.divergence.sharpe_diff > 0 ? '+' : ''}{comparison.divergence.sharpe_diff.toFixed(2)}</div>
        </div>
        <div className="border rounded p-4 bg-gray-50">
          <div className="text-sm font-semibold text-gray-600 uppercase">Return Divergence</div>
          <div className="text-2xl font-bold mt-2">{comparison.divergence.return_diff > 0 ? '+' : ''}{comparison.divergence.return_diff.toFixed(2)}%</div>
        </div>
        <div className="border rounded p-4 bg-gray-50">
          <div className="text-sm font-semibold text-gray-600 uppercase">Drawdown Divergence</div>
          <div className="text-2xl font-bold mt-2">{comparison.divergence.max_drawdown_diff > 0 ? '+' : ''}{comparison.divergence.max_drawdown_diff.toFixed(2)}%</div>
        </div>
      </div>
    </div>
  );
};
