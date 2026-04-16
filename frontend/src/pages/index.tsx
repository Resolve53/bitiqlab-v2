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
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          />
          <MetricCard
            title="Active Paper Trading"
            value={metrics?.active_paper_trading || 0}
            loading={loading}
          />
          <MetricCard
            title="Approved Strategies"
            value={metrics?.approved_strategies || 0}
            loading={loading}
          />
          <MetricCard
            title="Avg Sharpe Ratio"
            value={metrics?.average_sharpe.toFixed(2) || "0.00"}
            loading={loading}
          />
          <MetricCard
            title="Total Backtests"
            value={metrics?.total_backtests || 0}
            loading={loading}
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
            />
            <ActionCard
              title="Generate Strategy"
              description="Create strategy with Claude"
              href="/strategies/claude-generate"
            />
            <ActionCard
              title="Paper Trading"
              description="Validate on testnet"
              href="/paper-trading"
            />
            <ActionCard
              title="View Strategies"
              description="Browse all strategies"
              href="/strategies"
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-8 p-4 bg-red-900/20 border border-red-800 rounded-lg">
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
}

function MetricCard({ title, value, loading }: MetricCardProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 backdrop-blur">
      <p className="text-slate-400 text-sm font-medium">{title}</p>
      <p className="text-3xl font-bold text-emerald-400 mt-2">
        {loading ? "..." : value}
      </p>
    </div>
  );
}

interface ActionCardProps {
  title: string;
  description: string;
  href: string;
}

function ActionCard({ title, description, href }: ActionCardProps) {
  return (
    <a
      href={href}
      className="bg-slate-900/50 border border-emerald-500/30 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 transition-all rounded-lg p-6 text-white"
    >
      <h3 className="font-bold text-lg text-emerald-400">{title}</h3>
      <p className="text-sm text-slate-300 mt-1">{description}</p>
    </a>
  );
}
