/**
 * Strategy Comparison Page
 * Compare multiple strategies side-by-side with metrics and rankings
 */

import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import StrategySelector from "@/components/StrategySelector";
import MetricsComparisonTable from "@/components/MetricsComparisonTable";
import RankingsView from "@/components/RankingsView";

interface Strategy {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
}

interface ComparisonData {
  strategies: Array<{
    strategy_id: string;
    name: string;
    symbol: string;
    timeframe: string;
    market_type: string;
    metrics: {
      sharpe_ratio: number;
      max_drawdown: number;
      win_rate: number;
      profit_factor: number;
      total_return: number;
    };
  }>;
  comparison_metadata: {
    best_sharpe: string;
    best_return: string;
    lowest_drawdown: string;
    best_win_rate: string;
  };
}

export default function StrategyComparePage() {
  const router = useRouter();
  const [allStrategies, setAllStrategies] = useState<Strategy[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all strategies on mount
  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
        const response = await fetch(`${apiUrl}/api/strategies`);

        if (!response.ok) {
          throw new Error("Failed to fetch strategies");
        }

        const data = await response.json();
        setAllStrategies(
          data.data.strategies.map((s: any) => ({
            id: s.id,
            name: s.name,
            symbol: s.symbol,
            timeframe: s.timeframe,
          }))
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load strategies");
      } finally {
        setLoading(false);
      }
    };

    fetchStrategies();
  }, []);

  // Load comparison data when selected IDs change
  useEffect(() => {
    if (selectedIds.length < 2) {
      setComparison(null);
      return;
    }

    const fetchComparison = async () => {
      try {
        setComparing(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
        const response = await fetch(
          `${apiUrl}/api/strategies/compare?ids=${selectedIds.join(",")}`
        );

        if (!response.ok) {
          throw new Error("Failed to compare strategies");
        }

        const data = await response.json();
        setComparison(data.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to compare");
        setComparison(null);
      } finally {
        setComparing(false);
      }
    };

    fetchComparison();
  }, [selectedIds]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-4xl font-bold text-white">Loading...</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-slate-400">Loading strategies...</p>
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
              <h1 className="text-4xl font-bold text-white">Compare Strategies</h1>
              <p className="mt-2 text-slate-400">
                Side-by-side comparison of strategy performance metrics
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Display */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Strategy Selector */}
        <section className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <StrategySelector
            allStrategies={allStrategies}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            disabled={comparing}
          />
        </section>

        {/* Comparison Results */}
        {comparison && !comparing && (
          <>
            {/* Metrics Table */}
            <section>
              <MetricsComparisonTable
                strategies={comparison.strategies}
                bestStrategies={comparison.comparison_metadata}
              />
            </section>

            {/* Rankings */}
            <section className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <RankingsView strategies={comparison.strategies} />
            </section>

            {/* Comparison Tips */}
            <section className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-emerald-300 mb-3">💡 Comparison Tips</h3>
              <ul className="space-y-2 text-emerald-200/80 text-sm">
                <li>• Look for strategies with consistent positive returns and low drawdowns</li>
                <li>• Sharpe ratio &gt; 1 is generally considered good risk-adjusted performance</li>
                <li>
                  • Compare strategies on the same symbol/timeframe for meaningful analysis
                </li>
                <li>• Win rate alone doesn't tell the whole story - check profit factor too</li>
                <li>• Diversify by combining strategies with low correlation</li>
              </ul>
            </section>
          </>
        )}

        {/* Empty State */}
        {!comparison && selectedIds.length === 0 && (
          <section className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-12 text-center">
            <p className="text-slate-400 text-lg">
              👉 Select 2-5 strategies above to start comparing
            </p>
          </section>
        )}

        {/* Loading State */}
        {comparing && (
          <section className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-12 text-center">
            <p className="text-slate-400">Comparing strategies...</p>
          </section>
        )}
      </main>
    </div>
  );
}
