import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import SessionRecovery from "@/components/SessionRecovery";

interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  status: "OPEN" | "CLOSED";
  timestamp: string;
}

export default function PaperTrading() {
  const router = useRouter();
  const [activeTrades, setActiveTrades] = useState<Trade[]>([
    {
      id: "1",
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.5,
      entryPrice: 42500,
      currentPrice: 43200,
      pnl: 350,
      pnlPercent: 1.64,
      status: "OPEN",
      timestamp: "2024-04-16 08:30",
    },
    {
      id: "2",
      symbol: "ETHUSDT",
      side: "BUY",
      quantity: 2.0,
      entryPrice: 2200,
      currentPrice: 2180,
      pnl: -40,
      pnlPercent: -0.91,
      status: "OPEN",
      timestamp: "2024-04-16 09:15",
    },
  ]);

  const [closedTrades] = useState<Trade[]>([
    {
      id: "3",
      symbol: "BNBUSDT",
      side: "BUY",
      quantity: 5.0,
      entryPrice: 600,
      currentPrice: 615,
      pnl: 75,
      pnlPercent: 2.5,
      status: "CLOSED",
      timestamp: "2024-04-15 14:20",
    },
    {
      id: "4",
      symbol: "BNBUSDT",
      side: "SELL",
      quantity: 5.0,
      entryPrice: 615,
      currentPrice: 605,
      pnl: 50,
      pnlPercent: 0.81,
      status: "CLOSED",
      timestamp: "2024-04-16 02:45",
    },
  ]);

  const totalPnL = activeTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const totalPnLPercent = activeTrades.length > 0 ? (totalPnL / (activeTrades.reduce((sum, trade) => sum + (trade.entryPrice * trade.quantity), 0)) * 100) : 0;

  // Simulate real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTrades((trades) =>
        trades.map((trade) => {
          const priceChange = (Math.random() - 0.5) * 50;
          const newPrice = trade.currentPrice + priceChange;
          const newPnl = (newPrice - trade.entryPrice) * trade.quantity;
          const newPnlPercent = ((newPrice - trade.entryPrice) / trade.entryPrice) * 100;

          return {
            ...trade,
            currentPrice: newPrice,
            pnl: newPnl,
            pnlPercent: newPnlPercent,
          };
        })
      );
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, []);

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
          <h1 className="text-4xl font-bold text-white">Paper Trading</h1>
          <p className="mt-2 text-slate-400">Execute and monitor AI-generated strategies on Binance testnet</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Session Recovery */}
        <SessionRecovery />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Active Positions</p>
            <p className="text-3xl font-bold text-white">{activeTrades.length}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total P&L</p>
            <p className={`text-3xl font-bold ${totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              ${totalPnL.toFixed(2)}
            </p>
            <p className={`text-sm mt-1 ${totalPnLPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnLPercent >= 0 ? "+" : ""}{totalPnLPercent.toFixed(2)}%
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Closed Trades</p>
            <p className="text-3xl font-bold text-white">{closedTrades.length}</p>
          </div>
        </div>

        {/* Active Trades */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Active Trades 📈</h2>
          <div className="space-y-3">
            {activeTrades.map((trade) => (
              <div key={trade.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-emerald-500/50 transition">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-white text-lg">{trade.symbol}</span>
                      <span className={`px-3 py-1 rounded text-sm font-semibold ${trade.side === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {trade.side}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm">
                      {trade.quantity} @ ${trade.entryPrice.toFixed(2)} → ${trade.currentPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                    </p>
                    <p className={`text-sm ${trade.pnlPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {trade.pnlPercent >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Closed Trades */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Closed Trades ✓</h2>
          <div className="space-y-3">
            {closedTrades.map((trade) => (
              <div key={trade.id} className="bg-slate-800/20 border border-slate-700/50 rounded-lg p-4 opacity-75">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-white text-lg">{trade.symbol}</span>
                      <span className={`px-3 py-1 rounded text-sm font-semibold ${trade.side === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {trade.side}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm">{trade.timestamp}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                    </p>
                    <p className={`text-sm ${trade.pnlPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {trade.pnlPercent >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
