import { useEffect, useState } from "react";
import axios from "axios";
import MainLayout from "@/components/MainLayout";

interface StrategyMetrics {
  strategy_id: string;
  strategy_name: string;
  win_rate: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  avg_profit: number;
  total_pnl: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

export default function Analysis() {
  const [metrics, setMetrics] = useState<StrategyMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await axios.get(`${apiUrl}/api/analysis/metrics`);
      setMetrics(response.data.data || []);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout title="Analysis">
      <div className="space-y-6">
        {/* Performance Overview */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-6">Strategy Performance</h2>

          {loading ? (
            <div className="text-slate-400 text-center py-8">Loading metrics...</div>
          ) : metrics.length === 0 ? (
            <div className="text-slate-400 text-center py-8">
              No strategy metrics available yet. Create and run strategies to see performance data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Strategy</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Win Rate</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Total Trades</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Avg Profit</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Total P&L</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Sharpe Ratio</th>
                    <th className="text-right py-3 px-4 text-slate-300 font-semibold">Max Drawdown</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric) => (
                    <tr key={metric.strategy_id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                      <td className="py-4 px-4 text-white">{metric.strategy_name}</td>
                      <td className={`text-right py-4 px-4 font-semibold ${
                        metric.win_rate >= 50 ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {metric.win_rate.toFixed(1)}%
                      </td>
                      <td className="text-right py-4 px-4 text-slate-300">{metric.total_trades}</td>
                      <td className={`text-right py-4 px-4 font-semibold ${
                        metric.avg_profit >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}>
                        ${metric.avg_profit.toFixed(2)}
                      </td>
                      <td className={`text-right py-4 px-4 font-semibold ${
                        metric.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}>
                        ${metric.total_pnl.toLocaleString()}
                      </td>
                      <td className="text-right py-4 px-4 text-slate-300">{metric.sharpe_ratio.toFixed(2)}</td>
                      <td className={`text-right py-4 px-4 ${
                        metric.max_drawdown <= -10 ? "text-red-400" : "text-orange-400"
                      }`}>
                        {metric.max_drawdown.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Strategies */}
        {metrics.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Best Performing */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">Best Performing Strategy</h3>
              {(() => {
                const best = metrics.reduce((prev, current) =>
                  current.total_pnl > prev.total_pnl ? current : prev
                );
                return (
                  <div className="space-y-2">
                    <p className="text-slate-300">{best.strategy_name}</p>
                    <p className="text-3xl font-bold text-emerald-400">${best.total_pnl.toLocaleString()}</p>
                    <p className="text-sm text-slate-400">{best.win_rate.toFixed(1)}% win rate</p>
                  </div>
                );
              })()}
            </div>

            {/* Highest Win Rate */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">Highest Win Rate</h3>
              {(() => {
                const best = metrics.reduce((prev, current) =>
                  current.win_rate > prev.win_rate ? current : prev
                );
                return (
                  <div className="space-y-2">
                    <p className="text-slate-300">{best.strategy_name}</p>
                    <p className="text-3xl font-bold text-blue-400">{best.win_rate.toFixed(1)}%</p>
                    <p className="text-sm text-slate-400">{best.winning_trades} / {best.total_trades} trades</p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
