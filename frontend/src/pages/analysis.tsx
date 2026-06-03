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
}

export default function AnalysisPage() {
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ strategies: StrategyRow[] }>("/api/dashboard/strategies-summary")
      .then((d) => setStrategies(d.strategies || []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Analysis"
        subtitle="Cross-strategy performance from live backend data."
      />
      {error && <p className="text-red-300 text-sm mb-4">{error}</p>}
      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {strategies.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"
            >
              <h3 className="font-semibold text-white">{s.name}</h3>
              <p className="text-sm text-slate-400 mt-1">{s.symbol}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-500">Trades</p>
                  <p className="text-white">{s.trade_count}</p>
                </div>
                <div>
                  <p className="text-slate-500">P&L</p>
                  <p
                    className={
                      s.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {s.total_pnl.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Win rate</p>
                  <p className="text-white">{Number(s.win_rate).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-slate-500">Sharpe</p>
                  <p className="text-white">
                    {Number(s.current_sharpe).toFixed(2)}
                  </p>
                </div>
              </div>
              <Link
                href={`/strategies/${s.id}/analysis`}
                className="inline-block mt-4 text-sm text-cyan-400 hover:text-cyan-300"
              >
                Deep dive →
              </Link>
            </div>
          ))}
          {strategies.length === 0 && (
            <p className="text-slate-500 col-span-2">No strategies to analyze.</p>
          )}
        </div>
      )}
    </>
  );
}
