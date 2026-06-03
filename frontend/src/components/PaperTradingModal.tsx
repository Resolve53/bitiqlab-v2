import { useState } from "react";
import { useRouter } from "next/router";
import { apiFetch, apiPath } from "@/lib/api";
import {
  PAPER_TRADING_DEFAULT_CAPITAL,
  DEFAULT_MULTI_COIN_COUNT,
  TOP_MONITOR_COINS,
} from "@/lib/trading-constants";

interface PaperTradingModalProps {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  marketType?: string;
  onClose: () => void;
  onSuccess: () => void;
}

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
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleStartPaperTrading = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiFetch<{
        session_id: string;
        coins_monitored?: number;
        message?: string;
      }>("/api/paper-trading/start", {
        method: "POST",
        body: JSON.stringify({
          strategy_id: strategyId,
          initial_balance: PAPER_TRADING_DEFAULT_CAPITAL,
          use_testnet: true,
          enable_multi_coin: true,
        }),
      });

      setSubmitted(true);
      setTimeout(() => {
        onSuccess();
        router.push(`/paper-trading/${data.session_id}/dashboard`);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start paper trading");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
          <p className="text-4xl mb-3">✓</p>
          <h2 className="text-xl font-semibold text-white">Session started</h2>
          <p className="mt-2 text-sm text-slate-400">
            ${PAPER_TRADING_DEFAULT_CAPITAL.toLocaleString()} demo capital · monitoring top{" "}
            {DEFAULT_MULTI_COIN_COUNT} pairs on Binance testnet
          </p>
          <p className="mt-4 text-xs text-slate-500">Opening dashboard…</p>
        </div>
      </div>
    );
  }

  const previewCoins = TOP_MONITOR_COINS.slice(0, 8).join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-xl border border-slate-700/80 bg-[#0d1219] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Start paper trading</h2>
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

        <form onSubmit={handleStartPaperTrading} className="space-y-5 p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Strategy
            </p>
            <p className="mt-1 text-white font-medium">{strategyName}</p>
            <p className="mt-1 text-sm text-slate-400">
              Rules reference: {symbol} · {timeframe} · {marketType}
            </p>
          </div>

          <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100/90">
            <p className="font-medium text-cyan-200">Top {DEFAULT_MULTI_COIN_COUNT} coins — no pair picker</p>
            <p className="mt-1 text-cyan-100/80">
              The lab scans {DEFAULT_MULTI_COIN_COUNT} major USDT pairs (e.g. {previewCoins}…) using your
              strategy rules. Orders execute on <strong>Binance testnet</strong>; P&amp;L is recorded from
              those fills in the database.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="text-xs text-slate-500">Demo capital</p>
              <p className="text-xl font-semibold text-white">
                ${PAPER_TRADING_DEFAULT_CAPITAL.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">Per session (Binance testnet)</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="text-xs text-slate-500">TradingView</p>
              <p className="text-sm font-medium text-slate-300">Optional</p>
              <p className="text-xs text-slate-500 mt-1">
                Lab uses Binance prices if TV is offline
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {loading ? "Starting…" : "Start monitoring"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
