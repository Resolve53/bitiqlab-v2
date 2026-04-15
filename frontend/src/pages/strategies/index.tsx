import { useEffect, useState } from "react";
import axios from "axios";

interface Strategy {
  id: string;
  name: string;
  description: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  leverage: number;
  status: string;
  current_sharpe?: number;
  current_max_drawdown?: number;
  backtest_count: number;
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Strategies</h1>
            <p className="mt-2 text-gray-600">Manage and monitor trading strategies</p>
          </div>
          <a
            href="/strategies/new"
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
          >
            New Strategy
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">Error: {error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Loading strategies...</p>
          </div>
        ) : strategies.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">No strategies yet</p>
            <a
              href="/strategies/new"
              className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
            >
              Create First Strategy
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {strategies.map((strategy) => (
              <StrategyCard key={strategy.id} strategy={strategy} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface StrategyCardProps {
  strategy: Strategy;
}

function StrategyCard({ strategy }: StrategyCardProps) {
  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    backtested: "bg-blue-100 text-blue-800",
    optimized: "bg-green-100 text-green-800",
    paper_trading: "bg-purple-100 text-purple-800",
    approved: "bg-emerald-100 text-emerald-800",
    disabled: "bg-red-100 text-red-800",
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900">{strategy.name}</h3>
          <p className="text-gray-600 text-sm mt-1">{strategy.description}</p>

          <div className="mt-4 flex gap-4 text-sm text-gray-600">
            <span>📊 {strategy.symbol}</span>
            <span>⏱️ {strategy.timeframe}</span>
            <span>💰 {strategy.market_type}</span>
            <span>📈 Leverage: {strategy.leverage}x</span>
          </div>

          {strategy.current_sharpe && (
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">Sharpe Ratio</p>
                <p className="text-lg font-bold text-gray-900">
                  {strategy.current_sharpe.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Max Drawdown</p>
                <p className="text-lg font-bold text-gray-900">
                  {(strategy.current_max_drawdown! * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Backtests</p>
                <p className="text-lg font-bold text-gray-900">
                  {strategy.backtest_count}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="ml-4">
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
              statusColors[strategy.status] || "bg-gray-100 text-gray-800"
            }`}
          >
            {strategy.status}
          </span>

          <div className="mt-4 space-y-2">
            <a
              href={`/strategies/${strategy.id}`}
              className="block text-center text-blue-500 hover:text-blue-700 font-semibold text-sm"
            >
              View Details
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
