import { useRouter } from "next/router";
import { useState } from "react";

export default function NewStrategy() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    timeframe: "1h",
    description: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.name || !formData.symbol || !formData.timeframe) {
        setError("Please fill in all required fields");
        setLoading(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

      const response = await fetch(`${apiUrl}/api/strategies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          symbol: formData.symbol,
          timeframe: formData.timeframe,
          description: formData.description,
          market_type: "spot",
          entry_rules: {},
          exit_rules: {},
          created_by: "user",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create strategy");
      }

      const result = await response.json();

      // Redirect to the strategies list page
      router.push("/strategies");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create strategy");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.back()}
            className="text-emerald-400 hover:text-emerald-300 mb-4 font-semibold transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-white">Create New Strategy</h1>
          <p className="mt-2 text-slate-400">Set up a custom trading strategy</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                Strategy Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                placeholder="e.g., RSI Mean Reversion"
                required
              />
            </div>

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
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="w-full bg-slate-700/50 border border-slate-600 text-white rounded-lg px-4 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                placeholder="Describe your strategy..."
                rows={4}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? "Creating..." : "Create Strategy"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
