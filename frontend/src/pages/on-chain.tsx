import { useEffect, useState } from "react";
import axios from "axios";
import MainLayout from "@/components/MainLayout";
import { apiUrl } from "@/lib/api";

interface FearGreedData {
  value: number;
  value_classification: string;
  timestamp: number;
}

interface WhaleRow {
  symbol: string;
  largeOrderCount: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  bullishSignal: boolean;
  confidence: number;
  timestamp: number;
}

interface SymbolMetric {
  symbol: string;
  combinedScore: number;
  recommendation: string;
  fearGreedIndex: { value: number; classification: string };
  whaleActivity: { largeOrderCount: number; bullishSignal: boolean; confidence: number };
  fundingRate: { rate: number; bullishSignal: boolean };
}

interface OverviewSummary {
  avgOnChainScore: number;
  bullishWhaleCount: number;
  symbolsScanned: number;
  marketSignal: "bullish" | "bearish" | "neutral";
}

export default function OnChain() {
  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null);
  const [whales, setWhales] = useState<WhaleRow[]>([]);
  const [metrics, setMetrics] = useState<SymbolMetric[]>([]);
  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOnChainData();
    const interval = setInterval(fetchOnChainData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchOnChainData = async () => {
    try {
      setError(null);
      const res = await axios.get(apiUrl("/api/analysis/on-chain-overview"));
      const data = res.data?.data;

      if (data?.fearGreed) {
        setFearGreed({
          value: data.fearGreed.value,
          value_classification: data.fearGreed.classification,
          timestamp: data.fearGreed.timestamp,
        });
      }

      setWhales(data?.whales || []);
      setMetrics(data?.metrics || []);
      setSummary(data?.summary || null);
    } catch (err) {
      console.error("Error fetching on-chain data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load on-chain overview"
      );
    } finally {
      setLoading(false);
    }
  };

  const getFGColor = (value: number) => {
    if (value >= 75) return "text-emerald-400 bg-emerald-500/20";
    if (value >= 50) return "text-yellow-400 bg-yellow-500/20";
    if (value >= 25) return "text-orange-400 bg-orange-500/20";
    return "text-red-400 bg-red-500/20";
  };

  const getFGLabel = (classification: string) => {
    const labels: { [key: string]: string } = {
      "Extreme Fear": "Extreme Fear",
      Fear: "Fear",
      Neutral: "Neutral",
      Greed: "Greed",
      "Extreme Greed": "Extreme Greed",
    };
    return labels[classification] || classification;
  };

  const bullishWhales = whales.filter((w) => w.bullishSignal).length;
  const bearishWhales = whales.length - bullishWhales;
  const avgScore = summary?.avgOnChainScore ?? 50;

  const marketSignalLabel =
    summary?.marketSignal === "bullish"
      ? "Bullish"
      : summary?.marketSignal === "bearish"
        ? "Bearish"
        : "Neutral";

  const marketSignalClass =
    summary?.marketSignal === "bullish"
      ? "bg-emerald-500/20 text-emerald-400"
      : summary?.marketSignal === "bearish"
        ? "bg-red-500/20 text-red-400"
        : "bg-yellow-500/20 text-yellow-400";

  return (
    <MainLayout title="On-Chain Analytics">
      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
            {error}. Check NEXT_PUBLIC_API_URL points to your Railway backend.
          </div>
        )}

        {loading && (
          <p className="text-slate-400 text-center py-4">Loading on-chain data…</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-lg p-8">
            <h2 className="text-lg font-bold text-white mb-6">FEAR & GREED INDEX</h2>

            {fearGreed ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm mb-2">Current Index</p>
                    <p className={`text-6xl font-bold ${getFGColor(fearGreed.value).split(" ")[0]}`}>
                      {fearGreed.value}
                    </p>
                  </div>

                  <div className="flex-1 ml-8">
                    <div className="w-full h-3 bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white/30"
                        style={{ width: `${fearGreed.value}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-2">
                      <span>0 (Fear)</span>
                      <span>50</span>
                      <span>100 (Greed)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-slate-400 text-sm mb-2">Classification</p>
                  <span className={`px-4 py-2 rounded text-sm font-bold ${getFGColor(fearGreed.value)}`}>
                    {getFGLabel(fearGreed.value_classification)}
                  </span>
                </div>

                <div className="border-t border-slate-700 pt-4">
                  <p className="text-slate-400 text-xs">
                    Last updated:{" "}
                    {new Date(
                      fearGreed.timestamp > 1e12
                        ? fearGreed.timestamp
                        : fearGreed.timestamp * 1000
                    ).toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-slate-500">Fear & Greed data unavailable</p>
            )}
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">MARKET CONDITIONS</h3>
            <div className="space-y-3">
              <div>
                <p className="text-slate-400 text-sm mb-1">Avg On-Chain Score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded"
                      style={{ width: `${avgScore}%` }}
                    />
                  </div>
                  <span className="text-white font-bold text-sm">{avgScore}/100</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-sm mb-1">Whale Signals (bullish)</p>
                <p className="text-white font-bold">
                  {bullishWhales} / {whales.length} symbols
                </p>
              </div>

              <div className="pt-3 border-t border-slate-700">
                <p className="text-slate-400 text-sm mb-2">Market Signal</p>
                <span className={`px-3 py-1 rounded text-sm font-bold ${marketSignalClass}`}>
                  {marketSignalLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">WHALE ORDER BOOK SIGNALS</h2>
              <p className="text-slate-400 text-sm mt-1">
                Large resting orders (&gt;$500k) detected on Binance spot books
              </p>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <p className="text-slate-400 text-xs">Bullish</p>
                <p className="text-emerald-400 font-bold text-lg">{bullishWhales}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-xs">Neutral/Bearish</p>
                <p className="text-red-400 font-bold text-lg">{bearishWhales}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300">SYMBOL</th>
                  <th className="text-left py-3 px-4 text-slate-300">LARGE ORDERS</th>
                  <th className="text-left py-3 px-4 text-slate-300">NET FLOW</th>
                  <th className="text-left py-3 px-4 text-slate-300">SIGNAL</th>
                  <th className="text-left py-3 px-4 text-slate-300">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody>
                {whales.length > 0 ? (
                  whales.map((w) => (
                    <tr key={w.symbol} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-white font-bold">{w.symbol}</td>
                      <td className="py-3 px-4 text-slate-300">{w.largeOrderCount}</td>
                      <td
                        className={`py-3 px-4 font-bold ${w.netVolume >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {w.netVolume >= 0 ? "+" : ""}$
                        {(w.netVolume / 1e6).toFixed(2)}M
                      </td>
                      <td className="py-3 px-4">
                        {w.bullishSignal ? (
                          <span className="text-emerald-400 font-bold">Bullish</span>
                        ) : (
                          <span className="text-slate-400">Neutral</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-white">{w.confidence}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No whale activity detected
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">PER-SYMBOL ON-CHAIN SCORES</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.map((m) => (
              <div
                key={m.symbol}
                className="p-4 rounded-lg bg-slate-950/50 border border-slate-700/50"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white font-bold">{m.symbol}</span>
                  <span
                    className={`text-lg font-bold ${
                      m.combinedScore >= 65
                        ? "text-emerald-400"
                        : m.combinedScore <= 40
                          ? "text-red-400"
                          : "text-yellow-400"
                    }`}
                  >
                    {m.combinedScore}
                  </span>
                </div>
                <p className="text-slate-400 text-xs line-clamp-2">{m.recommendation}</p>
                <p className="text-slate-500 text-xs mt-2">
                  Funding: {m.fundingRate.rate.toFixed(4)}% · Whales:{" "}
                  {m.whaleActivity.largeOrderCount} large orders
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
