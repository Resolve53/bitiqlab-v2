import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { PageHeader } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import BacktestModal from "@/components/BacktestModal";
import PaperTradingModal from "@/components/PaperTradingModal";
import MonitoringSettingsModal from "@/components/MonitoringSettingsModal";

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
  const [selectedStrategyForPaperTrading, setSelectedStrategyForPaperTrading] = useState<Strategy | null>(null);

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ strategies: Strategy[] }>("/api/strategies");
      setStrategies(data.strategies || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch strategies");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (strategyId: string, newStatus: string) => {
    try {
      await apiFetch(`/api/strategies/${strategyId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      // Update local state
      setStrategies(
        strategies.map((s) =>
          s.id === strategyId ? { ...s, status: newStatus } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update strategy");
    }
  };

  const handleDeleteStrategy = async (strategyId: string) => {
    try {
      await apiFetch(`/api/strategies/${strategyId}`, { method: "DELETE" });
      // Remove from local state - keep strategies with status 'failed' hidden
      setStrategies(strategies.filter((s) => s.id !== strategyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete strategy");
    }
  };

  return (
    <>
      <PageHeader
        title="Strategies"
        subtitle="Manage backtests, paper trading, and per-strategy trade logs."
        actions={
          <Link
            href="/strategies/claude-generate"
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            New strategy (AI)
          </Link>
        }
      />
      <div>
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
                onStartPaperTrading={() => setSelectedStrategyForPaperTrading(strategy)}
                onStatusChange={(strategyId, newStatus) => handleStatusChange(strategyId, newStatus)}
                onDelete={(strategyId) => handleDeleteStrategy(strategyId)}
              />
            ))}
          </div>
        )}
      </div>

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

      {selectedStrategyForPaperTrading && (
        <PaperTradingModal
          strategyId={selectedStrategyForPaperTrading.id}
          strategyName={selectedStrategyForPaperTrading.name}
          symbol={selectedStrategyForPaperTrading.symbol}
          timeframe={selectedStrategyForPaperTrading.timeframe}
          onClose={() => setSelectedStrategyForPaperTrading(null)}
          onSuccess={() => {
            setSelectedStrategyForPaperTrading(null);
            // Refresh strategies to show updated status
            fetchStrategies();
          }}
        />
      )}
    </>
  );
}

interface StrategyCardProps {
  strategy: Strategy;
  onRunBacktest: () => void;
  onStartPaperTrading: () => void;
  onStatusChange?: (strategyId: string, newStatus: string) => void;
  onDelete?: (strategyId: string) => void;
}

function StrategyCard({ strategy, onRunBacktest, onStartPaperTrading, onStatusChange, onDelete }: StrategyCardProps) {
  const router = useRouter();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [showMonitoringSettings, setShowMonitoringSettings] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const statusColors: Record<string, string> = {
    draft: "bg-slate-700/50 text-slate-300",
    testing: "bg-blue-900/50 text-blue-300",
    approved: "bg-emerald-900/50 text-emerald-300",
    failed: "bg-red-900/50 text-red-300",
    live: "bg-green-900/50 text-green-300",
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "removed") {
      if (confirm(`Delete strategy "${strategy.name}"? This cannot be undone.`)) {
        onDelete?.(strategy.id);
      }
    } else {
      onStatusChange?.(strategy.id, newStatus);
    }
    setShowStatusMenu(false);
  };

  const handleViewLiveTrading = async () => {
    try {
      setLoadingSession(true);
      const data = await apiFetch<{ sessions: Array<{ id: string }> }>(
        `/api/paper-trading/sessions?strategy_id=${strategy.id}&limit=1`
      );

      if (data.sessions?.length) {
        const session = data.sessions[0];
        router.push(`/paper-trading/${session.id}/dashboard`);
      } else {
        alert("No active trading session found. Start a paper trading session first.");
      }
    } catch (error) {
      console.error("Error fetching trading session:", error);
      alert("Could not find trading session. Make sure you have an active paper trading session.");
    } finally {
      setLoadingSession(false);
    }
  };

  const handleViewMonitoringSettings = async () => {
    try {
      const data = await apiFetch<{ sessions: Array<{ id: string }> }>(
        `/api/paper-trading/sessions?strategy_id=${strategy.id}&limit=1`
      );

      if (data.sessions?.length) {
        const session = data.sessions[0];
        setSessionId(session.id);
        setShowMonitoringSettings(true);
      } else {
        alert("No active trading session found. Start a paper trading session first.");
      }
    } catch (error) {
      console.error("Error fetching trading session:", error);
      alert("Could not find trading session.");
    }
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

        <div className="ml-4 flex flex-col gap-2 relative">
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={`w-full px-3 py-1 rounded-full text-sm font-semibold cursor-pointer hover:opacity-80 transition ${
                statusColors[strategy.status] || "bg-slate-700/50 text-slate-300"
              }`}
            >
              {strategy.status}
            </button>

            {showStatusMenu && (
              <div className="absolute top-full right-0 mt-2 bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => handleStatusChange("approved")}
                  className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-600 first:rounded-t-lg transition"
                >
                  🟢 Approved
                </button>
                <button
                  onClick={() => handleStatusChange("draft")}
                  className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-600 transition"
                >
                  ⚪ Draft
                </button>
                <button
                  onClick={() => handleStatusChange("testing")}
                  className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-600 transition"
                >
                  🔵 Testing
                </button>
                <button
                  onClick={() => onDelete && onDelete(strategy.id)}
                  className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-600 last:rounded-b-lg transition"
                >
                  🗑️ Remove
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleViewLiveTrading}
            disabled={loadingSession}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition"
            title="View live trading dashboard"
          >
            {loadingSession ? "⏳" : "👁️"} Live
          </button>

          <button
            onClick={handleViewMonitoringSettings}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition"
            title="View monitoring configuration"
          >
            ⚙️ Settings
          </button>

          <Link
            href={`/strategies/${strategy.id}/trades`}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition text-center"
          >
            Trade log
          </Link>
          <Link
            href={`/strategies/${strategy.id}/analysis`}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition text-center"
          >
            Analysis
          </Link>

          <button
            onClick={onRunBacktest}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition"
          >
            🔄 Run Backtest
          </button>

          <button
            onClick={onStartPaperTrading}
            className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition"
          >
            🚀 Paper Trading
          </button>
        </div>
      </div>

      {/* Monitoring Settings Modal */}
      <MonitoringSettingsModal
        isOpen={showMonitoringSettings}
        onClose={() => setShowMonitoringSettings(false)}
        sessionId={sessionId}
        strategyId={strategy.id}
      />
    </div>
  );
}
