import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { formatDrawdown, formatPnl, formatWinRate } from "@/lib/trading-constants";

type Lifecycle =
  | "CREATED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "ABORTED"
  | string;

interface PaperSession {
  id: string;
  strategy_id: string;
  strategy_version_id: string;
  strategy_version: number;
  snapshot_hash: string;
  lifecycle_status: Lifecycle;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  current_balance: number;
  last_processed_candle_ts?: string | null;
  realized_pnl?: number | null;
  unrealized_pnl?: number | null;
  fees_paid?: number | null;
  max_drawdown?: number | null;
  paper_metrics?: {
    startingCapital: number;
    currentEquity: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    maxDrawdown: number;
    feesPaid: number;
  } | null;
  failure_reason?: string | null;
  readiness_status?: "NOT_READY" | "READY_FOR_REVIEW" | "REJECT" | null;
  candles_processed?: number | null;
  last_tick_at?: string | null;
  last_tick_error?: string | null;
  tick_error_count?: number | null;
}

interface PaperTrade {
  id: string;
  direction: string;
  entry_candle_ts: string;
  exit_candle_ts?: string | null;
  entry_price: number;
  exit_price?: number | null;
  quantity: number;
  fee: number;
  realized_pnl?: number | null;
  reason?: string | null;
  status: string;
}

interface PaperEvent {
  id: string;
  event_type: string;
  candle_timestamp: string;
  fill_price?: number | null;
  fee?: number | null;
  realized_pnl?: number | null;
  reason?: string | null;
}

interface PaperPosition {
  direction: string;
  entry_price: number;
  quantity: number;
  stop_loss: number;
  take_profit?: number | null;
  unrealized_pnl: number;
  mark_price?: number | null;
  entry_candle_ts: string;
  leverage: number;
}

interface Payload {
  session: PaperSession;
  trades?: PaperTrade[];
  events?: PaperEvent[];
  position?: PaperPosition | null;
  metrics?: PaperSession["paper_metrics"];
  notice?: string;
  evaluation?: {
    source: string;
    elapsedHours: number;
    closedCandlesProcessed: number;
    closedTrades: number;
    expectancy: number | null;
    profitFactor: number | null;
    winRate: number;
    realizedPnl: number;
    maxDrawdown: number;
    feesPaid: number;
    currentEquity: number;
    equityCurve?: Array<{ timestamp: string; equity: number }>;
  } | null;
  readiness?: {
    status: "NOT_READY" | "READY_FOR_REVIEW" | "REJECT";
    reasons: string[];
    checks?: Record<string, { passed: boolean; detail: string }>;
  } | null;
  comparison?: {
    blended: false;
    historical: {
      source: string;
      notice: string;
      status?: string | null;
      validationSplit?: {
        expectancy?: number | null;
        profitFactor?: number | null;
        winRate?: number | null;
        maxDrawdown?: number | null;
        totalTrades?: number | null;
      } | null;
    };
    forward: {
      source: string;
      notice: string;
      evaluation?: Payload["evaluation"];
    };
    disclaimer: string;
  };
  reviewEligible?: boolean;
  reviewAction?: {
    available: boolean;
    decisions?: string[];
    notice?: string;
    reasons?: string[];
  };
  reviews?: Array<{
    id: string;
    decision: string;
    actor: string;
    notes?: string | null;
    created_at?: string;
  }>;
}

