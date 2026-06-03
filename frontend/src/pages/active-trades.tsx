import { useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

interface Trade {
  id: string;
  coin: string;
  symbol: string;
  side: string;
  entry_price: number;
  current_price: number;
  unrealized_pnl_usd: number;
  status: string;
}

export default function ActiveTradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, []);

  async function load() {
    try {
      const data = await apiFetch<{ trades: Trade[] }>("/api/trades?limit=100");
      setTrades((data.trades || []).filter((t) => t.status === "open"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }

  const totalPnL = trades.reduce((s, t) => s + (t.unrealized_pnl_usd || 0), 0);

  return (
    <>
      <PageHeader title="Active trades" subtitle="Open paper positions from the backend." />
      {error && <p className="text-red-300 text-sm mb-4">{error}</p>}
      <p className="text-sm text-slate-400 mb-4">Open: {trades.length} · Unrealized P&L: ${totalPnL.toFixed(2)}</p>
      {loading ? <p className="text-slate-400">Loading…</p> : (
        <div className="grid gap-3">
          {trades.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex justify-between">
              <span className="text-white font-medium">{t.symbol || t.coin}</span>
              <span className="text-slate-400">{t.side}</span>
              <span className={t.unrealized_pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"}>
                ${t.unrealized_pnl_usd?.toFixed(2)}
              </span>
            </div>
          ))}
          {trades.length === 0 && <p className="text-slate-500">No open trades.</p>}
        </div>
      )}
    </>
  );
}
