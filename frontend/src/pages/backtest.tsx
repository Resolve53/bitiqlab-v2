import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { apiFetch, apiPath } from "@/lib/api";

export default function BacktestPage() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runBacktest() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(apiPath("/api/backtest/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy_id: "00000000-0000-0000-0000-000000000001",
          symbol,
          timeframe: "1h",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Backtest failed");
      setResult(JSON.stringify(json.data, null, 2));
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="Backtest" subtitle="Run a quick backtest via the backend API. Pick a real strategy ID from the strategies list for production use." />
      <div className="flex gap-2 mb-4">
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white" />
        <button onClick={runBacktest} disabled={loading} className="rounded-lg bg-cyan-600 px-4 py-2 text-white disabled:opacity-50">{loading ? "Running…" : "Run"}</button>
      </div>
      {result && <pre className="text-xs bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-auto text-slate-300">{result}</pre>}
    </>
  );
}
