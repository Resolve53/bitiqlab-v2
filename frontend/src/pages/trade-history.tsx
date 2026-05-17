import { useEffect, useState } from "react";
import axios from "axios";
import MainLayout from "@/components/MainLayout";

interface Trade {
  id: string;
  coin: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  realized_pnl_usd: number;
  realized_pnl_percent: number;
  status: string;
  created_at: string;
  closed_at: string;
  exit_reason: string;
  quantity: number;
}

interface TradeScore {
  trade_id: string;
  trade_score: number;
  calendar_score: number;
  onchain_score: number;
  combined_score: number;
  analysis_notes: string;
}

export default function TradeHistory() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [scores, setScores] = useState<{ [key: string]: TradeScore }>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "win" | "loss">("all");

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      const res = await axios.get(`http://localhost:4002/api/trades`).catch(() => ({ data: { data: [] } }));
      const tradesData = res.data.data || [];
      const closed = tradesData.filter((t: Trade) => t.status === "closed");
      setTrades(closed);

      // Fetch scores for each trade
      const scoreMap: { [key: string]: TradeScore } = {};
      for (const trade of closed) {
        try {
          const scoreRes = await axios.get(`http://localhost:4003/api/analysis/trade/${trade.id}`).catch(() => null);
          if (scoreRes?.data?.data) {
            scoreMap[trade.id] = scoreRes.data.data;
          }
        } catch (error) {
          console.error(`Error fetching score for trade ${trade.id}:`, error);
        }
      }
      setScores(scoreMap);
    } catch (error) {
      console.error("Error fetching trades:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTrades = trades.filter((t) => {
    if (filter === "win") return t.realized_pnl_usd > 0;
    if (filter === "loss") return t.realized_pnl_usd < 0;
    return true;
  });

  const winners = trades.filter((t) => t.realized_pnl_usd > 0).length;
  const losers = trades.filter((t) => t.realized_pnl_usd < 0).length;
  const totalPnL = trades.reduce((sum, t) => sum + t.realized_pnl_usd, 0);
  const avgWin = winners > 0
    ? trades.filter((t) => t.realized_pnl_usd > 0).reduce((sum, t) => sum + t.realized_pnl_usd, 0) / winners
    : 0;
  const avgLoss = losers > 0
    ? Math.abs(trades.filter((t) => t.realized_pnl_usd < 0).reduce((sum, t) => sum + t.realized_pnl_usd, 0)) / losers
    : 0;

  return (
    <MainLayout title="Trade History">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total Closed</p>
            <p className="text-3xl font-bold text-white">{trades.length}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total P&L</p>
            <p className={`text-3xl font-bold ${totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Win Rate</p>
            <p className="text-3xl font-bold text-white">
              {trades.length > 0 ? ((winners / trades.length) * 100).toFixed(1) : 0}%
            </p>
            <p className="text-xs text-slate-500 mt-2">{winners} W / {losers} L</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Avg Winner</p>
            <p className="text-3xl font-bold text-emerald-400">+${avgWin.toFixed(2)}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Avg Loser</p>
            <p className="text-3xl font-bold text-red-400">-${avgLoss.toFixed(2)}</p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            All ({trades.length})
          </button>
          <button
            onClick={() => setFilter("win")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "win"
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Winners ({winners})
          </button>
          <button
            onClick={() => setFilter("loss")}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === "loss"
                ? "bg-red-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Losers ({losers})
          </button>
        </div>

        {/* Trade History Table */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">CLOSED TRADES</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300">DATE</th>
                  <th className="text-left py-3 px-4 text-slate-300">SYMBOL</th>
                  <th className="text-left py-3 px-4 text-slate-300">DIRECTION</th>
                  <th className="text-left py-3 px-4 text-slate-300">ENTRY</th>
                  <th className="text-left py-3 px-4 text-slate-300">EXIT</th>
                  <th className="text-left py-3 px-4 text-slate-300">P&L (USD)</th>
                  <th className="text-left py-3 px-4 text-slate-300">P&L %</th>
                  <th className="text-left py-3 px-4 text-slate-300">EXIT REASON</th>
                  <th className="text-left py-3 px-4 text-slate-300">SCORE</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.length > 0 ? (
                  filteredTrades.map((trade) => {
                    const pnlColor = trade.realized_pnl_usd >= 0 ? "text-emerald-400" : "text-red-400";
                    const score = scores[trade.id];
                    const scoreColor =
                      (score?.combined_score || 0) > 70
                        ? "text-emerald-400"
                        : (score?.combined_score || 0) > 40
                        ? "text-yellow-400"
                        : "text-red-400";

                    return (
                      <tr key={trade.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-3 px-4 text-slate-400 text-xs">
                          {new Date(trade.closed_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-white font-bold">{trade.coin}</td>
                        <td className="py-3 px-4 font-bold">
                          <span
                            className={
                              trade.direction === "BUY"
                                ? "text-emerald-400"
                                : "text-red-400"
                            }
                          >
                            {trade.direction}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-white">${trade.entry_price.toFixed(2)}</td>
                        <td className="py-3 px-4 text-white">${trade.exit_price.toFixed(2)}</td>
                        <td className={`py-3 px-4 font-bold ${pnlColor}`}>
                          {trade.realized_pnl_usd >= 0 ? "+" : ""}${trade.realized_pnl_usd.toFixed(2)}
                        </td>
                        <td className={`py-3 px-4 font-bold ${pnlColor}`}>
                          {trade.realized_pnl_percent >= 0 ? "+" : ""}
                          {trade.realized_pnl_percent.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs">{trade.exit_reason}</td>
                        <td className={`py-3 px-4 font-bold ${scoreColor}`}>
                          {score?.combined_score || "—"}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-4 px-4 text-center text-slate-500">
                      No trades found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
