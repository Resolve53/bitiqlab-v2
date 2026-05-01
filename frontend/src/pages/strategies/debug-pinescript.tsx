import { useState } from "react";
import { useRouter } from "next/router";
import PineScriptDebugger from "@/components/PineScriptDebugger";

export default function DebugPineScript() {
  const router = useRouter();
  const [scriptContent, setScriptContent] = useState("");
  const [fileName, setFileName] = useState("script.pine");

  const handleLoadExample = () => {
    setScriptContent(`//@version=5
strategy("Trading Strategy", overlay=true)

// ===== INDICATORS =====
rsi = ta.rsi(close, 14)
macd, signal, hist = ta.macd(close, 12, 26, 9)
bb_basis = ta.bb_basis(close, 20, 2)
bb_dev = ta.bb_dev(close, 20, 2)

// ===== ENTRY CONDITIONS =====
longEntry = rsi < 30 and close < bb_basis
shortEntry = rsi > 70 and close > bb_basis

// ===== EXIT CONDITIONS =====
longExit = rsi > 70
shortExit = rsi < 30

// ===== TRADE EXECUTION =====
if longEntry
    strategy.entry("Long", strategy.long)
if longExit
    strategy.close("Long")

if shortEntry
    strategy.entry("Short", strategy.short)
if shortExit
    strategy.close("Short")`);
  };

  const handleClearAll = () => {
    setScriptContent("");
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(scriptContent));
    element.setAttribute("download", fileName);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.back()}
            className="text-emerald-400 hover:text-emerald-300 mb-4 font-semibold transition"
          >
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-white">🐛 Pine Script Debugger</h1>
          <p className="mt-2 text-slate-400">
            Validate your Pine Script code instantly. Find and fix syntax errors before deploying to TradingView.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Editor Panel */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">📝 Pine Script Code</h2>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="bg-slate-700/50 border border-slate-600 text-white rounded px-3 py-1 text-sm w-40"
                  placeholder="script.pine"
                />
              </div>

              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                className="w-full h-96 bg-slate-900 border border-slate-600 text-slate-300 rounded-lg px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                placeholder="Paste your Pine Script code here..."
              />

              <div className="flex gap-2 mt-4 flex-wrap">
                <button
                  onClick={handleLoadExample}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                >
                  📚 Load Example
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!scriptContent}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                >
                  💾 Download
                </button>
                <button
                  onClick={handleClearAll}
                  className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                >
                  🗑️ Clear
                </button>
              </div>
            </div>

            {/* Common Errors Reference */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">⚡ Common Errors & Fixes</h3>
              <div className="space-y-3 text-sm">
                <div className="bg-red-900/20 border border-red-700/50 rounded p-3">
                  <p className="text-red-300 font-mono">Line continuation error</p>
                  <p className="text-red-200 text-xs mt-1">
                    ❌ Wrong: <code>buyScore =</code>
                  </p>
                  <p className="text-emerald-300 text-xs">
                    ✅ Right: <code>buyScore = (condition1 ? 2 : 0) + (condition2 ? 1 : 0)</code>
                  </p>
                </div>

                <div className="bg-red-900/20 border border-red-700/50 rounded p-3">
                  <p className="text-red-300 font-mono">Missing strategy declaration</p>
                  <p className="text-red-200 text-xs mt-1">
                    ❌ Missing: <code>strategy()</code>
                  </p>
                  <p className="text-emerald-300 text-xs">
                    ✅ Add: <code>strategy("My Strategy", overlay=true)</code>
                  </p>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-3">
                  <p className="text-yellow-300 font-mono">Unmatched parentheses</p>
                  <p className="text-yellow-200 text-xs mt-1">
                    ⚠️ Check: Every <code>(</code> has matching <code>)</code>
                  </p>
                  <p className="text-yellow-300 text-xs">
                    💡 Use editor features to highlight matching brackets
                  </p>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-3">
                  <p className="text-yellow-300 font-mono">Strategy order syntax</p>
                  <p className="text-yellow-200 text-xs mt-1">
                    ⚠️ Order IDs must be strings
                  </p>
                  <p className="text-yellow-300 text-xs">
                    💡 Example: <code>strategy.entry("BUY", strategy.long)</code>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Debugger Panel */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-white mb-4">🔍 Validator</h2>

              {scriptContent ? (
                <PineScriptDebugger scriptContent={scriptContent} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-6xl mb-4">📝</p>
                  <p className="text-slate-400 mb-2">Paste Pine Script code on the left</p>
                  <p className="text-slate-500 text-sm">Click "🐛 Debug Script" to validate</p>
                  <button
                    onClick={handleLoadExample}
                    className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    Load Example to Get Started
                  </button>
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-6">
              <h3 className="text-lg font-bold text-blue-300 mb-3">💡 Tips for Valid Scripts</h3>
              <ul className="space-y-2 text-sm text-blue-200">
                <li>✓ Always start with //@version=5</li>
                <li>✓ Use strategy() or study() declaration</li>
                <li>✓ Wrap multi-line expressions in parentheses</li>
                <li>✓ String order IDs in strategy.entry()</li>
                <li>✓ Check indicator definitions match Pine Script syntax</li>
                <li>✓ Use ta. prefix for technical analysis functions</li>
              </ul>
            </div>

            {/* Next Steps */}
            <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-6">
              <h3 className="text-lg font-bold text-emerald-300 mb-3">🚀 Next Steps</h3>
              <ol className="space-y-2 text-sm text-emerald-200">
                <li>1. Validate your script here (no errors)</li>
                <li>2. Copy the validated script</li>
                <li>3. Open TradingView Pine Script Editor</li>
                <li>4. Paste and deploy to your chart</li>
                <li>5. Create paper trading session in Bitiq Lab</li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
