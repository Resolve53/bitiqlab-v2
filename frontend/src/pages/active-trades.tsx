import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { apiUrl } from "@/lib/api";

interface Trade {
  id: string;
  coin: string;
  direction: string;
  entry_price: number;
  current_price: number;
  unrealized_pnl_usd: number;
  unrealized_pnl_percent: number;
  status: string;
  created_at: string;
  quantity: number;
  stop_loss: number;
  take_profit: number;
}

export default function ActiveTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchTrades = async () => {
    try {
      setTrades([]);
    } catch (error) {
      console.error("Error fetching trades:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalPnL = trades.reduce((sum, t) => sum + t.unrealized_pnl_usd, 0);
  const totalPnLPercent = trades.length > 0
    ? (trades.reduce((sum, t) => sum + t.unrealized_pnl_percent, 0) / trades.length)
    : 0;
  const winningTrades = trades.filter((t) => t.unrealized_pnl_usd > 0).length;
  const losingTrades = trades.filter((t) => t.unrealized_pnl_usd < 0).length;

  return (
    <MainLayout title="Active Trades">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total Open Trades</p>
            <p className="text-3xl font-bold text-white">{trades.length}</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total P&L (USD)</p>
            <p className={`text-3xl font-bold ${totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-2">{totalPnLPercent.toFixed(2)}% avg</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Winning / Losing</p>
            <p className="text-3xl font-bold text-white">{winningTrades} / {losingTrades}</p>
            <p className="text-xs text-slate-500 mt-2">
              {trades.length > 0 ? ((winningTrades / trades.length) * 100).toFixed(0) : 0}% win rate
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Avg Trade Duration</p>
            <p className="text-3xl font-bold text-white">12m</p>
            <p className="text-xs text-slate-500 mt-2">From entry to exit</p>
          </div>
        </div>

        {/* Active Trades Table */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">OPEN POSITIONS</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300">SYMBOL</th>
                  <th className="text-left py-3 px-4 text-slate-300">DIRECTION</th>
                  <th className="text-left py-3 px-4 text-slate-300">ENTRY</th>
                  <th className="text-left py-3 px-4 text-slate-300">CURRENT</th>
                  <th className="text-left py-3 px-4 text-slate-300">QUANTITY</th>
                  <th className="text-left py-3 px-4 text-slate-300">P&L (USD)</th>
                  <th className="text-left py-3 px-4 text-slate-300">P&L %</th>
                  <th className="text-left py-3 px-4 text-slate-300">SL</th>
                  <th className="text-left py-3 px-4 text-slate-300">TP</th>
                </tr>
              </thead>
              <tbody>
                {trades.length > 0 ? (
                  trades.map((trade) => {
                    const pnlColor = trade.unrealized_pnl_usd >= 0 ? "text-emerald-400" : "text-red-400";
                    return (
                      <tr key={trade.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
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
                        <td className="py-3 px-4 text-white">${trade.current_price.toFixed(2)}</td>
                        <td className="py-3 px-4 text-slate-400">{trade.quantity.toFixed(4)}</td>
                        <td className={`py-3 px-4 font-bold ${pnlColor}`}>
                          {trade.unrealized_pnl_usd >= 0 ? "+" : ""}${trade.unrealized_pnl_usd.toFixed(2)}
                        </td>
                        <td className={`py-3 px-4 font-bold ${pnlColor}`}>
                          {trade.unrealized_pnl_percent >= 0 ? "+" : ""}
                          {trade.unrealized_pnl_percent.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-red-400">${trade.stop_loss.toFixed(2)}</td>
                        <td className="py-3 px-4 text-emerald-400">${trade.take_profit.toFixed(2)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-4 px-4 text-center text-slate-500">
                      No open trades
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
