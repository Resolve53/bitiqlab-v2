import { useEffect, useState } from "react";
import axios from "axios";

interface DashboardMetrics {
  total_strategies: number;
  active_paper_trading: number;
  approved_strategies: number;
  average_sharpe: number;
  total_backtests: number;
  timestamp: string;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/metrics`
      );
      setMetrics(response.data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metrics");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-4xl font-bold text-white">Bitiq Lab Dashboard</h1>
          <p className="mt-2 text-slate-400">
            Autonomous Trading Strategy Research Platform
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Featured Claude Trading Section */}
        <div className="bg-gradient-to-r from-emerald-900/30 to-emerald-800/20 border border-emerald-700/50 rounded-lg p-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-3xl font-bold text-emerald-300 mb-2">🤖 Claude AI Trading</h2>
              <p className="text-emerald-200/80 mb-4">
                Watch Claude AI actively manage a live trading portfolio with real-time market analysis and autonomous trade execution
              </p>
              <a
                href="/trading"
                className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-lg transition"
              >
                View Live Trading Dashboard →
              </a>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            title="Total Strategies"
            value={metrics?.total_strategies || 0}
            loading={loading}
            color="bg-blue-900/30"
            textColor="text-blue-400"
          />
          <MetricCard
            title="Active Paper Trading"
            value={metrics?.active_paper_trading || 0}
            loading={loading}
            color="bg-emerald-900/30"
            textColor="text-emerald-400"
          />
          <MetricCard
            title="Approved Strategies"
            value={metrics?.approved_strategies || 0}
            loading={loading}
            color="bg-purple-900/30"
            textColor="text-purple-400"
          />
          <MetricCard
            title="Avg Sharpe Ratio"
            value={metrics?.average_sharpe.toFixed(2) || "0.00"}
            loading={loading}
            color="bg-orange-900/30"
            textColor="text-orange-400"
          />
          <MetricCard
            title="Total Backtests"
            value={metrics?.total_backtests || 0}
            loading={loading}
            color="bg-pink-900/30"
            textColor="text-pink-400"
          />
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ActionCard
              title="Claude Trading"
              description="Watch AI actively trading"
              href="/trading"
              color="bg-emerald-600 hover:bg-emerald-500"
            />
            <ActionCard
              title="Generate Strategy"
              description="Create strategy with AI"
              href="/strategies/claude-generate"
              color="bg-blue-600 hover:bg-blue-500"
            />
            <ActionCard
              title="Paper Trading"
              description="Validate on testnet"
              href="/paper-trading"
              color="bg-purple-600 hover:bg-purple-500"
            />
            <ActionCard
              title="View Strategies"
              description="Browse all strategies"
              href="/strategies"
              color="bg-slate-700 hover:bg-slate-600"
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-300">Error: {error}</p>
          </div>
        )}
      </main>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  loading: boolean;
  color: string;
  textColor: string;
}

function MetricCard({ title, value, loading, color, textColor }: MetricCardProps) {
  return (
    <div className={`${color} border border-slate-700 rounded-lg p-6`}>
      <p className="text-slate-400 text-sm font-medium">{title}</p>
      <p className={`text-3xl font-bold ${textColor} mt-2`}>
        {loading ? "..." : value}
      </p>
    </div>
  );
}

interface ActionCardProps {
  title: string;
  description: string;
  href: string;
  color: string;
}

function ActionCard({ title, description, href, color }: ActionCardProps) {
  return (
    <a
      href={href}
      className={`${color} border border-slate-700 rounded-lg p-6 text-white transition font-semibold`}
    >
      <h3 className="text-lg">{title}</h3>
      <p className="text-sm text-slate-300 mt-2">{description}</p>
    </a>
  );
}
