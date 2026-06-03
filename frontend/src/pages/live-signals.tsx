import { useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

interface Signal {
  id: string;
  coin: string;
  direction: string;
  entry_price: number;
  ai_score: number;
  reason: string;
  created_at: string;
}

export default function LiveSignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Signal[]>("/api/signals?limit=50")
      .then(setSignals)
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
    const i = setInterval(() => {
      apiFetch<Signal[]>("/api/signals?limit=50").then(setSignals).catch(() => {});
    }, 20000);
    return () => clearInterval(i);
  }, []);

  return (
    <>
      <PageHeader title="Live signals" subtitle="Recent BUY entries from paper trading (Binance-backed, no TradingView required)." />
      {loading ? <p className="text-slate-400">Loading…</p> : (
        <div className="space-y-3">
          {signals.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex justify-between">
                <span className="text-white font-medium">{s.coin}</span>
                <span className="text-cyan-400">Score {s.ai_score}</span>
              </div>
              <p className="text-sm text-slate-400 mt-1">{s.reason}</p>
              <p className="text-xs text-slate-500 mt-2">{new Date(s.created_at).toLocaleString()}</p>
            </div>
          ))}
          {signals.length === 0 && <p className="text-slate-500">No signals yet — run paper trading on a strategy.</p>}
        </div>
      )}
    </>
  );
}
