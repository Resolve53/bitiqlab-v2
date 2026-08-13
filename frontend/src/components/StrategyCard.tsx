import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiFetch } from "@/lib/api";
import {
  formatWinRate,
  formatDrawdown,
  formatPnl,
} from "@/lib/trading-constants";
import MonitoringSettingsModal from "@/components/MonitoringSettingsModal";

export interface StrategyCardStrategy {
  id: string;
  name: string;
  description?: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  status: string;
  current_sharpe: number;
  max_drawdown: number;
  win_rate: number;
  backtest_count: number;
  winning_trades?: number;
  losing_trades?: number;
  /** Truth Engine executable — from list API enrichment */
  executable?: boolean;
  executability?: string;
}

export interface StrategyLiveStats {
  trade_count: number;
  total_pnl: number;
  active_sessions: number;
  open_trades?: number;
}

interface StrategyCardProps {
  strategy: StrategyCardStrategy;
  liveStats?: StrategyLiveStats;
  onRunBacktest: () => void;
  onRunValidation?: () => void;
  onStartPaperTrading: () => void;
  onStatusChange?: (strategyId: string, newStatus: string) => void;
  onDelete?: (strategyId: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-700/60 text-slate-300 border-slate-600",
  testing: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  failed: "bg-red-500/15 text-red-300 border-red-500/40",
};

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export default function StrategyCard({
  strategy,
  liveStats,
  onRunBacktest,
  onRunValidation,
  onStartPaperTrading,
  onStatusChange,
  onDelete,
}: StrategyCardProps) {
  const router = useRouter();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [showMonitoringSettings, setShowMonitoringSettings] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();

  const statusClass =
    STATUS_STYLES[strategy.status] ||
    "bg-slate-700/60 text-slate-300 border-slate-600";

  const isExecutable = strategy.executable === true;

  const openSession = async (onFound: (sessionId: string) => void) => {
    const data = await apiFetch<{
      sessions: Array<{ session_id: string }>;
    }>(`/api/paper-trading/sessions?strategy_id=${strategy.id}&limit=1`);
    if (!data.sessions?.length) {
      throw new Error("NO_SESSION");
    }
    onFound(data.sessions[0].session_id);
  };

  const handleLive = async () => {
    try {
      setLoadingSession(true);
      await openSession((sid) =>
        router.push(`/paper-trading/${sid}/dashboard`)
      );
    } catch (e) {
      if (e instanceof Error && e.message === "NO_SESSION") {
        alert("No paper session yet. Click “Start paper” first.");
      } else {
        alert(e instanceof Error ? e.message : "Could not open session");
      }
    } finally {
      setLoadingSession(false);
    }
  };

  const handleSettings = async () => {
    try {
      await openSession((sid) => {
        setSessionId(sid);
        setShowMonitoringSettings(true);
      });
    } catch {
      alert("No paper session yet. Start paper trading to configure monitoring.");
    }
  };

  return (
    <article className="rounded-xl border border-slate-800/80 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-5 shadow-lg transition hover:border-cyan-500/30">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white leading-snug">
              {truncate(strategy.name, 72)}
            </h3>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusClass}`}
            >
              {strategy.status}
            </span>
            {isExecutable ? (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Executable
              </span>
            ) : (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-200">
                Legacy / Requires Regeneration
              </span>
            )}
          </div>

          {strategy.description && (
            <p className="mt-2 text-sm text-slate-400 line-clamp-2">
              {truncate(strategy.description, 160)}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
              {strategy.symbol}
            </span>
            <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
              {strategy.timeframe}
            </span>
            <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
              {strategy.market_type}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Sharpe" value={strategy.current_sharpe?.toFixed(2) ?? "—"} />
            <Metric label="Drawdown" value={formatDrawdown(strategy.max_drawdown)} />
            <Metric label="Win rate" value={formatWinRate(strategy.win_rate)} />
            <Metric label="Backtests" value={String(strategy.backtest_count ?? 0)} />
          </div>

          {liveStats && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
              <span>
                <strong className="text-slate-200">{liveStats.trade_count}</strong> trades
              </span>
              <span>
                P&amp;L{" "}
                <strong
                  className={
                    liveStats.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                  }
                >
                  {formatPnl(liveStats.total_pnl)}
                </strong>
              </span>
              <span>
                <strong className="text-slate-200">{liveStats.active_sessions}</strong>{" "}
                active session{liveStats.active_sessions !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-row flex-wrap gap-2 lg:w-52 lg:flex-col">
          <div className="relative w-full">
            <button
              type="button"
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Change status ▾
            </button>
            {showStatusMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-full min-w-[10rem] rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
                {(["approved", "draft", "testing"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      onStatusChange?.(strategy.id, s);
                      setShowStatusMenu(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 capitalize"
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(`Permanently delete "${strategy.name}" and all paper trades/sessions? This cannot be undone.`)
                    ) {
                      onDelete?.(strategy.id);
                    }
                    setShowStatusMenu(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-800"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <ActionBtn onClick={handleLive} disabled={loadingSession} variant="cyan">
            {loadingSession ? "…" : "Live dashboard"}
          </ActionBtn>
          <ActionBtn onClick={handleSettings} variant="slate">
            Monitor settings
          </ActionBtn>
          <Link
            href={`/strategies/${strategy.id}/trades`}
            className="block w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-center text-xs font-medium text-white hover:bg-slate-800"
          >
            Trade log
          </Link>
          <Link
            href={`/strategies/${strategy.id}/analysis`}
            className="block w-full rounded-lg border border-emerald-600/40 bg-emerald-600/20 px-3 py-2 text-center text-xs font-medium text-emerald-200 hover:bg-emerald-600/30"
          >
            Analysis
          </Link>
          <ActionBtn
            onClick={() => {
              if (!isExecutable) {
                alert(
                  "This strategy is not Truth Engine executable (legacy or draft). Regenerate with Claude AI to backtest."
                );
                return;
              }
              onRunBacktest();
            }}
            variant="blue"
          >
            {isExecutable ? "Run backtest" : "Backtest unavailable"}
          </ActionBtn>
          <ActionBtn
            onClick={() => {
              if (!isExecutable) {
                alert(
                  "This strategy is not Truth Engine executable. Regenerate with Claude AI to validate."
                );
                return;
              }
              onRunValidation?.();
            }}
            variant="amber"
          >
            {isExecutable ? "Run validation" : "Validation unavailable"}
          </ActionBtn>
          <ActionBtn onClick={onStartPaperTrading} variant="primary">
            Start paper
          </ActionBtn>
        </div>
      </div>

      <MonitoringSettingsModal
        isOpen={showMonitoringSettings}
        onClose={() => setShowMonitoringSettings(false)}
        sessionId={sessionId}
        strategyId={strategy.id}
      />
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950/50 px-3 py-2 border border-slate-800/50">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: "cyan" | "slate" | "blue" | "amber" | "primary";
}) {
  const styles = {
    cyan: "bg-cyan-600/90 hover:bg-cyan-500 text-white",
    slate: "border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-800",
    blue: "bg-blue-600/90 hover:bg-blue-500 text-white",
    amber: "bg-amber-600/90 hover:bg-amber-500 text-white",
    primary: "bg-violet-600 hover:bg-violet-500 text-white font-semibold",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
