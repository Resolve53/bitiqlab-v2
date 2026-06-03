import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

interface Trade {
  id: string;
  coin: string;
  symbol: string;
  side: string;
  entry_price: number;
  pnl?: number;
  status: string;
  entry_time?: string;
  strategy_id?: string;
}

export default function TradeHistoryPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filter, setFilter] = useState<"all" | "win" | "loss">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ trades: Trade[] }>("/api/trades?limit=200")
      .then((d) => setTrades(d.trades || []))
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = trades.filter((t) => {
    const pnl = Number(t.pnl) || 0;
    if (filter === "win") return pnl > 0;
    if (filter === "loss") return pnl < 0;
    return true;
  });

  return (
    <>
      <PageHeader title="Trade history" subtitle="All paper trades stored in Supabase." />
      <div className="flex gap-2 mb-6">
        {(["all", "win", "loss"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-sm ${filter === f ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400"}`}>{f}</button>
        ))}
      </div>
      {loading ? <p className="text-slate-400">Loading…</p> : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-800 px-4 py-3 flex flex-wrap gap-4 text-sm">
              <span className="text-white">{t.symbol || t.coin}</span>
              <span>{t.side}</span>
              <span className={(Number(t.pnl)||0) >= 0 ? "text-emerald-400" : "text-red-400"}>{t.pnl != null ? `$${Number(t.pnl).toFixed(2)}` : "—"}</span>
              {t.strategy_id && <Link href={`/strategies/${t.strategy_id}/trades`} className="text-cyan-400">Strategy log</Link>}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-slate-500">No trades.</p>}
        </div>
      )}
    </>
  );
}
