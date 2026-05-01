import { useState } from "react";
import MainLayout from "@/components/MainLayout";

export default function Settings() {
  const [email] = useState("user@bitiq.ai");
  const [apiKey, setApiKey] = useState("••••••••••••••••");
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <MainLayout title="Settings">
      <div className="max-w-2xl space-y-6">
        {/* Account Settings */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-6">Account Settings</h2>

          {/* Email */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-300 mb-2">Email Address</label>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white">
              {email}
            </div>
            <p className="text-xs text-slate-400 mt-2">Contact support to change your email address</p>
          </div>

          {/* API Key */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-300 mb-2">Binance API Key</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white font-mono text-sm">
                {showApiKey ? apiKey : "••••••••••••••••"}
              </div>
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm font-semibold"
              >
                {showApiKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">Used for connecting to Binance testnet</p>
          </div>
        </div>

        {/* Trading Preferences */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-6">Trading Preferences</h2>

          {/* Default Risk Level */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-300 mb-3">Default Risk Level</label>
            <div className="flex gap-3">
              {["Low", "Medium", "High"].map((level) => (
                <button
                  key={level}
                  className="px-4 py-2 rounded-lg transition border"
                  defaultChecked={level === "Medium"}
                  onClick={() => {}}
                >
                  <span className={`font-semibold ${
                    level === "Medium"
                      ? "text-white bg-blue-900/50 border-blue-700"
                      : "text-slate-400 border-slate-700 hover:text-white"
                  }`}>
                    {level}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Default Position Size */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-300 mb-2">Default Position Size %</label>
            <input
              type="number"
              defaultValue="5"
              min="0.1"
              max="100"
              step="0.1"
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-slate-400 mt-2">Percentage of portfolio per trade</p>
          </div>

          {/* Notifications */}
          <div className="mb-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                defaultChecked={true}
                className="w-4 h-4 rounded border-slate-600"
              />
              <span className="text-sm font-medium text-slate-300">Email alerts for trades</span>
            </label>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-400 mb-4">Danger Zone</h2>
          <p className="text-sm text-slate-300 mb-4">
            These actions cannot be undone. Please proceed with caution.
          </p>
          <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-semibold text-sm">
            Reset All Strategies
          </button>
        </div>

        {/* Save Button */}
        <div className="flex gap-3">
          <button className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-semibold">
            Save Settings
          </button>
          <button className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition font-semibold">
            Cancel
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
