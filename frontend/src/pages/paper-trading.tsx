import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { PageHeader } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { formatPnl } from "@/lib/trading-constants";
import SessionRecovery from "@/components/SessionRecovery";

interface TradeRow {
  id: string;
  session_id?: string;
  strategy_id?: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  exit_price?: number | null;
  current_price: number;
  pnl: number;
  pnl_percent: number;
  status: string;
  entry_time?: string;
  exit_time?: string;
}

interface Overview {
  totals: {
    active_positions: number;
    open_pnl: number;
    closed_trades: number;
    closed_pnl: number;
    total_pnl: number;
    active_sessions: number;
    total_sessions: number;
  };
  open_trades: TradeRow[];
  closed_trades: TradeRow[];
  sessions: Array<{
    session_id: string;
    strategy_id: string;
    session_name?: string;
    initial_balance: number;
    current_balance?: number;
    total_pnl?: number;
    status?: string;
  }>;
}

function formatTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function PaperTradingPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);


  async function handleDeleteSession(sessionId: string) {
    if (
      !confirm(
        "Permanently delete this session and all its trades? This cannot be undone."
      )
    ) {
      return;
    }
    try {
      setDeletingId(sessionId);
      await apiFetch(`/api/paper-trading/${sessionId}/delete`, {
        method: "DELETE",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete session");
    } finally {
      setDeletingId(null);
    }
  }

  async function load() {
    try {
      setError(null);
      const overview = await apiFetch<Overview>("/api/paper-trading/overview");
      setData(overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load paper trading data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const totals = data?.totals;
  const openTrades = data?.open_trades ?? [];
  const closedTrades = data?.closed_trades ?? [];
  const totalPnl = totals?.total_pnl ?? 0;
  const notional =
    openTrades.reduce(
      (s, t) => s + t.entry_price * t.quantity,
      0
    ) || 1;
  const totalPnlPct = (totalPnl / notional) * 100;

  return (
    <>
      <PageHeader
        title="Paper Trading"
        subtitle="Live Binance testnet trades from your database — not simulated demo numbers."
        actions={
          <Link
            href="/strategies"
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            Start from strategies
          </Link>
        }
      />

      <SessionRecovery
        onSessionSelect={(id) => router.push(`/paper-trading/${id}/dashboard`)}
      />

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !data && (
        <p className="text-slate-400 py-12 text-center">Loading real trade data…</p>
      )}

      {data && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Open positions"
              value={String(totals?.active_positions ?? 0)}
            />
            <StatCard
              label="Open P&amp;L"
              value={formatPnl(totals?.open_pnl)}
              accent={
                (totals?.open_pnl ?? 0) >= 0 ? "positive" : "negative"
              }
            />
            <StatCard
              label="Closed trades"
              value={String(totals?.closed_trades ?? 0)}
            />
            <StatCard
              label="Total P&amp;L"
              value={formatPnl(totalPnl)}
              sub={
                openTrades.length > 0
                  ? `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}% on open notional`
                  : undefined
              }
              accent={totalPnl >= 0 ? "positive" : "negative"}
            />
          </div>

          {totals && totals.total_sessions > 0 && (
            <p className="text-xs text-slate-500">
              {totals.active_sessions} active session
              {totals.active_sessions !== 1 ? "s" : ""} · {totals.total_sessions}{" "}
              total · monitoring uses top-20 coins when started from Strategies
            </p>
          )}

          <TradeSection
            title="Open positions"
            empty="No open paper trades yet. Start paper trading on a strategy to see live positions here."
            trades={openTrades}
            showPrices
          />

          <TradeSection
            title="Closed trades"
            empty="No closed trades yet."
            trades={closedTrades}
            showPrices={false}
          />

          {data.sessions.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">
                Recent sessions
              </h2>
              <div className="space-y-2">
                {data.sessions.map((s) => (
                  <div
                    key={s.session_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
                  >
                    <Link
                      href={`/paper-trading/${s.session_id}/dashboard`}
                      className="flex-1 hover:text-cyan-300"
                    >
                      <span className="text-sm text-white block">
                        {s.session_name || s.session_id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-slate-400">
                        ${Number(s.initial_balance).toLocaleString()} demo ·{" "}
                        {s.status || "active"}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(s.session_id)}
                      disabled={deletingId === s.session_id}
                      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {deletingId === s.session_id ? "…" : "Delete"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "positive" | "negative";
}) {
  const color =
    accent === "positive"
      ? "text-emerald-400"
      : accent === "negative"
        ? "text-red-400"
        : "text-white";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function TradeSection({
  title,
  empty,
  trades,
  showPrices,
}: {
  title: string;
  empty: string;
  trades: TradeRow[];
  showPrices: boolean;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      {trades.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {trade.symbol}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        trade.side === "BUY"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-red-500/20 text-red-300"
                      }`}
                    >
                      {trade.side}
                    </span>
                  </div>
                  {showPrices ? (
                    <p className="mt-1 text-sm text-slate-400">
                      {trade.quantity} @ ${trade.entry_price.toFixed(2)} → $
                      {trade.current_price.toFixed(2)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">
                      {formatTime(trade.exit_time || trade.entry_time)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatPnl(trade.pnl)}
                  </p>
                  <p
                    className={`text-xs ${
                      trade.pnl_percent >= 0
                        ? "text-emerald-400/80"
                        : "text-red-400/80"
                    }`}
                  >
                    {trade.pnl_percent >= 0 ? "+" : ""}
                    {trade.pnl_percent.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
