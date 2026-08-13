import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { apiFetch } from "@/lib/api";
import { PAPER_TRADING_DEFAULT_CAPITAL } from "@/lib/trading-constants";

interface PaperTradingModalProps {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  marketType?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type VersionRow = {
  id: string;
  version: number;
  snapshot_hash: string;
  source?: string;
  strategy_snapshot?: { symbol?: string; timeframe?: string };
};

type ValidationRow = {
  id: string;
  strategy_version?: number | null;
  status: string;
  symbol?: string;
  timeframe?: string;
  created_at?: string;
};

type ResearchRunRow = {
  id: string;
  final_candidate_version?: number | null;
  final_champion_version?: number | null;
  final_validation_id?: string | null;
  status?: string;
};

export default function PaperTradingModal({
  strategyId,
  strategyName,
  symbol,
  timeframe,
  marketType = "spot",
  onClose,
  onSuccess,
}: PaperTradingModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [validations, setValidations] = useState<ValidationRow[]>([]);
  const [researchRuns, setResearchRuns] = useState<ResearchRunRow[]>([]);

  const [strategyVersionId, setStrategyVersionId] = useState("");
  const [validationId, setValidationId] = useState("");
  const [researchRunId, setResearchRunId] = useState("");
  const [acknowledgeConditional, setAcknowledgeConditional] = useState(false);
  const [initialCapital, setInitialCapital] = useState(
    PAPER_TRADING_DEFAULT_CAPITAL
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      setError(null);
      try {
        const data = await apiFetch<{
          versions: VersionRow[];
          validations: ValidationRow[];
          researchRuns: ResearchRunRow[];
        }>(`/api/paper-forward/versions?strategyId=${encodeURIComponent(strategyId)}`);
        if (cancelled) return;
        setVersions(data.versions || []);
        setValidations(data.validations || []);
        setResearchRuns(data.researchRuns || []);
        const firstPass = (data.validations || []).find(
          (v) => v.status === "pass" || v.status === "conditional"
        );
        const matchingVersion = (data.versions || []).find(
          (v) =>
            firstPass?.strategy_version == null ||
            Number(v.version) === Number(firstPass.strategy_version)
        );
        if (matchingVersion) setStrategyVersionId(matchingVersion.id);
        if (firstPass) setValidationId(firstPass.id);
        const run = (data.researchRuns || []).find(
          (r) => r.final_validation_id === firstPass?.id
        );
        if (run) setResearchRunId(run.id);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load eligible versions"
          );
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [strategyId]);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === strategyVersionId) || null,
    [versions, strategyVersionId]
  );
  const selectedValidation = useMemo(
    () => validations.find((v) => v.id === validationId) || null,
    [validations, validationId]
  );

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{
        session: { id: string };
        notice?: string;
      }>("/api/paper-forward/sessions", {
        method: "POST",
        body: JSON.stringify({
          strategyId,
          strategyVersionId,
          validationId,
          researchRunId: researchRunId || undefined,
          initialCapital,
          acknowledgeConditional,
        }),
      });
      setNotice(
        data.notice ||
          "Paper Forward Engine pending / not executing trades yet"
      );
      setSubmitted(true);
      setTimeout(() => {
        onSuccess();
        router.push(`/paper-trading/${data.session.id}/dashboard`);
      }, 1200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create paper session"
      );
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Session created</h2>
          <p className="mt-2 text-sm text-amber-200/90">
            {notice ||
              "Paper Forward Engine pending / not executing trades yet"}
          </p>
          <p className="mt-4 text-xs text-slate-500">Opening session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-xl border border-slate-700/80 bg-[#0d1219] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            Start paper trading
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            disabled={loading}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleCreateSession} className="space-y-5 p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Phase 4A creates an immutable session only. No live-forward
            execution or exchange orders yet.
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Strategy
            </p>
            <p className="mt-1 text-white font-medium">{strategyName}</p>
            <p className="mt-1 text-sm text-slate-400">
              Reference: {symbol} · {timeframe} · {marketType}
            </p>
          </div>

          {loadingMeta ? (
            <p className="text-sm text-slate-400">Loading versions…</p>
          ) : (
            <>
              <label className="block text-sm text-slate-300">
                Immutable version
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={strategyVersionId}
                  onChange={(e) => setStrategyVersionId(e.target.value)}
                  required
                >
                  <option value="">Select version…</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} · {v.source || "snapshot"} ·{" "}
                      {v.snapshot_hash?.slice(0, 10)}…
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-300">
                Phase 2 validation
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={validationId}
                  onChange={(e) => setValidationId(e.target.value)}
                  required
                >
                  <option value="">Select validation…</option>
                  {validations.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.status.toUpperCase()} · ver{" "}
                      {v.strategy_version ?? "?"} · {v.id.slice(0, 8)}…
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-300">
                Research run (optional)
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={researchRunId}
                  onChange={(e) => setResearchRunId(e.target.value)}
                >
                  <option value="">None</option>
                  {researchRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.status || "run"} · champ v
                      {r.final_candidate_version ??
                        r.final_champion_version ??
                        "?"} · {r.id.slice(0, 8)}…
                    </option>
                  ))}
                </select>
              </label>

              {selectedVersion && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-300 space-y-1">
                  <p>
                    Version: <strong>v{selectedVersion.version}</strong>
                  </p>
                  <p className="break-all">
                    Snapshot hash: {selectedVersion.snapshot_hash}
                  </p>
                  <p>
                    Validation:{" "}
                    {selectedValidation?.status?.toUpperCase() || "—"}
                  </p>
                </div>
              )}

              {selectedValidation?.status === "conditional" && (
                <label className="flex items-start gap-2 text-sm text-amber-100">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={acknowledgeConditional}
                    onChange={(e) =>
                      setAcknowledgeConditional(e.target.checked)
                    }
                  />
                  <span>
                    I acknowledge CONDITIONAL validation and accept starting
                    paper with this version.
                  </span>
                </label>
              )}

              <label className="block text-sm text-slate-300">
                Initial capital
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                  required
                />
              </label>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || loadingMeta || !strategyVersionId || !validationId}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Start Paper Trading"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
