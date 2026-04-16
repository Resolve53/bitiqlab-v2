import { useRouter } from "next/router";
import { useState, useEffect } from "react";

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  status: "OPEN" | "CLOSED";
  entryTime: string;
  signal: string;
}

interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  pnl?: number;
  timestamp: string;
  signal: string;
  claudeReason: string;
}

export default function TradingDashboard() {
  const router = useRouter();
  const [positions, setPositions] = useState<Position[]>([
    {
      id: "1",
      symbol: "BTCUSDT",
      quantity: 0.25,
      entryPrice: 42500,
      currentPrice: 43800,
      pnl: 325,
      pnlPercent: 3.06,
      status: "OPEN",
      entryTime: "2024-04-16 10:30",
      signal: "RSI Oversold + MACD Crossover",
    },
    {
      id: "2",
      symbol: "ETHUSDT",
      quantity: 1.5,
      entryPrice: 2200,
      currentPrice: 2245,
      pnl: 67.5,
      pnlPercent: 2.05,
      status: "OPEN",
      entryTime: "2024-04-16 12:15",
      signal: "Bollinger Band Bounce",
    },
    {
      id: "3",
      symbol: "BNBUSDT",
      quantity: 5.0,
      entryPrice: 600,
      currentPrice: 605,
      pnl: 25,
      pnlPercent: 0.83,
      status: "OPEN",
      entryTime: "2024-04-16 14:45",
      signal: "SMA Crossover Golden Cross",
    },
  ]);

  const [recentTrades] = useState<Trade[]>([
    {
      id: "1",
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.25,
      price: 42500,
      pnl: 325,
      timestamp: "2024-04-16 10:30:15",
      signal: "RSI < 30 (Oversold)",
      claudeReason: "Market oversold, historical data shows 78% win rate on this pattern in 1h timeframe",
    },
    {
      id: "2",
      symbol: "ETHUSDT",
      side: "BUY",
      quantity: 1.5,
      price: 2200,
      pnl: 67.5,
      timestamp: "2024-04-16 12:15:42",
      signal: "MACD Crossover",
      claudeReason: "MACD line crossed above signal line, indicating bullish momentum shift",
    },
    {
      id: "3",
      symbol: "BNBUSDT",
      side: "BUY",
      quantity: 5.0,
      price: 600,
      pnl: 25,
      timestamp: "2024-04-16 14:45:08",
      signal: "SMA Golden Cross",
      claudeReason: "20-period SMA crossed above 50-period SMA, strong uptrend signal",
    },
    {
      id: "4",
      symbol: "SOLUSDT",
      side: "SELL",
      quantity: 20.0,
      price: 145,
      pnl: 290,
      timestamp: "2024-04-16 08:22:33",
      signal: "RSI > 70 (Overbought)",
      claudeReason: "Overbought conditions detected, taking profits on 45% gain",
    },
  ]);

  const totalBalance = 10000;
  const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalPnLPercent = (totalPnL / totalBalance) * 100;

  // Simulate real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setPositions((prevPositions) =>
        prevPositions.map((position) => {
          const priceChange = (Math.random() - 0.5) * 100;
          const newPrice = Math.max(position.currentPrice + priceChange, 1);
          const newPnl = (newPrice - position.entryPrice) * position.quantity;
          const newPnlPercent = ((newPrice - position.entryPrice) / position.entryPrice) * 100;

          return {
            ...position,
            currentPrice: newPrice,
            pnl: newPnl,
            pnlPercent: newPnlPercent,
          };
        })
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-white">Claude Trading</h1>
              <p className="mt-2 text-slate-400">AI-Powered Autonomous Trading Portfolio</p>
            </div>
            <button
              onClick={() => router.push("/strategies")}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              View Strategies →
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total Portfolio Value</p>
            <p className="text-4xl font-bold text-white">${(totalBalance + totalPnL).toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Total P&L</p>
            <p className={`text-4xl font-bold ${totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
            </p>
            <p className={`text-sm mt-1 ${totalPnLPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnLPercent >= 0 ? "+" : ""}{totalPnLPercent.toFixed(2)}%
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Active Positions</p>
            <p className="text-4xl font-bold text-white">{positions.length}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <p className="text-slate-400 text-sm mb-2">Trades Today</p>
            <p className="text-4xl font-bold text-white">{recentTrades.length}</p>
          </div>
        </div>

        {/* Active Positions */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">📊 Active Positions</h2>
          <div className="space-y-3">
            {positions.map((position) => (
              <div
                key={position.id}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-5 hover:border-emerald-500/50 transition"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-white text-lg">{position.symbol}</span>
                      <span className="px-3 py-1 rounded text-sm font-semibold bg-emerald-500/20 text-emerald-400">
                        LONG
                      </span>
                      <span className="text-xs text-slate-500">{position.signal}</span>
                    </div>
                    <p className="text-slate-400 text-sm">
                      {position.quantity} @ ${position.entryPrice.toFixed(2)} → ${position.currentPrice.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Entry: {position.entryTime}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${position.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)}
                    </p>
                    <p className={`text-sm ${position.pnlPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {position.pnlPercent >= 0 ? "+" : ""}{position.pnlPercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trade History */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">📝 Trade History (Claude's Decisions)</h2>
          <div className="space-y-3">
            {recentTrades.map((trade) => (
              <div key={trade.id} className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-white">{trade.symbol}</span>
                      <span
                        className={`px-3 py-1 rounded text-sm font-semibold ${
                          trade.side === "BUY"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {trade.side}
                      </span>
                      <span className="text-xs text-slate-400">{trade.signal}</span>
                    </div>
                    <p className="text-slate-400 text-sm">
                      {trade.quantity} @ ${trade.price.toFixed(2)} • {trade.timestamp}
                    </p>
                  </div>
                  {trade.pnl && (
                    <div className="text-right">
                      <p className={`font-bold ${trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="bg-slate-900/50 border border-slate-700/30 rounded p-3">
                  <p className="text-xs text-slate-400">
                    <strong>Claude's reasoning:</strong> {trade.claudeReason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Analysis */}
        <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-6">
          <h3 className="text-lg font-bold text-emerald-300 mb-3">🤖 Claude AI Analysis</h3>
          <p className="text-emerald-300/80 text-sm leading-relaxed">
            Claude is analyzing market conditions across 5+ years of historical data using advanced technical indicators
            (RSI, MACD, Bollinger Bands, SMA crossovers). The system identified oversold conditions on BTC and momentum
            shifts on ETH, executing positions with 78% historical win rate. Next signals being analyzed for SOL and
            DOGE based on emerging chart patterns.
          </p>
        </div>
      </main>
    </div>
  );
}
