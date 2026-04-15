import { useRouter } from "next/router";
import { useState } from "react";

export default function ClaudeGenerateStrategy() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

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

      // Redirect to strategies page after 2 seconds
      setTimeout(() => {
        router.push("/strategies");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate strategy");
    } finally {
      setLoading(false);
    }
  };

  if (success && analysis) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-3xl font-bold text-gray-900">Strategy Created! 🎉</h1>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-semibold">
                ✅ Strategy "{analysis.strategy.name}" created successfully!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-bold mb-4">Strategy Details</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-gray-600">Name</p>
                    <p className="font-semibold">{analysis.strategy.name}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Symbol</p>
                    <p className="font-semibold">{analysis.strategy.symbol}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Timeframe</p>
                    <p className="font-semibold">{analysis.strategy.timeframe}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Market Type</p>
                    <p className="font-semibold">{analysis.strategy.market_type}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Status</p>
                    <p className="font-semibold">{analysis.strategy.status}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold mb-4">Claude's Analysis</h3>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-gray-600 font-semibold">Risk Assessment</p>
                    <p className="text-gray-700">
                      {analysis.analysis.risk_assessment}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-semibold">Expected Performance</p>
                    <p className="text-gray-700">
                      {analysis.analysis.expected_performance}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-bold mb-2">Entry Rules</h3>
              <pre className="text-xs bg-white p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(analysis.strategy.entry_rules, null, 2)}
              </pre>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-bold mb-2">Exit Rules</h3>
              <pre className="text-xs bg-white p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(analysis.strategy.exit_rules, null, 2)}
              </pre>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => router.push("/strategies")}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                Go to Strategies
              </button>
              <button
                onClick={() => router.push(`/strategies`)}
                className="flex-1 bg-gray-300 text-gray-900 py-2 rounded-lg hover:bg-gray-400"
              >
                View All Strategies
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="text-blue-500 hover:text-blue-700 mb-4"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            Generate Strategy with Claude AI
          </h1>
          <p className="mt-2 text-gray-600">
            Describe your trading idea and Claude will analyze TradingView data to create
            entry/exit rules
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Symbol *
                </label>
                <input
                  type="text"
                  name="symbol"
                  value={formData.symbol}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g., BTCUSDT"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Timeframe *
                </label>
                <select
                  name="timeframe"
                  value={formData.timeframe}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                  <option value="1d">1 Day</option>
                  <option value="1w">1 Week</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Market Type
                </label>
                <select
                  name="market_type"
                  value={formData.market_type}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="spot">Spot</option>
                  <option value="futures">Futures</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Trading Idea *
              </label>
              <textarea
                name="strategy_idea"
                value={formData.strategy_idea}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., 'Find oversold RSI levels on 1h timeframe and buy when RSI crosses above 30', 'Use MACD divergence for entry signals', 'Trade when price is near lower Bollinger Band'"
                rows={6}
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                Be specific about technical indicators and market conditions you want to
                use
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800 text-sm">
                <strong>ℹ️ How it works:</strong> Claude will analyze the last 90 days of
                {" "}{formData.symbol} {formData.timeframe} charts, identify technical
                indicators, and create optimized entry/exit rules based on your idea.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 bg-gray-300 text-gray-900 py-2 rounded-lg hover:bg-gray-400"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {loading ? "Claude is analyzing..." : "✨ Generate with Claude"}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t">
            <h3 className="font-bold text-gray-900 mb-4">Example Ideas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold text-gray-900 mb-2">📉 Oversold Bounce</p>
                <p className="text-gray-600">
                  "Buy when RSI drops below 30 on 1h candles, sell when RSI crosses above
                  70 or price closes below 2% support"
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold text-gray-900 mb-2">🔀 MACD Crossover</p>
                <p className="text-gray-600">
                  "Buy when MACD line crosses above signal line and RSI > 50, sell when
                  MACD line crosses below signal"
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold text-gray-900 mb-2">📊 Bollinger Band</p>
                <p className="text-gray-600">
                  "Buy at lower Bollinger Band with RSI confirmation, take profit at
                  middle band or upper band"
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold text-gray-900 mb-2">🎯 Moving Average</p>
                <p className="text-gray-600">
                  "Buy when price bounces off 20-hour MA above 50-hour MA, exit on close
                  below 20MA"
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
