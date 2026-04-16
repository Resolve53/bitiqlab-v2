/**
 * Strategy Analysis Page
 * Detailed analysis of a single strategy with metrics, charts, and backtest history
 */

import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import PerformanceMetricsCard from "@/components/PerformanceMetricsCard";
import EquityCurveChart from "@/components/EquityCurveChart";
import BacktestHistoryTable from "@/components/BacktestHistoryTable";

interface AnalysisData {
  strategy_id: string;
  name: string;
  description: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  current_metrics: {
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_return: number;
  };
  risk_metrics: {
    sortino_ratio: number;
    calmar_ratio: number;
    recovery_factor: number;
    var_95: number;
  };
  recent_backtests: Array<{
    id: string;
    timestamp: string;
    duration_days: number;
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
  }>;
  equity_curve: Array<{
    timestamp: string;
    value: number;
  }>;
}

export default function StrategyAnalysisPage() {
  const router = useRouter();
  const { id } = router.query;
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
        const response = await fetch(`${apiUrl}/api/strategies/${id}/analysis`);

        if (!response.ok) {
          throw new Error("Failed to fetch analysis");
        }

        const data = await response.json();
        setAnalysis(data.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analysis");
        setAnalysis(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <button
              onClick={() => router.back()}
              className="text-emerald-400 hover:text-emerald-300 mb-4 font-semibold transition"
            >
              ← Back
            </button>
            <h1 className="text-4xl font-bold text-white">Loading Analysis...</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-slate-400">Fetching strategy analysis data...</p>
        </main>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <button
              onClick={() => router.back()}
              className="text-emerald-400 hover:text-emerald-300 mb-4 font-semibold transition"
            >
              ← Back
            </button>
            <h1 className="text-4xl font-bold text-white">Error</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-6">
            <p className="text-red-300">{error || "Failed to load strategy analysis"}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="text-emerald-400 hover:text-emerald-300 mb-4 font-semibold transition"
          >
            ← Back
          </button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-white">{analysis.name}</h1>
              <p className="mt-2 text-slate-400">{analysis.description}</p>
              <div className="mt-3 flex gap-4 text-sm text-slate-400">
                <span>📊 {analysis.symbol}</span>
                <span>⏱️ {analysis.timeframe}</span>
                <span>💰 {analysis.market_type}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Equity Curve */}
        <section>
          <EquityCurveChart
            data={analysis.equity_curve}
            loading={false}
          />
        </section>

        {/* Performance Metrics */}
        <section>
          <PerformanceMetricsCard
            metrics={analysis.current_metrics}
            riskMetrics={analysis.risk_metrics}
          />
        </section>

        {/* Backtest History */}
        <section>
          <BacktestHistoryTable
            backtests={analysis.recent_backtests}
            loading={false}
          />
        </section>

        {/* Additional Info */}
        <section className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">📌 About This Strategy</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300">
            <div>
              <p className="text-slate-400 font-semibold mb-2">Entry Rules</p>
              <p>Based on technical indicators and market conditions analysis</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold mb-2">Exit Rules</p>
              <p>Dynamic take-profit and stop-loss based on position metrics</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold mb-2">Risk Management</p>
              <p>Position sizing adjusted based on recent volatility</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold mb-2">Performance</p>
              <p>
                {analysis.current_metrics.total_return > 0
                  ? "Historically profitable strategy"
                  : "Strategy in testing phase"}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
