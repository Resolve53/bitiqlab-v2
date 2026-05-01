import { useState } from "react";
import axios from "axios";

interface MonitorConfig {
  coin_count: number;
  custom_coins: string[];
  scan_frequency: number;
  position_size_per_coin: number;
  max_concurrent_positions: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  trading_type: "spot" | "futures";
}

interface MonitoringSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
  strategyId: string;
}

export default function MonitoringSettingsModal({
  isOpen,
  onClose,
  sessionId,
  strategyId,
}: MonitoringSettingsModalProps) {
  const [config, setConfig] = useState<MonitorConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = async () => {
    if (!sessionId) {
      setError("No active trading session. Start paper trading first.");
      return;
    }

    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await axios.get(
        `${apiUrl}/api/paper-trading/${sessionId}/status`
      );

      if (response.data.data.multi_coin_config) {
        setConfig(response.data.data.multi_coin_config);
        setError(null);
      } else {
        setError("No multi-coin monitor configuration found. Set one up in the Advanced Monitor.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    loadConfig();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">
            📊 Monitoring Configuration
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl transition"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-slate-400">Loading configuration...</p>
            </div>
          ) : error ? (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
              <p className="text-red-300">{error}</p>
            </div>
          ) : config ? (
            <div className="space-y-6">
              {/* Coins Being Monitored */}
              <div>
                <h3 className="text-lg font-bold text-white mb-3">
                  🪙 Coins Being Monitored ({config.custom_coins.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {config.custom_coins.map((coin) => (
                    <span
                      key={coin}
                      className="bg-emerald-900/50 text-emerald-300 px-3 py-1 rounded-full text-sm font-mono"
                    >
                      {coin}
                    </span>
                  ))}
                </div>
              </div>

              {/* Scan Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                  <p className="text-slate-400 text-sm">Scan Frequency</p>
                  <p className="text-xl font-bold text-white mt-1">
                    {config.scan_frequency}s
                  </p>
                </div>

                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                  <p className="text-slate-400 text-sm">Trading Type</p>
                  <p className="text-xl font-bold text-white mt-1">
                    {config.trading_type === "spot" ? "Spot" : "Futures"}
                  </p>
                </div>

                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                  <p className="text-slate-400 text-sm">Per-Coin Capital</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">
                    ${config.position_size_per_coin.toFixed(2)}
                  </p>
                </div>

                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                  <p className="text-slate-400 text-sm">Max Concurrent</p>
                  <p className="text-xl font-bold text-white mt-1">
                    {config.max_concurrent_positions} positions
                  </p>
                </div>
              </div>

              {/* Risk Management */}
              <div>
                <h3 className="text-lg font-bold text-white mb-3">
                  ⚠️ Risk Management
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                    <p className="text-slate-400 text-sm">Stop Loss</p>
                    <p className="text-xl font-bold text-red-400 mt-1">
                      {config.stop_loss_percent}%
                    </p>
                  </div>

                  <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
                    <p className="text-slate-400 text-sm">Take Profit</p>
                    <p className="text-xl font-bold text-green-400 mt-1">
                      {config.take_profit_percent}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">Click the button below to load your monitoring configuration</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 bg-slate-800/50 p-6 flex justify-between gap-4">
          {!config && (
            <button
              onClick={handleOpen}
              disabled={loading || !sessionId}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-wait text-white py-2 rounded-lg transition font-semibold"
            >
              {loading ? "Loading..." : "Load Configuration"}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
