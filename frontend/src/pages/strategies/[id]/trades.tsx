import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

interface Trade {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  exit_price?: number;
  quantity: number;
  pnl?: number;
  status: string;
  entry_time: string;
  exit_time?: string;
  reason_entry?: string;
}

export default function StrategyTradesPage() {
  const router = useRouter();
  const { id } = router.query;
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategyName, setStrategyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    load(id);
  }, [id]);

  async function load(strategyId: string) {
    try {
      setLoading(true);
      const [tradeData, strategy] = await Promise.all([
        apiFetch<{ trades: Trade[] }>(
          `/api/trades?strategy_id=${strategyId}&limit=200`
        ),
        apiFetch<{ name: string }>(`/api/strategies/${strategyId}`).catch(
          () => ({ name: "Strategy" })
        ),
      ]);
      setTrades(tradeData.trades || []);
      setStrategyName(strategy.name || "Strategy");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trades");
    } finally {
      setLoading(false);
    }
  }

  const totalPnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);

  return (
    <>
      <PageHeader
        title={`Trade log — ${strategyName}`}
        subtitle="All paper trades recorded for this strategy from the backend database."
        actions={
          <>
            <Link
              href={`/strategies/${id}/analysis`}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Analysis
            </Link>
            <Link
              href="/strategies"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              All strategies
            </Link>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-6 flex gap-6 text-sm">
        <span className="text-slate-400">
          Trades: <strong className="text-white">{trades.length}</strong>
        </span>
        <span className="text-slate-400">
          Total P&L:{" "}
          <strong
            className={totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}
          >
            {totalPnl >= 0 ? "+" : ""}
            {totalPnl.toFixed(2)} USDT
          </strong>
        </span>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading trades…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/80 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Side</th>
                <th className="px-4 py-3 text-left">Price</th>
                <th className="px-4 py-3 text-left">Qty</th>
                <th className="px-4 py-3 text-left">P&L</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {trades.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-slate-400">
                    {t.entry_time
                      ? new Date(t.entry_time).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        t.side === "BUY" ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      {t.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white">
                    ${Number(t.entry_price).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {Number(t.quantity).toFixed(6)}
                  </td>
                  <td className="px-4 py-3">
                    {t.pnl != null ? (
                      <span
                        className={
                          Number(t.pnl) >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }
                      >
                        {Number(t.pnl).toFixed(2)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{t.status}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                    {t.reason_entry || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trades.length === 0 && (
            <p className="p-8 text-center text-slate-500">
              No trades yet. Start paper trading from the strategies list.
            </p>
          )}
        </div>
      )}
    </>
  );
}
