import { useRouter } from "next/router";
import { apiPath } from "@/lib/api";
import { useState } from "react";
import PaperTradingModal from "@/components/PaperTradingModal";

const PHASE1_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const PHASE1_TIMEFRAMES = ["15m", "1h", "4h"] as const;

export default function ClaudeGenerateStrategy() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [showPaperTradingModal, setShowPaperTradingModal] = useState(false);

  const [formData, setFormData] = useState({
    symbol: "BTCUSDT",
    timeframe: "1h",
    strategy_idea: "",
    market_type: "spot",
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setAnalysis(null);
    setLoading(true);

    try {
      if (!formData.symbol || !formData.strategy_idea) {
        setError("Please fill in symbol and strategy idea");
        setLoading(false);
        return;
      }

      if (!(PHASE1_SYMBOLS as readonly string[]).includes(formData.symbol)) {
        setError(`Symbol must be one of: ${PHASE1_SYMBOLS.join(", ")}`);
        setLoading(false);
        return;
      }

      if (!(PHASE1_TIMEFRAMES as readonly string[]).includes(formData.timeframe)) {
        setError(`Timeframe must be one of: ${PHASE1_TIMEFRAMES.join(", ")}`);
        setLoading(false);
        return;
      }

      const response = await fetch(apiPath("/api/research/claude-generate"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ||
            payload.message ||
            "Failed to generate strategy — nothing was saved"
        );
      }

      const data = payload.data;
      if (
        !data?.strategy?.id ||
        data?.analysis?.executable !== true ||
        data?.strategy?.entry_rules == null
      ) {
        throw new Error(
          "Generation response was incomplete or non-executable — nothing was saved"
        );
      }

      setAnalysis(data);
      setSuccess(true);
    } catch (err) {
      setSuccess(false);
      setAnalysis(null);
      setError(err instanceof Error ? err.message : "Failed to generate strategy");
    } finally {
      setLoading(false);
    }
  };

  if (success && analysis) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-4xl font-bold text-white">Strategy Created</h1>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-6">
            <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4">
              <p className="text-emerald-300 font-semibold">
                Strategy &quot;{analysis.strategy.name}&quot; validated by Truth Engine and saved.
              </p>
              <p className="text-emerald-400/80 text-sm mt-1">
                Schema {analysis.analysis?.schema_version || "truth_engine_v1"} · executable
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-bold text-white mb-4">Strategy Details</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-slate-400">Name</p>
                    <p className="font-semibold text-white">{analysis.strategy.name}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Symbol</p>
                    <p className="font-semibold text-white">{analysis.strategy.symbol}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Timeframe</p>
                    <p className="font-semibold text-white">{analysis.strategy.timeframe}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Market Type</p>
                    <p className="font-semibold text-white">{analysis.strategy.market_type}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Status</p>
                    <p className="font-semibold text-emerald-400">{analysis.strategy.status}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white mb-4">Claude&apos;s Analysis</h3>
                {analysis.analysis?.model && (
                  <p className="text-xs text-slate-500 mb-3">
                    Model: {analysis.analysis.model}
                  </p>
                )}
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-slate-400 font-semibold">Risk Assessment</p>
                    <p className="text-slate-300">
                      {analysis.analysis?.risk_assessment || analysis.strategy?.description}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold">Expected Performance</p>
                    <p className="text-slate-300">
                      {analysis.analysis?.expected_performance || "—"}
                    </p>
                  </div>
                  {analysis.analysis?.chart_data && (
                    <div>
                      <p className="text-slate-400 font-semibold">Market Snapshot</p>
                      <p className="text-slate-300">
                        {analysis.analysis.chart_data.symbol} @ $
                        {Number(analysis.analysis.chart_data.current_price).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">Entry Rules (structured)</h3>
              <pre className="text-xs bg-slate-900 p-2 rounded overflow-auto max-h-40 text-slate-300">
                {JSON.stringify(analysis.strategy.entry_rules, null, 2)}
              </pre>
            </div>

            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">Exit Rules</h3>
              <pre className="text-xs bg-slate-900 p-2 rounded overflow-auto max-h-40 text-slate-300">
                {JSON.stringify(analysis.strategy.exit_rules, null, 2)}
              </pre>
            </div>

            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 mt-6">
              <p className="text-blue-300 text-sm mb-4">
                <strong>Next Step:</strong> Run a real historical backtest (Truth Engine) or paper trade before live capital.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowPaperTradingModal(true)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg transition font-semibold"
              >
                Start Paper Trading
              </button>
              <button
                onClick={() => router.push("/strategies")}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg transition"
              >
                Go to Strategies
              </button>
              <button
                onClick={() => router.push(`/strategies`)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition"
              >
                View All
              </button>
            </div>
          </div>
        </main>

        {showPaperTradingModal && analysis?.strategy && (
          <PaperTradingModal
            strategyId={analysis.strategy.id}
            strategyName={analysis.strategy.name}
            symbol={analysis.strategy.symbol}
            timeframe={analysis.strategy.timeframe}
            onClose={() => setShowPaperTradingModal(false)}
            onSuccess={() => {
              setShowPaperTradingModal(false);
              router.push("/strategies");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.back()}
            className="text-emerald-400 hover:text-emerald-300 mb-4 font-semibold transition"
          >
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-white">
            Generate Strategy with Claude AI
          </h1>
          <p className="mt-2 text-slate-400">
            Describe your idea. Claude returns structured Truth Engine rules (direction + conditions), validated before save.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg">
              <p className="text-red-300 font-semibold">Generation failed — nothing was saved</p>
              <p className="text-red-300/90 text-sm mt-1">{error}</p>
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Symbol *
                </label>
                <select
                  name="symbol"
                  value={formData.symbol}
                  onChange={handleChange}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  required
                >
                  {PHASE1_SYMBOLS.map((s) => (
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
                  name="timeframe"
                  value={formData.timeframe}
                  onChange={handleChange}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  required
                >
                  <option value="15m">15 Minutes</option>
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Market Type
                </label>
                <select
                  name="market_type"
                  value={formData.market_type}
                  onChange={handleChange}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                >
                  <option value="spot">Spot</option>
                  <option value="futures">Futures</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                Your Trading Idea *
              </label>
              <textarea
                name="strategy_idea"
                value={formData.strategy_idea}
                onChange={handleChange}
                className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                placeholder="e.g., Long when RSI(14) < 30 AND close > EMA(50); short when RSI(14) > 70 AND close < EMA(50). Use 2% stop and 4% take profit."
                rows={6}
                required
              />
              <p className="text-xs text-slate-500 mt-2">
                Be explicit about direction, indicators, periods, and thresholds. Vague prose will be rejected.
              </p>
            </div>

            <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4">
              <p className="text-emerald-300 text-sm">
                <strong>How it works:</strong> Claude must return structured entries with explicit long/short
                direction. The same Truth Engine validator used for backtests runs before save. Invalid
                output is never persisted.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition disabled:opacity-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-2 rounded-lg transition font-semibold"
              >
                {loading ? "Claude is compiling rules…" : "Generate with Claude"}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-700">
            <h3 className="font-bold text-white mb-4">Example Ideas (executable language)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-lg">
                <p className="font-semibold text-white mb-2">Long RSI mean-reversion</p>
                <p className="text-slate-400">
                  &quot;Long only: RSI(14) &lt; 30 and close &gt; SMA(50). Stop 2%, take profit 4%, risk 1%.&quot;
                </p>
              </div>
              <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-lg">
                <p className="font-semibold text-white mb-2">Short RSI stretch</p>
                <p className="text-slate-400">
                  &quot;Short only: RSI(14) &gt; 70 and close &lt; EMA(20). Stop 2%, take profit 3%.&quot;
                </p>
              </div>
              <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-lg">
                <p className="font-semibold text-white mb-2">Dual direction</p>
                <p className="text-slate-400">
                  &quot;Long when RSI(14) &lt; 30; short when RSI(14) &gt; 70. Separate setups. Stop 2%.&quot;
                </p>
              </div>
              <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-lg">
                <p className="font-semibold text-white mb-2">Trend filter</p>
                <p className="text-slate-400">
                  &quot;Long when EMA(20) &gt; EMA(50) AND RSI(14) &lt; 40. Spot, leverage 1, risk 1%.&quot;
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
