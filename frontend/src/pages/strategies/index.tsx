import { useEffect, useState } from "react";
import axios from "axios";
import BacktestModal from "@/components/BacktestModal";

interface Strategy {
  id: string;
  name: string;
  description?: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  status: string;
  current_sharpe: number;
  max_drawdown: number;
  win_rate: number;
  confidence_score: number;
  backtest_count: number;
  winning_trades: number;
  losing_trades: number;
  total_return: number;
  created_at: string;
  updated_at: string;
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategyForBacktest, setSelectedStrategyForBacktest] = useState<Strategy | null>(null);

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/strategies`
      );
      setStrategies(response.data.data.strategies);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch strategies");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-white">Strategies</h1>
            <p className="mt-2 text-slate-400">Manage and monitor trading strategies</p>
          </div>
          <div className="flex gap-3">
            <a
              href="/trading"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              📈 View Trading
            </a>
            <a
              href="/strategies/compare"
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              🔄 Compare
            </a>
            <a
              href="/strategies/claude-generate"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              ✨ Claude AI
            </a>
            <a
              href="/strategies/new"
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              + Manual
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-300">Error: {error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <p className="text-slate-400">Loading strategies...</p>
          </div>
        ) : strategies.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-400 mb-4">No strategies yet</p>
            <a
              href="/strategies/claude-generate"
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              ✨ Generate First Strategy with Claude
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {strategies.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                onRunBacktest={() => setSelectedStrategyForBacktest(strategy)}
              />
            ))}
          </div>
        )}
      </main>

      {selectedStrategyForBacktest && (
        <BacktestModal
          strategyId={selectedStrategyForBacktest.id}
          symbol={selectedStrategyForBacktest.symbol}
          onClose={() => setSelectedStrategyForBacktest(null)}
          onSuccess={(results) => {
            // Update strategy with new metrics
            setStrategies(
              strategies.map((s) =>
                s.id === selectedStrategyForBacktest.id
                  ? {
                      ...s,
                      current_sharpe: results.sharpe_ratio || 0,
                      max_drawdown: results.max_drawdown || 0,
                      total_return: results.total_return || 0,
                      win_rate: results.win_rate || 0,
                      backtest_count: (s.backtest_count || 0) + 1,
                    }
                  : s
              )
            );
            setSelectedStrategyForBacktest(null);
          }}
        />
      )}
    </div>
  );
}

interface StrategyCardProps {
  strategy: Strategy;
  onRunBacktest: () => void;
}

function StrategyCard({ strategy, onRunBacktest }: StrategyCardProps) {
  const statusColors: Record<string, string> = {
    draft: "bg-slate-700/50 text-slate-300",
    testing: "bg-blue-900/50 text-blue-300",
    approved: "bg-emerald-900/50 text-emerald-300",
    failed: "bg-red-900/50 text-red-300",
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-emerald-500/50 transition">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white">{strategy.name}</h3>
          {strategy.description && (
            <p className="text-slate-400 text-sm mt-1">{strategy.description}</p>
          )}

          <div className="mt-4 flex gap-4 text-sm text-slate-400">
            <span>📊 {strategy.symbol}</span>
            <span>⏱️ {strategy.timeframe}</span>
            <span>💰 {strategy.market_type}</span>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-500">Sharpe Ratio</p>
              <p className="text-lg font-bold text-emerald-400">
                {strategy.current_sharpe.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Max Drawdown</p>
              <p className="text-lg font-bold text-slate-300">
                {(strategy.max_drawdown * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Win Rate</p>
              <p className="text-lg font-bold text-emerald-400">
                {strategy.win_rate.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Backtests</p>
              <p className="text-lg font-bold text-slate-300">
                {strategy.backtest_count}
              </p>
            </div>
          </div>
        </div>

        <div className="ml-4 flex flex-col gap-2">
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
              statusColors[strategy.status] || "bg-slate-700/50 text-slate-300"
            }`}
          >
            {strategy.status}
          </span>

          <a
            href={`/strategies/${strategy.id}/analysis`}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition text-center"
          >
            📊 Analysis
          </a>

          <button
            onClick={onRunBacktest}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition"
          >
            🔄 Run Backtest
          </button>
        </div>
      </div>
    </div>
  );
}
