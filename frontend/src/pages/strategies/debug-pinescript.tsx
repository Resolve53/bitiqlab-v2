import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";

interface SyntaxError {
  line: number;
  column: number;
  message: string;
  suggestion: string;
  severity: "error" | "warning";
}

export default function DebugPineScript() {
  const router = useRouter();
  const [scriptContent, setScriptContent] = useState("");
  const [fileName, setFileName] = useState("script.pine");
  const [debugResult, setDebugResult] = useState<any>(null);
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);
  const [autoValidate, setAutoValidate] = useState(true);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Auto-validate as user types
  useEffect(() => {
    if (!autoValidate || !scriptContent) return;

    const timer = setTimeout(() => {
      const validationResult = validateScript(scriptContent);
      setDebugResult(validationResult);
      setHighlightedLines(validationResult.errors.map((e: SyntaxError) => e.line));
    }, 500);

    return () => clearTimeout(timer);
  }, [scriptContent, autoValidate]);

  const validateScript = (code: string) => {
    const errors: SyntaxError[] = [];
    const warnings: SyntaxError[] = [];
    const lines = code.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      if (!line || line.startsWith("//")) continue;

      if (line.endsWith("=") || line.endsWith("+") || line.endsWith("-") || line.endsWith("*") || line.endsWith("/")) {
        errors.push({
          line: lineNum,
          column: line.length,
          message: "Syntax error at input 'end of line without line continuation'",
          suggestion: "Continue the line with the next line or use parentheses for multi-line expressions",
          severity: "error",
        });
      }

      if ((line.match(/\(/g) || []).length !== (line.match(/\)/g) || []).length) {
        warnings.push({
          line: lineNum,
          column: 0,
          message: "Unmatched parentheses detected",
          suggestion: "Check that all opening '(' have matching closing ')'",
          severity: "warning",
        });
      }

      if (line.includes("strategy.entry") || line.includes("strategy.exit")) {
        if (!line.includes('"')) {
          warnings.push({
            line: lineNum,
            column: line.indexOf("strategy"),
            message: "Strategy order ID should be a string",
            suggestion: "Example: strategy.entry(\"BUY\", strategy.long)",
            severity: "warning",
          });
        }
      }
    }

    const hasStrategy = code.includes("strategy(");
    const hasStudy = code.includes("study(");

    if (!hasStrategy && !hasStudy && code.trim().length > 0) {
      errors.push({
        line: 1,
        column: 1,
        message: "Missing strategy() or study() declaration",
        suggestion: "Add at the beginning: strategy(title=\"My Strategy\", overlay=true)",
        severity: "error",
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 && warnings.length === 0
        ? "✅ Script is valid! Ready to deploy."
        : `⚠️ Found ${errors.length} error(s) and ${warnings.length} warning(s)`,
    };
  };

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
    setDebugResult(null);
    setHighlightedLines([]);
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

  const jumpToLine = (lineNum: number) => {
    if (!editorRef.current) return;

    const lines = scriptContent.split("\n");
    const charPosition = lines.slice(0, lineNum - 1).reduce((sum, line) => sum + line.length + 1, 0);

    editorRef.current.focus();
    editorRef.current.setSelectionRange(charPosition, charPosition + lines[lineNum - 1].length);
    editorRef.current.scrollTop = (lineNum - 1) * 20;
  };

  const applyFix = (error: SyntaxError) => {
    const lines = scriptContent.split("\n");
    const lineNum = error.line - 1;

    if (lineNum >= lines.length) return;

    let fixedLine = lines[lineNum];

    // Auto-fix: remove trailing operators
    if (fixedLine.trim().endsWith("=")) {
      fixedLine = fixedLine.trim().slice(0, -1);
    } else if (fixedLine.trim().endsWith("+")) {
      fixedLine = fixedLine.trim().slice(0, -1);
    }

    // Auto-fix: add missing strategy declaration
    if (error.message.includes("Missing strategy()")) {
      const newScript = `//@version=5\nstrategy("My Strategy", overlay=true)\n\n${scriptContent}`;
      setScriptContent(newScript);
      return;
    }

    lines[lineNum] = fixedLine;
    setScriptContent(lines.join("\n"));
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
          <h1 className="text-4xl font-bold text-white">🐛 Pine Script Debugger & Editor</h1>
          <p className="mt-2 text-slate-400">
            Edit, validate, and fix Pine Script errors instantly with one-click fixes
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Code Editor Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">📝 Pine Script Editor</h2>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="bg-slate-700/50 border border-slate-600 text-white rounded px-3 py-1 text-sm w-40"
                  placeholder="script.pine"
                />
              </div>

              {/* Code Editor with Line Numbers */}
              <div className="bg-slate-900 border border-slate-600 rounded-lg overflow-hidden mb-4">
                <div className="flex">
                  {/* Line Numbers */}
                  <div className="bg-slate-950 text-slate-500 text-right px-3 py-3 font-mono text-sm select-none border-r border-slate-700 min-w-12">
                    {scriptContent.split("\n").map((_, i) => (
                      <div key={i} className={`h-5 flex items-center justify-end ${highlightedLines.includes(i + 1) ? "bg-red-900/50 text-red-400 font-bold" : ""}`}>
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Editor */}
                  <textarea
                    ref={editorRef}
                    value={scriptContent}
                    onChange={(e) => setScriptContent(e.target.value)}
                    className="flex-1 bg-slate-900 text-slate-300 px-4 py-3 font-mono text-sm focus:outline-none resize-none"
                    placeholder="Paste your Pine Script code here or load an example..."
                    spellCheck="false"
                    style={{ height: "500px" }}
                  />
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-2 flex-wrap mb-4">
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
                <label className="flex items-center gap-2 ml-auto">
                  <input
                    type="checkbox"
                    checked={autoValidate}
                    onChange={(e) => setAutoValidate(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-400">Auto-validate</span>
                </label>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
              <h3 className="text-sm font-bold text-blue-300 mb-2">⌨️ Tips</h3>
              <ul className="text-xs text-blue-200 space-y-1">
                <li>• Click on error line number to jump to it</li>
                <li>• Click "✨ Fix" button for auto-fixes</li>
                <li>• Red line numbers = errors that need fixing</li>
                <li>• Validation runs automatically as you type</li>
              </ul>
            </div>
          </div>

          {/* Debug Panel */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-white mb-4">🔍 Validation</h2>

              {debugResult ? (
                <div>
                  {/* Status */}
                  <div className={`rounded-lg p-4 mb-4 ${debugResult.isValid ? "bg-emerald-900/20 border border-emerald-700" : "bg-red-900/20 border border-red-700"}`}>
                    <p className={`text-lg font-bold ${debugResult.isValid ? "text-emerald-400" : "text-red-400"}`}>
                      {debugResult.summary}
                    </p>
                  </div>

                  {/* Errors */}
                  {debugResult.errors.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-red-400 font-semibold mb-2">❌ Errors ({debugResult.errors.length})</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {debugResult.errors.map((error: SyntaxError, idx: number) => (
                          <div key={idx} className="bg-red-900/30 border border-red-700/50 rounded p-3">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <button
                                  onClick={() => jumpToLine(error.line)}
                                  className="text-red-300 hover:text-red-200 font-mono text-xs mb-1 underline"
                                >
                                  Line {error.line}, Col {error.column}
                                </button>
                                <p className="text-red-200 text-xs">{error.message}</p>
                                <p className="text-red-300/70 text-xs mt-1 italic">💡 {error.suggestion}</p>
                              </div>
                              <button
                                onClick={() => applyFix(error)}
                                className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs whitespace-nowrap font-semibold transition"
                                title="Auto-fix this error"
                              >
                                ✨ Fix
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {debugResult.warnings.length > 0 && (
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">⚠️ Warnings ({debugResult.warnings.length})</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {debugResult.warnings.map((warning: SyntaxError, idx: number) => (
                          <div key={idx} className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3">
                            <button
                              onClick={() => jumpToLine(warning.line)}
                              className="text-yellow-300 hover:text-yellow-200 font-mono text-xs mb-1 underline"
                            >
                              Line {warning.line}
                            </button>
                            <p className="text-yellow-200 text-xs">{warning.message}</p>
                            <p className="text-yellow-300/70 text-xs mt-1 italic">💡 {warning.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deploy Button */}
                  {debugResult.isValid && (
                    <button className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-semibold transition">
                      ✅ Ready to Deploy
                    </button>
                  )}
                </div>
              ) : scriptContent ? (
                <div className="text-center py-8">
                  <p className="text-slate-400">Validation results will appear here</p>
                  <p className="text-slate-500 text-sm mt-1">Auto-validate is {autoValidate ? "enabled" : "disabled"}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-4xl mb-4">📝</p>
                  <p className="text-slate-400 mb-2">Paste Pine Script code to validate</p>
                  <p className="text-slate-500 text-sm">Or load an example to get started</p>
                  <button
                    onClick={handleLoadExample}
                    className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    Load Example
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
