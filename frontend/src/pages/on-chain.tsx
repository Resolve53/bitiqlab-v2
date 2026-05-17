import { useEffect, useState } from "react";
import axios from "axios";
import MainLayout from "@/components/MainLayout";

interface FearGreedData {
  value: number;
  value_classification: string;
  timestamp: string;
}

interface WhaleActivity {
  symbol: string;
  amount: number;
  type: "buy" | "sell";
  timestamp: string;
  price: number;
}

export default function OnChain() {
  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null);
  const [whaleActivity, setWhaleActivity] = useState<WhaleActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOnChainData();
    const interval = setInterval(fetchOnChainData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchOnChainData = async () => {
    try {
      // Fetch Fear & Greed Index
      const fgRes = await axios.get("https://api.alternative.me/fng/?limit=1&format=json").catch(() => null);
      if (fgRes?.data?.data?.[0]) {
        setFearGreed({
          value: parseInt(fgRes.data.data[0].value),
          value_classification: fgRes.data.data[0].value_classification,
          timestamp: fgRes.data.data[0].timestamp,
        });
      }

      // Mock whale activity data
      const mockWhales: WhaleActivity[] = [
        { symbol: "BTC", amount: 2.5, type: "buy", timestamp: new Date(Date.now() - 5 * 60000).toISOString(), price: 45230 },
        { symbol: "ETH", amount: 45.2, type: "sell", timestamp: new Date(Date.now() - 12 * 60000).toISOString(), price: 2850 },
        { symbol: "SOL", amount: 125000, type: "buy", timestamp: new Date(Date.now() - 18 * 60000).toISOString(), price: 142.5 },
        { symbol: "BNB", amount: 850, type: "sell", timestamp: new Date(Date.now() - 25 * 60000).toISOString(), price: 612.8 },
        { symbol: "XRP", amount: 5000000, type: "buy", timestamp: new Date(Date.now() - 32 * 60000).toISOString(), price: 2.38 },
      ];
      setWhaleActivity(mockWhales);
    } catch (error) {
      console.error("Error fetching on-chain data:", error);
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
      "Extreme Fear": "📍 Extreme Fear",
      "Fear": "😨 Fear",
      "Neutral": "😐 Neutral",
      "Greed": "🤑 Greed",
      "Extreme Greed": "🚀 Extreme Greed",
    };
    return labels[classification] || classification;
  };

  const buyVolume = whaleActivity.filter((w) => w.type === "buy").length;
  const sellVolume = whaleActivity.filter((w) => w.type === "sell").length;

  return (
    <MainLayout title="On-Chain Analytics">
      <div className="space-y-6">
        {/* Fear & Greed Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main FG Card */}
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

                  {/* Gauge visualization */}
                  <div className="flex-1 ml-8">
                    <div className="w-full h-3 bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white/30"
                        style={{ width: `${fearGreed.value}%` }}
                      ></div>
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
                  <p className="text-slate-400 text-xs">Last updated: {new Date(parseInt(fearGreed.timestamp) * 1000).toLocaleTimeString()}</p>
                </div>
              </div>
            ) : (
              <p className="text-slate-500">Loading Fear & Greed Index...</p>
            )}
          </div>

          {/* Market Conditions */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">MARKET CONDITIONS</h3>
            <div className="space-y-3">
              <div>
                <p className="text-slate-400 text-sm mb-1">Trend Strength</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                    <div className="h-full w-3/4 bg-emerald-500 rounded"></div>
                  </div>
                  <span className="text-white font-bold text-sm">75%</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-sm mb-1">Volatility</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                    <div className="h-full w-1/2 bg-yellow-500 rounded"></div>
                  </div>
                  <span className="text-white font-bold text-sm">50%</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-sm mb-1">Whale Activity</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                    <div className="h-full w-2/3 bg-orange-500 rounded"></div>
                  </div>
                  <span className="text-white font-bold text-sm">67%</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-700">
                <p className="text-slate-400 text-sm mb-2">Market Signal</p>
                <span className="px-3 py-1 rounded text-sm font-bold bg-emerald-500/20 text-emerald-400">
                  ↑ Bullish
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Whale Activity Section */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">WHALE ACTIVITY (&gt;$500k)</h2>
              <p className="text-slate-400 text-sm mt-1">Large on-chain transfers in the last hour</p>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <p className="text-slate-400 text-xs">Buy Transfers</p>
                <p className="text-emerald-400 font-bold text-lg">{buyVolume}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-xs">Sell Transfers</p>
                <p className="text-red-400 font-bold text-lg">{sellVolume}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300">TIME</th>
                  <th className="text-left py-3 px-4 text-slate-300">COIN</th>
                  <th className="text-left py-3 px-4 text-slate-300">TYPE</th>
                  <th className="text-left py-3 px-4 text-slate-300">AMOUNT</th>
                  <th className="text-left py-3 px-4 text-slate-300">PRICE</th>
                  <th className="text-left py-3 px-4 text-slate-300">USD VALUE</th>
                </tr>
              </thead>
              <tbody>
                {whaleActivity.map((activity, idx) => {
                  const usdValue = activity.amount * activity.price;
                  const typeColor = activity.type === "buy" ? "text-emerald-400" : "text-red-400";
                  const typeLabel = activity.type === "buy" ? "🟢 BUY" : "🔴 SELL";

                  return (
                    <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {new Date(activity.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 text-white font-bold">{activity.symbol}</td>
                      <td className={`py-3 px-4 font-bold ${typeColor}`}>{typeLabel}</td>
                      <td className="py-3 px-4 text-white">
                        {activity.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-slate-400">${activity.price.toFixed(2)}</td>
                      <td className="py-3 px-4 text-white font-bold">
                        ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Market Sentiment */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Exchange Inflows (24h)</p>
            <p className="text-3xl font-bold text-emerald-400">-$1.2B</p>
            <p className="text-xs text-slate-500 mt-2">Coins leaving exchanges (bullish)</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Open Interest</p>
            <p className="text-3xl font-bold text-white">$28.5B</p>
            <p className="text-xs text-slate-500 mt-2">+$2.1B from 24h ago</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Long/Short Ratio</p>
            <p className="text-3xl font-bold text-white">1.42</p>
            <p className="text-xs text-slate-500 mt-2">More longs than shorts</p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
