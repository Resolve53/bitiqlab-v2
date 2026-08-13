import { useState } from "react";
import { apiPath } from "@/lib/api";

interface ResearchModalProps {
  strategyId: string;
  symbol: string;
  onClose: () => void;
}

function num(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return n.toFixed(digits);
}

function statusColor(status: string | null | undefined): string {
  if (status === "pass" || status === "KEEP" || status === "validated_pass")
    return "text-emerald-400";
  if (status === "conditional" || status === "validated_conditional")
    return "text-amber-300";
  return "text-red-400";
}

export default function ResearchModal({
  strategyId,
  symbol,
  onClose,
}: ResearchModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState("12m");
  const [results, setResults] = useState<any>(null);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(apiPath("/api/research/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId,
          symbol,
          window,
          initialCapital: 10000,
          commissionPct: 0.05,
          slippagePct: 0.02,
          limits: { maxGenerations: 5, maxCandidates: 5 },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Research failed");
      }
      setResults(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setLoading(false);
    }
  };

  if (results) {
    const fv = results.finalValidation;
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white">Research Report</h2>
              <p className="text-xs text-slate-400 mt-1">
                {results.result_source || "REAL_RESEARCH"} · Outcome:{" "}
                {results.outcome}
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

          <div className="p-6 space-y-6">
            <p className="text-sm text-amber-200/90 border border-amber-700/40 rounded-lg p-3 bg-amber-950/30">
              Research results do not automatically activate or paper-trade a
              strategy.
            </p>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Baseline (TRAIN / VALIDATION)
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-xs text-slate-500 uppercase">Train</p>
                  <p className="text-white">
                    Exp {num(results.baseline?.train?.metrics?.expectancy)} · PF{" "}
                    {num(results.baseline?.train?.metrics?.profitFactor)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {results.baseline?.train?.tradeCount ?? 0} trades
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-xs text-slate-500 uppercase">Validation</p>
                  <p className="text-white">
                    Exp {num(results.baseline?.validation?.metrics?.expectancy)}{" "}
                    · PF{" "}
                    {num(results.baseline?.validation?.metrics?.profitFactor)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {results.baseline?.validation?.tradeCount ?? 0} trades
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Experiments
              </h3>
              <ul className="space-y-3">
                {(results.experiments || []).map((exp: any) => (
                  <li
                    key={exp.experimentId}
                    className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-300">
                        Gen {exp.generation} · {exp.mutation?.mutation_type || "—"}
                      </span>
                      <span
                        className={`font-semibold ${statusColor(exp.decision)}`}
                      >
                        {exp.decision}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {exp.hypothesis || "No hypothesis"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      TRAIN exp {num(exp.trainMetrics?.expectancy)} · VAL exp{" "}
                      {num(exp.validationMetrics?.expectancy)} · PF{" "}
                      {num(exp.validationMetrics?.profitFactor)}
                    </p>
                    {exp.rejectionReasons?.length > 0 && (
                      <ul className="mt-2 text-xs text-red-300/90 space-y-0.5">
                        {exp.rejectionReasons.map((r: string) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Research Champion
              </h3>
              {results.champion?.snapshotHash ? (
                <p className="text-sm text-emerald-300">
                  Version {results.champion.version} · hash{" "}
                  {String(results.champion.snapshotHash).slice(0, 12)}…
                </p>
              ) : (
                <p className="text-sm text-slate-400">No KEEP champion</p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Final Phase 2 validation
              </h3>
              {fv ? (
                <div>
                  <p
                    className={`text-lg font-semibold uppercase ${statusColor(
                      fv.status
                    )}`}
                  >
                    {fv.status}
                  </p>
                  <ul className="mt-2 text-xs text-slate-400 space-y-1">
                    {(fv.reasons || []).map((r: string) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Skipped (no KEEP candidate — TEST unused)
                </p>
              )}
            </section>

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
            <h2 className="text-2xl font-bold text-white">Run Research</h2>
            <p className="text-sm text-slate-400 mt-1">
              Controlled autoresearch — TEST holdout untouched until final
              confirmation
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
          <p className="text-xs text-slate-500">
            Max 5 generations / 5 candidates. One mutation per candidate. Does
            not activate or paper-trade automatically.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-2 text-white font-medium"
          >
            {loading ? "Running research…" : "Run Research"}
          </button>
        </form>
      </div>
    </div>
  );
}