function fmtTs(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function PaperForwardSessionPanel({
  sessionId,
  compact,
}: {
  sessionId?: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      setError(null);
      const payload = await apiFetch<Payload>(
        `/api/paper-forward/sessions/${sessionId}`
      );
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load paper session");
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    if (!sessionId) return;
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load, sessionId]);

  async function act(path: string, label: string, body?: Record<string, unknown>) {
    if (!sessionId) return;
    try {
      setBusy(label);
      setError(null);
      await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(body || {}),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  if (!sessionId) return null;
  if (!data && !error) {
    return (
      <p className="text-sm text-slate-400 py-4">Loading PAPER / SIMULATED session…</p>
    );
  }

  const session = data?.session;
  const metrics = data?.metrics || session?.paper_metrics;
  const status = session?.lifecycle_status;
  const trades = data?.trades || [];
  const events = data?.events || [];
  const position = data?.position;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <span className="font-semibold tracking-wide">PAPER / SIMULATED</span>
        {" — "}
        {data?.notice ||
          "No real capital. No exchange orders. Metrics come from simulated forward fills only."}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {session && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Status" value={String(status)} />
            <Stat
              label="Strategy version"
              value={`v${session.strategy_version}`}
              sub={session.snapshot_hash?.slice(0, 12)}
            />
            <Stat
              label="Market"
              value={`${session.symbol} · ${session.timeframe}`}
            />
            <Stat
              label="Last processed candle"
              value={fmtTs(session.last_processed_candle_ts)}
            />
            <Stat
              label="Starting capital (sim)"
              value={formatPnl(session.initial_balance).replace("+", "")}
            />
            <Stat
              label="Current equity (sim)"
              value={formatPnl(metrics?.currentEquity ?? session.current_balance)}
            />
            <Stat
              label="Realized P&L (sim)"
              value={formatPnl(metrics?.realizedPnl ?? session.realized_pnl)}
              accent={(metrics?.realizedPnl ?? session.realized_pnl ?? 0) >= 0}
            />
            <Stat
              label="Unrealized P&L (sim)"
              value={formatPnl(metrics?.unrealizedPnl ?? session.unrealized_pnl)}
              accent={(metrics?.unrealizedPnl ?? session.unrealized_pnl ?? 0) >= 0}
            />
            <Stat
              label="Win rate (sim trades)"
              value={formatWinRate(metrics?.winRate)}
              sub={`${metrics?.wins ?? 0}W / ${metrics?.losses ?? 0}L · ${
                metrics?.totalTrades ?? 0
              } trades`}
            />
            <Stat
              label="Max drawdown (sim)"
              value={formatDrawdown(metrics?.maxDrawdown ?? session.max_drawdown)}
            />
            <Stat
              label="Fees paid (sim)"
              value={formatPnl(metrics?.feesPaid ?? session.fees_paid)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {status === "CREATED" && (
              <Btn
                disabled={!!busy}
                onClick={() =>
                  act(
                    `/api/paper-forward/sessions/${sessionId}/start`,
                    "start"
                  )
                }
              >
                {busy === "start" ? "Starting…" : "Start session"}
              </Btn>
            )}
            {status === "RUNNING" && (
              <>
                <Btn
                  disabled={!!busy}
                  onClick={() =>
                    act(
                      `/api/paper-forward/sessions/${sessionId}/tick`,
                      "tick"
                    )
                  }
                >
                  {busy === "tick" ? "Processing…" : "Process closed candles"}
                </Btn>
                <Btn
                  disabled={!!busy}
                  onClick={() =>
                    act(
                      `/api/paper-forward/sessions/${sessionId}/pause`,
                      "pause"
                    )
                  }
                >
                  Pause
                </Btn>
              </>
            )}
            {status === "PAUSED" && (
              <>
                <Btn
                  disabled={!!busy}
                  onClick={() =>
                    act(
                      `/api/paper-forward/sessions/${sessionId}/resume`,
                      "resume"
                    )
                  }
                >
                  Resume
                </Btn>
                <Btn
                  disabled={!!busy}
                  onClick={() =>
                    act(
                      `/api/paper-forward/sessions/${sessionId}/complete`,
                      "complete"
                    )
                  }
                >
                  {busy === "complete" ? "Completing…" : "Complete session"}
                </Btn>
              </>
            )}
            {status === "RUNNING" && (
              <Btn
                disabled={!!busy}
                onClick={() =>
                  act(
                    `/api/paper-forward/sessions/${sessionId}/complete`,
                    "complete"
                  )
                }
              >
                {busy === "complete" ? "Completing…" : "Complete session"}
              </Btn>
            )}
            {status !== "ABORTED" &&
              status !== "FAILED" &&
              status !== "COMPLETED" && (
                <Btn
                  disabled={!!busy}
                  tone="danger"
                  onClick={() =>
                    act(
                      `/api/paper-forward/sessions/${sessionId}/abort`,
                      "abort",
                      { reason: "aborted from paper UI" }
                    )
                  }
                >
                  Abort
                </Btn>
              )}
          </div>

          {session.failure_reason && (
            <p className="text-sm text-red-300">
              Failed closed: {session.failure_reason}
            </p>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                Paper-forward readiness
              </h3>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                  data?.readiness?.status === "READY_FOR_REVIEW"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : data?.readiness?.status === "REJECT"
                      ? "bg-red-500/20 text-red-200"
                      : "bg-amber-500/20 text-amber-100"
                }`}
              >
                {data?.readiness?.status ||
                  session.readiness_status ||
                  "NOT_READY"}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Deterministic code gate — not Claude. Does not enable live trading.
            </p>
            {data?.evaluation && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-sm">
                <Stat
                  label="Elapsed (forward)"
                  value={`${data.evaluation.elapsedHours.toFixed(1)}h`}
                />
                <Stat
                  label="Closed candles"
                  value={String(data.evaluation.closedCandlesProcessed)}
                />
                <Stat
                  label="Expectancy (sim)"
                  value={
                    data.evaluation.expectancy == null
                      ? "—"
                      : formatPnl(data.evaluation.expectancy)
                  }
                />
                <Stat
                  label="Profit factor (sim)"
                  value={
                    data.evaluation.profitFactor == null
                      ? "—"
                      : data.evaluation.profitFactor.toFixed(2)
                  }
                />
              </div>
            )}
            {data?.readiness?.reasons && data.readiness.reasons.length > 0 && (
              <ul className="text-xs text-slate-400 list-disc pl-4 space-y-1">
                {data.readiness.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <Btn
              disabled={!!busy}
              onClick={() =>
                act(
                  `/api/paper-forward/sessions/${sessionId}/evaluate`,
                  "evaluate"
                )
              }
            >
              {busy === "evaluate" ? "Evaluating…" : "Recompute forward evaluation"}
            </Btn>
            {session.last_tick_error && (
              <p className="text-xs text-red-300">
                Last tick error: {session.last_tick_error} (count{" "}
                {session.tick_error_count ?? 0})
              </p>
            )}
          </div>

          {data?.comparison && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold text-white mb-1">
                Historical vs paper-forward
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                {data.comparison.disclaimer}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-slate-800 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-sky-300">
                    Historical (Phase 2)
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.comparison.historical.notice}
                  </p>
                  <p className="text-sm text-slate-200 mt-2">
                    Status {data.comparison.historical.status || "—"} · trades{" "}
                    {data.comparison.historical.validationSplit?.totalTrades ??
                      "—"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Exp{" "}
                    {fmtNum(
                      data.comparison.historical.validationSplit?.expectancy
                    )}{" "}
                    · PF{" "}
                    {fmtNum(
                      data.comparison.historical.validationSplit?.profitFactor
                    )}{" "}
                    · WR{" "}
                    {fmtPct(
                      data.comparison.historical.validationSplit?.winRate
                    )}{" "}
                    · DD{" "}
                    {fmtPct(
                      data.comparison.historical.validationSplit?.maxDrawdown
                    )}
                  </p>
                </div>
                <div className="rounded border border-amber-500/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-amber-200">
                    Forward (Phase 4 paper)
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.comparison.forward.notice}
                  </p>
                  <p className="text-sm text-slate-200 mt-2">
                    {data.evaluation?.closedTrades ?? 0} closed sim trades ·{" "}
                    {formatPnl(data.evaluation?.realizedPnl)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Exp {fmtNum(data.evaluation?.expectancy)} · PF{" "}
                    {fmtNum(data.evaluation?.profitFactor)} · WR{" "}
                    {fmtPct(data.evaluation?.winRate)} · DD{" "}
                    {fmtPct(data.evaluation?.maxDrawdown)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {data?.reviewEligible && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">
                Human review (READY_FOR_REVIEW)
              </h3>
              <p className="text-xs text-emerald-100/80">
                {data.reviewAction?.notice ||
                  "Approval marks the frozen version eligible for a future live phase. It does not place an exchange order."}
              </p>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Review notes (audited)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                <Btn
                  disabled={!!busy}
                  onClick={() =>
                    act(
                      `/api/paper-forward/sessions/${sessionId}/review`,
                      "approve",
                      {
                        decision: "APPROVE_FUTURE_LIVE_ELIGIBLE",
                        notes: reviewNotes,
                      }
                    )
                  }
                >
                  {busy === "approve"
                    ? "Saving…"
                    : "Approve future-live eligibility"}
                </Btn>
                <Btn
                  disabled={!!busy}
                  tone="danger"
                  onClick={() =>
                    act(
                      `/api/paper-forward/sessions/${sessionId}/review`,
                      "reject-review",
                      {
                        decision: "REJECT_REVIEW",
                        notes: reviewNotes,
                      }
                    )
                  }
                >
                  Reject review
                </Btn>
              </div>
            </div>
          )}

          {data?.reviews && data.reviews.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold text-white mb-2">
                Review audit
              </h3>
              <ul className="space-y-2 text-sm text-slate-300">
                {data.reviews.map((r) => (
                  <li key={r.id}>
                    <span className="text-white">{r.decision}</span> · {r.actor}
                    {r.notes ? ` · ${r.notes}` : ""}
                    <div className="text-xs text-slate-500">
                      {fmtTs(r.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {position && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold text-white mb-2">
                Open simulated position
              </h3>
              <p className="text-sm text-slate-300">
                {position.direction.toUpperCase()} {position.quantity} @ $
                {Number(position.entry_price).toFixed(2)} · mark $
                {position.mark_price != null
                  ? Number(position.mark_price).toFixed(2)
                  : "—"}{" "}
                · SL {Number(position.stop_loss).toFixed(2)}
                {position.take_profit != null
                  ? ` · TP ${Number(position.take_profit).toFixed(2)}`
                  : ""}{" "}
                · lev {position.leverage}×
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Unrealized {formatPnl(position.unrealized_pnl)} · entered{" "}
                {fmtTs(position.entry_candle_ts)}
              </p>
            </div>
          )}

          {!compact && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold text-white mb-3">
                  Simulated trades
                </h3>
                {trades.length === 0 ? (
                  <p className="text-sm text-slate-500">No simulated trades yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {trades.map((t) => (
                      <li
                        key={t.id}
                        className="rounded border border-slate-800 px-3 py-2"
                      >
                        <span className="text-white font-medium">
                          {t.direction.toUpperCase()}
                        </span>{" "}
                        {t.status} · {formatPnl(t.realized_pnl)} ·{" "}
                        {t.reason || "open"}
                        <div className="text-xs text-slate-500">
                          {fmtTs(t.entry_candle_ts)} → {fmtTs(t.exit_candle_ts)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold text-white mb-3">
                  Recent paper events
                </h3>
                {events.length === 0 ? (
                  <p className="text-sm text-slate-500">No events yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm max-h-80 overflow-auto">
                    {events.map((e) => (
                      <li
                        key={e.id}
                        className="rounded border border-slate-800 px-3 py-2 text-slate-300"
                      >
                        <span className="text-white">{e.event_type}</span>{" "}
                        {e.reason ? `· ${e.reason}` : ""}{" "}
                        {e.fill_price != null
                          ? `· fill ${Number(e.fill_price).toFixed(4)}`
                          : ""}
                        <div className="text-xs text-slate-500">
                          {fmtTs(e.candle_timestamp)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function fmtNum(v?: number | null) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(3);
}

function fmtPct(v?: number | null) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold ${
          accent === undefined
            ? "text-white"
            : accent
              ? "text-emerald-400"
              : "text-red-400"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-slate-500 break-all">{sub}</p>}
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
        tone === "danger"
          ? "border border-red-500/40 text-red-200 hover:bg-red-500/10"
          : "bg-cyan-700 text-white hover:bg-cyan-600"
      }`}
    >
      {children}
    </button>
  );
}
