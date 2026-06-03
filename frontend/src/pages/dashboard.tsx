import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

interface StrategyRow {
  id: string;
  name: string;
  symbol: string;
  status: string;
  trade_count: number;
  total_pnl: number;
  win_rate: number;
  current_sharpe: number;
  active_sessions: number;
  latest_session_id?: string;
}

interface DashboardData {
  totals: {
    strategies: number;
    total_trades: number;
    total_pnl: number;
    active_sessions: number;
  };
  strategies: StrategyRow[];
  recent_trades: Array<{
    id: string;
    strategy_id: string;
    symbol: string;
    side: string;
    entry_price: number;
    pnl?: number;
    entry_time: string;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [summary, dashMetrics] = await Promise.all([
        apiFetch<DashboardData>("/api/dashboard/strategies-summary"),
        apiFetch<Record<string, number>>("/api/dashboard/metrics").catch(
          () => null
        ),
      ]);
      setData(summary);
      setMetrics(dashMetrics);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  const totals = data?.totals;
  const totalPnl = totals?.total_pnl ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Strategy performance, paper trading P&L, and recent activity. Data comes from your Railway backend — TradingView is optional."
        actions={
          <Link
            href="/strategies/claude-generate"
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            New strategy
          </Link>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}. Set <code className="text-red-100">NEXT_PUBLIC_API_URL</code>{" "}
          to your Railway backend URL in Vercel.
        </div>
      )}

      {loading && !data ? (
        <p className="text-slate-400">Loading dashboard…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <StatCard label="Strategies" value={String(totals?.strategies ?? 0)} />
            <StatCard label="Paper trades" value={String(totals?.total_trades ?? 0)} />
            <StatCard
              label="Combined P&L"
              value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`}
              accent={totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <StatCard
              label="Active sessions"
              value={String(totals?.active_sessions ?? 0)}
            />
          </div>

          {metrics && (
            <p className="text-xs text-slate-500 mb-6">
              Approved strategies: {metrics.approved_strategies ?? 0} · Avg Sharpe:{" "}
              {(metrics.average_sharpe as number)?.toFixed?.(2) ?? "—"}
            </p>
          )}

          <section className="mb-10">
            <h2 className="text-lg font-semibold text-white mb-4">
              Strategy performance
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-800/80 text-slate-400 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Strategy</th>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trades</th>
                    <th className="px-4 py-3">P&L</th>
                    <th className="px-4 py-3">Sharpe</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(data?.strategies ?? []).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-white">{s.name}</td>
                      <td className="px-4 py-3 text-slate-400">{s.symbol}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-300">{s.trade_count}</td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          s.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {s.total_pnl >= 0 ? "+" : ""}
                        {s.total_pnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {Number(s.current_sharpe).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Link
                          href={`/strategies/${s.id}/trades`}
                          className="text-cyan-400 hover:text-cyan-300"
                        >
                          Trades
                        </Link>
                        <Link
                          href={`/strategies/${s.id}/analysis`}
                          className="text-slate-400 hover:text-white"
                        >
                          Analysis
                        </Link>
                        {s.latest_session_id && (
                          <Link
                            href={`/paper-trading/${s.latest_session_id}/dashboard`}
                            className="text-slate-400 hover:text-white"
                          >
                            Session
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!data?.strategies || data.strategies.length === 0) && (
                <p className="p-8 text-center text-slate-500">
                  No strategies yet.{" "}
                  <Link href="/strategies/new" className="text-cyan-400">
                    Create one
                  </Link>
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Recent trades</h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 divide-y divide-slate-800">
              {(data?.recent_trades ?? []).slice(0, 15).map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span className="text-white font-medium">{t.symbol}</span>
                  <span className="text-slate-400">{t.side}</span>
                  <span className="text-slate-400">
                    ${Number(t.entry_price).toFixed(2)}
                  </span>
                  <Link
                    href={`/strategies/${t.strategy_id}/trades`}
                    className="text-cyan-400 text-xs"
                  >
                    View strategy log
                  </Link>
                </div>
              ))}
              {(!data?.recent_trades || data.recent_trades.length === 0) && (
                <p className="p-6 text-center text-slate-500">No trades logged yet.</p>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${accent || "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-slate-700 text-slate-300",
    testing: "bg-blue-900/50 text-blue-300",
    approved: "bg-emerald-900/50 text-emerald-300",
    failed: "bg-red-900/50 text-red-300",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs ${
        colors[status] || colors.draft
      }`}
    >
      {status}
    </span>
  );
}
