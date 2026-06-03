import { useState } from "react";
import axios from "axios";
import { apiUrl } from "@/lib/api";

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

/** Top 50 liquid USDT pairs on Binance (by typical market cap rank) */
const TOP_COINS: string[] = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "TRXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "MATICUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "AVAXUSDT",
  "SHIBUSDT",
  "UNIUSDT",
  "ATOMUSDT",
  "XLMUSDT",
  "ETCUSDT",
  "FILUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "NEARUSDT",
  "INJUSDT",
  "STXUSDT",
  "IMXUSDT",
  "GRTUSDT",
  "AAVEUSDT",
  "ALGOUSDT",
  "SANDUSDT",
  "MANAUSDT",
  "EGLDUSDT",
  "XTZUSDT",
  "FLOWUSDT",
  "AXSUSDT",
  "THETAUSDT",
  "RUNEUSDT",
  "SNXUSDT",
  "CRVUSDT",
  "MKRUSDT",
  "COMPUSDT",
  "LDOUSDT",
  "PEPEUSDT",
  "WLDUSDT",
  "SEIUSDT",
  "SUIUSDT",
  "TIAUSDT",
  "FETUSDT",
  "RENDERUSDT",
  "ENAUSDT",
];

type CoinPreset = 10 | 20 | 30 | 50 | "custom";

const PRESET_OPTIONS: { label: string; value: CoinPreset }[] = [
  { label: "Top 10", value: 10 },
  { label: "Top 20", value: 20 },
  { label: "Top 30", value: 30 },
  { label: "Top 50", value: 50 },
  { label: "Custom", value: "custom" },
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

  const [preset, setPreset] = useState<CoinPreset>(10);
  const [coinCount, setCoinCount] = useState(10);
  const [customCoins, setCustomCoins] = useState<string[]>(TOP_COINS.slice(0, 10));

  const [scanFrequency, setScanFrequency] = useState(5);
  const [positionSizePercent, setPositionSizePercent] = useState(100 / 10);
  const [stopLossPercent, setStopLossPercent] = useState(2);
  const [takeProfitPercent, setTakeProfitPercent] = useState(5);
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState(5);

  const applyPreset = (value: CoinPreset) => {
    setPreset(value);
    if (value === "custom") {
      return;
    }
    const count = Math.min(value, TOP_COINS.length);
    const coins = TOP_COINS.slice(0, count);
    setCoinCount(count);
    setCustomCoins(coins);
    setPositionSizePercent(100 / count);
    setMaxConcurrentPositions(Math.min(10, count));
  };

  const handleCustomCoinsText = (text: string) => {
    const coins = text
      .split(/[,\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length > 0)
      .map((c) => (c.endsWith("USDT") ? c : `${c}USDT`));
    const unique = Array.from(new Set(coins));
    setCustomCoins(unique);
    setCoinCount(unique.length);
    setPositionSizePercent(unique.length > 0 ? 100 / unique.length : 100);
    setMaxConcurrentPositions(Math.min(10, Math.max(1, unique.length)));
  };

  const handleStart = async () => {
    if (customCoins.length === 0) {
      alert("Select at least one coin to monitor");
      return;
    }

    setLoading(true);
    try {
      const config: MonitorConfig = {
        coin_count: customCoins.length,
        custom_coins: customCoins,
        scan_frequency: scanFrequency,
        position_size_per_coin:
          (initialBalance * positionSizePercent) / 100 / customCoins.length,
        max_concurrent_positions: maxConcurrentPositions,
        stop_loss_percent: stopLossPercent,
        take_profit_percent: takeProfitPercent,
        trading_type: tradingType,
      };

      await axios.post(apiUrl("/api/paper-trading/start-multi-coin-monitor"), {
        session_id: sessionId,
        strategy_id: strategyId,
        config,
      });

      onStart(config);
    } catch (error) {
      alert(
        `Error starting monitor: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Multi-Coin Monitor Setup</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl transition"
            disabled={loading}
          >
            ×
          </button>
        </div>

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

        <div className="p-6 space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-white mb-4">
                  1. Select coins to monitor
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  Monitor top liquid pairs or paste your own list (up to {TOP_COINS.length}{" "}
                  preset symbols).
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {PRESET_OPTIONS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => applyPreset(option.value)}
                      className={`py-3 px-4 rounded-lg font-semibold transition ${
                        preset === option.value
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {preset === "custom" && (
                  <textarea
                    value={customCoins.join(", ")}
                    onChange={(e) => handleCustomCoinsText(e.target.value)}
                    className="w-full mb-4 bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="BTCUSDT, ETHUSDT, SOLUSDT, ..."
                    rows={4}
                  />
                )}

                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">
                    Selected ({customCoins.length} coins)
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
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

                {preset === 50 && (
                  <p className="text-amber-300/90 text-xs mt-2">
                    Top 50 uses more API calls per scan — consider 10–30s frequency on step 2.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">2. Scan frequency</h3>
              <p className="text-slate-400 text-sm">
                How often to check each of {customCoins.length} coins for signals.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Every 5 seconds", value: 5 },
                  { label: "Every 10 seconds", value: 10 },
                  { label: "Every 30 seconds", value: 30 },
                  { label: "Every 1 minute", value: 60 },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
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

              {customCoins.length >= 40 && (
                <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
                  <p className="text-amber-200 text-sm">
                    Monitoring {customCoins.length} coins: use 30–60s scans to reduce load and
                    rate limits.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">3. Position sizing</h3>
              <p className="text-slate-400 text-sm">Capital allocated per coin.</p>

              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Per-coin allocation: {positionSizePercent.toFixed(1)}%
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
                  Per-coin: $
                  {(
                    (initialBalance * positionSizePercent) /
                    100 /
                    Math.max(1, customCoins.length)
                  ).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">4. Risk management</h3>

              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Stop loss: {stopLossPercent.toFixed(1)}%
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
                  Take profit: {takeProfitPercent.toFixed(1)}%
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
                  Max concurrent positions: {maxConcurrentPositions}
                </label>
                <input
                  type="range"
                  min="1"
                  max={Math.min(20, customCoins.length)}
                  value={maxConcurrentPositions}
                  onChange={(e) => setMaxConcurrentPositions(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>

              <p className="text-emerald-300 text-sm">
                Trading type: {tradingType === "spot" ? "Spot" : "Futures"} (from strategy)
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-700 bg-slate-800/50 p-6 flex justify-between gap-4">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition font-semibold"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={customCoins.length === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2 rounded-lg transition font-semibold"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={loading || customCoins.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white py-2 rounded-lg transition font-semibold"
            >
              {loading ? "Starting…" : "Start monitoring"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
