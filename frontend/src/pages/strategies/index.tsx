import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import BacktestModal from "@/components/BacktestModal";
import PaperTradingModal from "@/components/PaperTradingModal";
import StrategyCard, {
  type StrategyLiveStats,
} from "@/components/StrategyCard";

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
  executable?: boolean;
  executability?: string;
}

interface SummaryRow {
  id: string;
  trade_count: number;
  total_pnl: number;
  active_sessions: number;
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [liveById, setLiveById] = useState<Record<string, StrategyLiveStats>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategyForBacktest, setSelectedStrategyForBacktest] =
    useState<Strategy | null>(null);
  const [selectedStrategyForPaperTrading, setSelectedStrategyForPaperTrading] =
    useState<Strategy | null>(null);

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      setLoading(true);
      const [list, summary] = await Promise.all([
        apiFetch<{ strategies: Strategy[] }>("/api/strategies"),
        apiFetch<{ strategies: SummaryRow[] }>(
          "/api/dashboard/strategies-summary"
        ).catch(() => ({ strategies: [] as SummaryRow[] })),
      ]);
      setStrategies(list.strategies || []);
      const map: Record<string, StrategyLiveStats> = {};
      for (const row of summary.strategies || []) {
        map[row.id] = {
          trade_count: row.trade_count,
          total_pnl: row.total_pnl,
          active_sessions: row.active_sessions,
        };
      }
      setLiveById(map);
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
      setStrategies((prev) =>
        prev.map((s) =>
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
      await fetchStrategies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete strategy");
    }
  };

  return (
    <>
      <PageHeader
        title="Strategies"
        subtitle="Paper trading uses $5,000 demo capital per session and monitors the top 20 USDT pairs on Binance testnet."
        actions={
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={async () => {
                if (
                  !confirm(
                    "Permanently delete ALL strategies previously marked as removed (failed)?"
                  )
                )
                  return;
                try {
                  const res = await apiFetch<{ purged: number }>(
                    "/api/strategies/purge-failed",
                    { method: "POST" }
                  );
                  alert(`Removed ${res.purged} archived strategies`);
                  await fetchStrategies();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Purge failed"
                  );
                }
              }}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              Clean archived
            </button>
            <Link
              href="/strategies/new"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Manual
            </Link>
            <Link
              href="/strategies/claude-generate"
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
            >
              New (AI)
            </Link>
          </div>
        }
      />
      <div>
        {error && (
          <div className="mb-4 rounded-lg border border-red-700/50 bg-red-900/30 p-4">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-center py-12 text-slate-400">Loading strategies…</p>
        ) : strategies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-4">No strategies yet</p>
            <Link
              href="/strategies/claude-generate"
              className="inline-block rounded-lg bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-500"
            >
              Create your first strategy
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {strategies.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                liveStats={liveById[strategy.id]}
                onRunBacktest={() => setSelectedStrategyForBacktest(strategy)}
                onStartPaperTrading={() =>
                  setSelectedStrategyForPaperTrading(strategy)
                }
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteStrategy}
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
            setStrategies((prev) =>
              prev.map((s) =>
                s.id === selectedStrategyForBacktest.id
                  ? {
                      ...s,
                      current_sharpe: results.sharpe_ratio ?? s.current_sharpe,
                      max_drawdown: results.max_drawdown ?? s.max_drawdown,
                      total_return: results.total_return ?? s.total_return,
                      win_rate: results.win_rate ?? s.win_rate,
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
          marketType={selectedStrategyForPaperTrading.market_type}
          onClose={() => setSelectedStrategyForPaperTrading(null)}
          onSuccess={() => {
            setSelectedStrategyForPaperTrading(null);
            fetchStrategies();
          }}
        />
      )}
    </>
  );
}
