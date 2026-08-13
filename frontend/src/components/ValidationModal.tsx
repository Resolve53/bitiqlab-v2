import { useState } from "react";
import { apiPath } from "@/lib/api";

interface ValidationModalProps {
  strategyId: string;
  symbol: string;
  onClose: () => void;
}

function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return `${(n * 100).toFixed(digits)}%`;
}

function num(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return n.toFixed(digits);
}

function statusColor(status: string): string {
  if (status === "pass") return "text-emerald-400";
  if (status === "conditional") return "text-amber-300";
  return "text-red-400";
}

export default function ValidationModal({
  strategyId,
  symbol,
  onClose,
}: ValidationModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState("12m");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [results, setResults] = useState<any>(null);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(apiPath("/api/backtest/validate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId,
          strategy_id: strategyId,
          symbol,
          window,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          initialCapital: 10000,
          commissionPct: 0.05,
          slippagePct: 0.02,
          config: {
            trainPct: 0.6,
            validationPct: 0.2,
            testPct: 0.2,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Validation failed");
      }
      setResults(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  if (results) {
    const chrono = results.chronological;
    const gate = results.gate || {
      status: results.status,
      reasons: results.reasons,
      checks: results.checks,
      score: results.score,
    };
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white">Validation Report</h2>
              <p className={`text-sm mt-1 font-semibold uppercase ${statusColor(gate.status)}`}>
                {gate.status} {gate.score != null ? `(score ${gate.score})` : ""}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {results.result_source || "REAL_VALIDATION"} · Phase 2 Anti-Overfitting
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white text-2xl transition"
            >
              ×
            </button>
          </div>

          <div className="p-6 space-y-6">
            {gate.reasons?.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Reasons</h3>
                <ul className="space-y-1 text-sm text-slate-300">
                  {gate.reasons.map((r: string) => (
                    <li key={r} className="border-l-2 border-amber-500/50 pl-2">
                      {r}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Train / Validation / Test
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                {(["train", "validation", "test"] as const).map((name) => {
                  const seg = chrono?.[name];
                  return (
                    <div
                      key={name}
                      className="rounded-lg border border-slate-700 bg-slate-900/60 p-3"
                    >
                      <p className="uppercase text-xs text-slate-500">{name}</p>
                      <p className="text-white mt-1">
                        Exp {num(seg?.metrics?.expectancy)} · PF{" "}
                        {num(seg?.metrics?.profitFactor)}
                      </p>
                      <p className="text-slate-400 text-xs mt-1">
                        {seg?.tradeCount ?? 0} trades · {seg?.barCount ?? 0} bars
                      </p>
                      <p className="text-slate-500 text-[10px] mt-1">
                        DD {pct(seg?.metrics?.maxDrawdown)} · WR{" "}
                        {pct(seg?.metrics?.winRate)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Walk-forward
              </h3>
              <p className="text-sm text-slate-300">
                Windows: {results.walkForward?.windowCount ?? 0} · Profitable:{" "}
                {pct(results.walkForward?.profitableWindowPct)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Avg val expectancy{" "}
                {num(results.walkForward?.aggregate?.avgValidationExpectancy)} ·
                Avg PF retention{" "}
                {num(results.walkForward?.aggregate?.avgProfitFactorRetention)}
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Cost stress
              </h3>
              <ul className="text-sm space-y-1">
                {(results.costStress?.cases || []).map((c: any) => (
                  <li
                    key={c.name}
                    className={
                      c.positiveExpectancy ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {c.name}: expectancy {num(c.metrics?.expectancy)}{" "}
                    {c.positiveExpectancy ? "✓" : "✗"}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Parameter sensitivity
              </h3>
              <p className="text-sm text-slate-300">
                Positive expectancy variants:{" "}
                {pct(results.sensitivity?.positiveExpectancyPct)} (
                {results.sensitivity?.variantCount ??
                  results.sensitivity?.variants?.length ??
                  0}{" "}
                variants)
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Regimes
              </h3>
              <p className="text-sm text-emerald-400">
                Works in: {(results.regimes?.worksIn || []).join(", ") || "—"}
              </p>
              <p className="text-sm text-red-400 mt-1">
                Fails in: {(results.regimes?.failsIn || []).join(", ") || "—"}
              </p>
            </section>

            {results.sampleIntegrity?.flags?.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-amber-300 mb-2">
                  Sample integrity
                </h3>
                <ul className="text-sm text-amber-200/90 space-y-1">
                  {results.sampleIntegrity.flags.map((f: string) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </section>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-white text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-lg w-full">
        <div className="border-b border-slate-700 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Run Validation</h2>
            <p className="text-sm text-slate-400 mt-1">
              Chronological split, walk-forward, sensitivity, cost stress, regimes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleRun} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-700/50 bg-red-900/30 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Window</label>
            <select
              value={window}
              onChange={(e) => setWindow(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
            >
              <option value="3m">3 months</option>
              <option value="6m">6 months</option>
              <option value="12m">12 months</option>
              <option value="24m">24 months</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Start (optional)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                End (optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Default split: train 60% / validation 20% / test 20%. Test set is never
            used for parameter selection.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-4 py-2 text-white font-medium"
          >
            {loading ? "Running validation…" : "Run Validation"}
          </button>
        </form>
      </div>
    </div>
  );
}
