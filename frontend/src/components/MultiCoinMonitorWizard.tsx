import { useState } from "react";
import axios from "axios";

interface MonitorConfig {
  coin_count: number;
  custom_coins?: string[];
  scan_frequency: number;
  position_size_per_coin: number;
  max_concurrent_positions: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  trading_type: "spot" | "futures";
}

interface MultiCoinMonitorWizardProps {
  sessionId: string;
  strategyId: string;
  tradingType: "spot" | "futures";
  initialBalance: number;
  onClose: () => void;
  onStart: (config: MonitorConfig) => void;
}

const TOP_COINS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "ADAUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "MATICUSDT",
  "LINKUSDT",
  "LTCUSDT",
  "SHIBUSDT",
  "TRXUSDT",
  "XLMUSDT",
  "ALGOUSDT",
  "VETUSDT",
  "FILUSDT",
  "APMUSDT",
  "NEOUSDT",
  "EGLDUSDT",
  "ATOMUSDT",
  "DOTUSDT",
  "UNIUSDT",
  "AAVUSDT",
  "CAKEUSDT",
  "GRTUSDT",
  "KSMUSDT",
  "COMPUSDT",
  "SNXUSDT",
  "YFIUSDT",
];

export default function MultiCoinMonitorWizard({
  sessionId,
  strategyId,
  tradingType,
  initialBalance,
  onClose,
  onStart,
}: MultiCoinMonitorWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Coin Selection
  const [coinCount, setCoinCount] = useState(10);
  const [customCoins, setCustomCoins] = useState<string[]>(TOP_COINS.slice(0, 10));

  // Step 2: Scan Frequency
  const [scanFrequency, setScanFrequency] = useState(5);

  // Step 3: Position Sizing
  const [positionSizePercent, setPositionSizePercent] = useState(100 / coinCount);

  // Step 4: Risk Management
  const [stopLossPercent, setStopLossPercent] = useState(2);
  const [takeProfitPercent, setTakeProfitPercent] = useState(5);
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState(Math.min(5, coinCount));

  const handleCoinCountChange = (count: number) => {
    setCoinCount(count);
    if (count <= 30) {
      setCustomCoins(TOP_COINS.slice(0, count));
    }
    setPositionSizePercent(100 / count);
    setMaxConcurrentPositions(Math.min(5, count));
  };

  const handleCustomCoinsChange = (coins: string[]) => {
    setCustomCoins(coins);
    setCoinCount(coins.length);
    setPositionSizePercent(100 / coins.length);
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const config: MonitorConfig = {
        coin_count: coinCount,
        custom_coins: customCoins,
        scan_frequency: scanFrequency,
        position_size_per_coin: (initialBalance * positionSizePercent) / 100 / coinCount,
        max_concurrent_positions: maxConcurrentPositions,
        stop_loss_percent: stopLossPercent,
        take_profit_percent: takeProfitPercent,
        trading_type: tradingType,
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      await axios.post(`${apiUrl}/api/paper-trading/start-multi-coin-monitor`, {
        session_id: sessionId,
        strategy_id: strategyId,
        config,
      });

      onStart(config);
    } catch (error) {
      alert(`Error starting monitor: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">
            🚀 Multi-Coin Monitor Setup
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl transition"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex gap-2 mb-6">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`flex-1 h-2 rounded-full transition ${
                  s <= step ? "bg-emerald-500" : "bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Step 1: Coin Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-white mb-4">
                  1️⃣ Select Coins to Monitor
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  Choose how many of the top coins you want to scan for trading opportunities
                </p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: "Top 10", value: 10 },
                    { label: "Top 20", value: 20 },
                    { label: "Top 30", value: 30 },
                    { label: "Custom", value: 0 },
                  ].map((option) => (
                    <button
                      key={option.label}
                      onClick={() => handleCoinCountChange(option.value)}
                      className={`py-3 px-4 rounded-lg font-semibold transition ${
                        (option.value === 0 ? coinCount > 30 : coinCount === option.value)
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">
                    📊 Selected Coins ({customCoins.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {customCoins.map((coin) => (
                      <span
                        key={coin}
                        className="bg-slate-900 text-emerald-400 px-3 py-1 rounded-full text-sm font-mono"
                      >
                        {coin}
                      </span>
                    ))}
                  </div>
                </div>

                {coinCount > 30 && (
                  <textarea
                    value={customCoins.join(", ")}
                    onChange={(e) =>
                      handleCustomCoinsChange(
                        e.target.value.split(",").map((c) => c.trim().toUpperCase())
                      )
                    }
                    className="w-full mt-4 bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Enter coin symbols separated by commas: BTCUSDT, ETHUSDT, ..."
                    rows={3}
                  />
                )}
              </div>
            </div>
          )}

          {/* Step 2: Scan Frequency */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">2️⃣ Scan Frequency</h3>
              <p className="text-slate-400 text-sm">
                How often should the system check each coin for trading signals?
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Every 5 seconds (Fast)", value: 5 },
                  { label: "Every 10 seconds", value: 10 },
                  { label: "Every 30 seconds", value: 30 },
                  { label: "Every 1 minute", value: 60 },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setScanFrequency(option.value)}
                    className={`py-3 px-4 rounded-lg font-semibold transition text-sm ${
                      scanFrequency === option.value
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                <p className="text-blue-300 text-sm">
                  💡 <strong>Note:</strong> Faster scanning = more trades but higher CPU usage. Start with 5-10 seconds.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Position Sizing */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">3️⃣ Position Sizing</h3>
              <p className="text-slate-400 text-sm">
                How much capital to allocate per coin
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Per-Coin Allocation: {positionSizePercent.toFixed(1)}%
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={positionSizePercent}
                    onChange={(e) => setPositionSizePercent(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Per-coin capital: ${(
                      (initialBalance * positionSizePercent) /
                      100 /
                      coinCount
                    ).toFixed(2)}
                  </p>
                </div>

                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                  <p className="text-sm text-slate-400">📊 Capital Allocation:</p>
                  <p className="text-lg font-bold text-white mt-2">
                    ${initialBalance.toFixed(2)} total
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    ÷ {coinCount} coins = ${(initialBalance / coinCount).toFixed(2)} per coin
                  </p>
                </div>
              </div>

              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                <p className="text-blue-300 text-sm">
                  💡 <strong>Tip:</strong> Use 100% to split evenly. Lower % to be more conservative.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Risk Management */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">4️⃣ Risk Management</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Stop Loss: {stopLossPercent.toFixed(1)}%
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={stopLossPercent}
                    onChange={(e) => setStopLossPercent(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Take Profit: {takeProfitPercent.toFixed(1)}%
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={takeProfitPercent}
                    onChange={(e) => setTakeProfitPercent(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Max Concurrent Positions: {maxConcurrentPositions}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max={coinCount}
                    value={maxConcurrentPositions}
                    onChange={(e) => setMaxConcurrentPositions(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Won't open more than {maxConcurrentPositions} trades at once
                  </p>
                </div>
              </div>

              <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4">
                <p className="text-emerald-300 text-sm">
                  ✅ <strong>Trading Type:</strong> {tradingType === "spot" ? "Spot Trading" : "Futures Trading"} (from strategy)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="border-t border-slate-700 bg-slate-800/50 p-6 flex justify-between gap-4">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition font-semibold"
          >
            {step === 1 ? "Cancel" : "← Back"}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg transition font-semibold"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-wait text-white py-2 rounded-lg transition font-semibold"
            >
              {loading ? "Starting..." : "🚀 Start Monitoring"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
