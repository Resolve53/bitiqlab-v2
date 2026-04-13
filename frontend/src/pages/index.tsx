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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Bitiq Lab Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Autonomous Trading Strategy Research Platform
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            title="Total Strategies"
            value={metrics?.total_strategies || 0}
            loading={loading}
            color="bg-blue-50"
          />
          <MetricCard
            title="Active Paper Trading"
            value={metrics?.active_paper_trading || 0}
            loading={loading}
            color="bg-green-50"
          />
          <MetricCard
            title="Approved Strategies"
            value={metrics?.approved_strategies || 0}
            loading={loading}
            color="bg-purple-50"
          />
          <MetricCard
            title="Avg Sharpe Ratio"
            value={metrics?.average_sharpe.toFixed(2) || "0.00"}
            loading={loading}
            color="bg-orange-50"
          />
          <MetricCard
            title="Total Backtests"
            value={metrics?.total_backtests || 0}
            loading={loading}
            color="bg-pink-50"
          />
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ActionCard
              title="Generate Strategy"
              description="Create a new strategy using AI"
              href="/strategies/new"
              color="bg-blue-500"
            />
            <ActionCard
              title="Run Backtest"
              description="Test a strategy on historical data"
              href="/strategies"
              color="bg-green-500"
            />
            <ActionCard
              title="Start Paper Trading"
              description="Validate on Binance testnet"
              href="/paper-trading"
              color="bg-purple-500"
            />
            <ActionCard
              title="View Strategies"
              description="Browse all strategies"
              href="/strategies"
              color="bg-orange-500"
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">Error: {error}</p>
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
}

function MetricCard({ title, value, loading, color }: MetricCardProps) {
  return (
    <div className={`${color} rounded-lg p-6 shadow-sm`}>
      <p className="text-gray-600 text-sm font-medium">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">
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
      className={`${color} hover:shadow-lg transition-shadow rounded-lg p-6 text-white`}
    >
      <h3 className="font-bold text-lg">{title}</h3>
      <p className="text-sm opacity-90 mt-1">{description}</p>
    </a>
  );
}
