import { useRouter } from "next/router";
import { useState } from "react";
import PaperTradingModal from "@/components/PaperTradingModal";

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
    setLoading(true);

    try {
      // Validate
      if (!formData.symbol || !formData.strategy_idea) {
        setError("Please fill in symbol and strategy idea");
        setLoading(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

      const response = await fetch(`${apiUrl}/api/research/claude-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate strategy");
      }

      const result = await response.json();
      setAnalysis(result.data);
      setSuccess(true);

      // Stay on results page so user can see Claude's analysis
    } catch (err) {
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
            <h1 className="text-4xl font-bold text-white">Strategy Created! 🎉</h1>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-6">
            <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4">
              <p className="text-emerald-300 font-semibold">
                ✅ Strategy "{analysis.strategy.name}" created successfully!
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
                <h3 className="text-lg font-bold text-white mb-4">Claude's Analysis</h3>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-slate-400 font-semibold">Risk Assessment</p>
                    <p className="text-slate-300">
                      {analysis.analysis.risk_assessment}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold">Expected Performance</p>
                    <p className="text-slate-300">
                      {analysis.analysis.expected_performance}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">Entry Rules</h3>
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
                <strong>Next Step:</strong> Test your strategy with paper money (demo account) before trading with real capital.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowPaperTradingModal(true)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg transition font-semibold"
              >
                🚀 Start Paper Trading
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
        </main>
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
            Describe your trading idea and Claude will analyze market data to create optimized entry/exit rules
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Symbol *
                </label>
                <input
                  type="text"
                  name="symbol"
                  value={formData.symbol}
                  onChange={handleChange}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  placeholder="e.g., BTCUSDT"
                  required
                />
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
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                  <option value="1d">1 Day</option>
                  <option value="1w">1 Week</option>
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
                placeholder="e.g., 'Find oversold RSI levels on 1h timeframe and buy when RSI crosses above 30', 'Use MACD divergence for entry signals', 'Trade when price is near lower Bollinger Band'"
                rows={6}
                required
              />
              <p className="text-xs text-slate-500 mt-2">
                Be specific about technical indicators and market conditions you want to use
              </p>
            </div>

            <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4">
              <p className="text-emerald-300 text-sm">
                <strong>ℹ️ How it works:</strong> Claude will analyze the last 90 days of
                {" "}{formData.symbol} {formData.timeframe} charts, identify technical
                indicators, and create optimized entry/exit rules based on your idea.
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
                {loading ? "Claude is analyzing..." : "✨ Generate with Claude"}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-700">
            <h3 className="font-bold text-white mb-4">Example Ideas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-lg">
                <p className="font-semibold text-white mb-2">📉 Oversold Bounce</p>
                <p className="text-slate-400">
                  "Buy when RSI drops below 30 on 1h candles, sell when RSI crosses above 70 or price closes below 2% support"
                </p>
              </div>
              <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-lg">
                <p className="font-semibold text-white mb-2">🔀 MACD Crossover</p>
                <p className="text-slate-400">
                  {"\"Buy when MACD line crosses above signal line and RSI above 50, sell when MACD line crosses below signal\""}
                </p>
              </div>
              <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-lg">
                <p className="font-semibold text-white mb-2">📊 Bollinger Band</p>
                <p className="text-slate-400">
                  "Buy at lower Bollinger Band with RSI confirmation, take profit at middle band or upper band"
                </p>
              </div>
              <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-lg">
                <p className="font-semibold text-white mb-2">🎯 Moving Average</p>
                <p className="text-slate-400">
                  "Buy when price bounces off 20-hour MA above 50-hour MA, exit on close below 20MA"
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
