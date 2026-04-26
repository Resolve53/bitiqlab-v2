import { useState } from "react";
import { useRouter } from "next/router";

interface PaperTradingModalProps {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaperTradingModal({
  strategyId,
  strategyName,
  symbol,
  timeframe,
  onClose,
  onSuccess,
}: PaperTradingModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialBalance, setInitialBalance] = useState("10000");
  const [selectedSymbol, setSelectedSymbol] = useState(symbol);
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe);
  const [useTestnet, setUseTestnet] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const commonSymbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "XRPUSDT"];
  const timeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

  const handleStartPaperTrading = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const balance = parseFloat(initialBalance);
      if (isNaN(balance) || balance < 100) {
        throw new Error("Initial balance must be at least $100");
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

      const response = await fetch(`${apiUrl}/api/paper-trading/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          strategy_id: strategyId,
          initial_balance: balance,
          use_testnet: useTestnet,
          symbol: selectedSymbol,
          timeframe: selectedTimeframe,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start paper trading");
      }

      const data = await response.json();
      setSessionId(data.data.session_id);
      setSubmitted(true);

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        onSuccess();
        router.push(`/paper-trading/${data.data.session_id}/dashboard`);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start paper trading");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-white mb-2">Paper Trading Started!</h2>
          <p className="text-slate-300 mb-4">
            Your strategy "{strategyName}" is now trading with demo account.
          </p>
          <p className="text-slate-400 text-sm">
            Redirecting to strategies page...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-lg w-full max-h-96 overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Start Paper Trading</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl transition"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleStartPaperTrading} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Strategy
            </label>
            <div className="bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2">
              {strategyName}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Trading Pair *
            </label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
            >
              <option value="">Select a pair</option>
              {commonSymbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Timeframe *
            </label>
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
            >
              <option value="">Select a timeframe</option>
              {timeframes.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Initial Balance (USD) *
            </label>
            <input
              type="number"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              placeholder="10000"
              min="100"
              step="100"
              className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Simulated trading capital (min. $100). Won't use real money.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="useTestnet"
              checked={useTestnet}
              onChange={(e) => setUseTestnet(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="useTestnet" className="text-sm text-white">
              Use Binance Testnet (Demo/Sandbox)
            </label>
          </div>

          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
            <p className="text-blue-300 text-sm">
              <strong>ℹ️ About Paper Trading:</strong> Your strategy will simulate real trades using live market data. This helps validate your strategy before risking real capital.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition disabled:opacity-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedSymbol || !selectedTimeframe}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-2 rounded-lg transition font-semibold"
            >
              {loading ? "Starting..." : "🚀 Start Paper Trading"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
