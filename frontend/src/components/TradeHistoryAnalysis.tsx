import { useState, useEffect } from "react";
import { sessionStorageManager, type SessionAlert } from "@/lib/sessionStorage";

interface TradeData {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  timestamp: string;
  pnl?: number;
}

interface TradeHistoryAnalysisProps {
  session_id: string;
  trades: TradeData[];
  onExportTrades?: (trades: TradeData[]) => void;
}

export default function TradeHistoryAnalysis({
  session_id,
  trades,
  onExportTrades,
}: TradeHistoryAnalysisProps) {
  const [alerts, setAlerts] = useState<SessionAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<TradeData | null>(null);
  const [filter, setFilter] = useState<"all" | "buy" | "sell" | "profit" | "loss">("all");

  useEffect(() => {
    const sessionAlerts = sessionStorageManager.getSessionAlerts(session_id);
    setAlerts(sessionAlerts);
  }, [session_id]);

  const filteredTrades = trades.filter((trade) => {
    if (filter === "all") return true;
    if (filter === "buy") return trade.side === "BUY";
    if (filter === "sell") return trade.side === "SELL";
    if (filter === "profit") return trade.pnl && trade.pnl > 0;
    if (filter === "loss") return trade.pnl && trade.pnl < 0;
    return true;
  });

  const unreadAlerts = alerts.filter((a) => !a.read);

  const stats = {
    totalTrades: trades.length,
    buyOrders: trades.filter((t) => t.side === "BUY").length,
    sellOrders: trades.filter((t) => t.side === "SELL").length,
    profitableTrades: trades.filter((t) => t.pnl && t.pnl > 0).length,
    totalProfit: trades
      .filter((t) => t.pnl && t.pnl > 0)
      .reduce((sum, t) => sum + (t.pnl || 0), 0),
    totalLoss: trades
      .filter((t) => t.pnl && t.pnl < 0)
      .reduce((sum, t) => sum + (t.pnl || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Alerts Section */}
      {unreadAlerts.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔔</span>
              <h4 className="font-semibold text-blue-300">
                Unread Alerts ({unreadAlerts.length})
              </h4>
            </div>
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              {showAlerts ? "Hide" : "Show"}
            </button>
          </div>

          {showAlerts && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {unreadAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-blue-900/30 border border-blue-600 rounded p-3 cursor-pointer hover:bg-blue-900/50"
                  onClick={() =>
                    sessionStorageManager.markAlertAsRead(alert.id)
                  }
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-blue-300">{alert.title}</p>
                      <p className="text-sm text-blue-200">{alert.message}</p>
                    </div>
                    <span className="text-xs text-blue-400">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trade Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Total Trades</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.totalTrades}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Buy Orders</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{stats.buyOrders}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Sell Orders</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{stats.sellOrders}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Win Rate</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {stats.totalTrades > 0
              ? Math.round(
                  (stats.profitableTrades / stats.totalTrades) * 100
                )
              : 0}
            %
          </p>
        </div>
      </div>

      {/* Trade History */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Trade History</h3>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) =>
                setFilter(
                  e.target.value as
                    | "all"
                    | "buy"
                    | "sell"
                    | "profit"
                    | "loss"
                )
              }
              className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-1 text-sm"
            >
              <option value="all">All Trades</option>
              <option value="buy">Buy Orders</option>
              <option value="sell">Sell Orders</option>
              <option value="profit">Profits Only</option>
              <option value="loss">Losses Only</option>
            </select>
            {onExportTrades && (
              <button
                onClick={() => onExportTrades(filteredTrades)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1 text-sm rounded transition"
              >
                📥 Export
              </button>
            )}
          </div>
        </div>

        {filteredTrades.length === 0 ? (
          <div className="p-6 text-center text-slate-400">
            No trades found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="text-left px-6 py-3 text-slate-300">Symbol</th>
                  <th className="text-left px-6 py-3 text-slate-300">Side</th>
                  <th className="text-right px-6 py-3 text-slate-300">Qty</th>
                  <th className="text-right px-6 py-3 text-slate-300">Price</th>
                  <th className="text-right px-6 py-3 text-slate-300">P&L</th>
                  <th className="text-left px-6 py-3 text-slate-300">Time</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredTrades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="hover:bg-slate-800/50 transition cursor-pointer"
                    onClick={() =>
                      setSelectedTrade(
                        selectedTrade?.id === trade.id ? null : trade
                      )
                    }
                  >
                    <td className="px-6 py-3 font-semibold text-white">
                      {trade.symbol}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          trade.side === "BUY"
                            ? "bg-blue-900/30 text-blue-300"
                            : "bg-purple-900/30 text-purple-300"
                        }`}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-300">
                      {trade.quantity}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-300">
                      ${trade.price.toFixed(2)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right font-semibold ${
                        trade.pnl
                          ? trade.pnl > 0
                            ? "text-green-400"
                            : "text-red-400"
                          : "text-slate-400"
                      }`}
                    >
                      {trade.pnl
                        ? `$${Math.abs(trade.pnl).toFixed(2)}`
                        : "-"}
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs">
                      {new Date(trade.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {selectedTrade?.id === trade.id && "📌"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Trade Details */}
      {selectedTrade && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h4 className="font-semibold text-white mb-4">Trade Details</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Symbol</p>
              <p className="text-white font-semibold">{selectedTrade.symbol}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Side</p>
              <p className="text-white font-semibold">{selectedTrade.side}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Quantity</p>
              <p className="text-white font-semibold">{selectedTrade.quantity}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Price</p>
              <p className="text-white font-semibold">
                ${selectedTrade.price.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Timestamp</p>
              <p className="text-white font-semibold text-xs">
                {new Date(selectedTrade.timestamp).toLocaleString()}
              </p>
            </div>
            {selectedTrade.pnl && (
              <div>
                <p className="text-slate-400 text-sm">P&L</p>
                <p
                  className={`font-semibold ${
                    selectedTrade.pnl > 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  ${selectedTrade.pnl.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
