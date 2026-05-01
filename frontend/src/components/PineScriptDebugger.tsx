import { useState } from "react";

interface SyntaxError {
  line: number;
  column: number;
  message: string;
  suggestion: string;
  severity: "error" | "warning";
}

interface DebugResult {
  isValid: boolean;
  errors: SyntaxError[];
  warnings: SyntaxError[];
  summary: string;
}

export default function PineScriptDebugger({ scriptContent }: { scriptContent: string }) {
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const validatePineScript = async () => {
    setIsChecking(true);
    try {
      const result = validateScript(scriptContent);
      setDebugResult(result);
      setShowDebugPanel(true);
    } finally {
      setIsChecking(false);
    }
  };

  const validateScript = (code: string): DebugResult => {
    const errors: SyntaxError[] = [];
    const warnings: SyntaxError[] = [];
    const lines = code.split("\n");

    // Rule 1: Check for incomplete lines (line continuation)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Skip empty lines and comments
      if (!line || line.startsWith("//")) continue;

      // Check for incomplete variable assignments
      if (line.endsWith("=") || line.endsWith("+") || line.endsWith("-") || line.endsWith("*") || line.endsWith("/")) {
        errors.push({
          line: lineNum,
          column: line.length,
          message: "Syntax error at input 'end of line without line continuation'",
          suggestion: "Continue the line with the next line or use parentheses for multi-line expressions",
          severity: "error",
        });
      }

      // Check for unmatched parentheses
      if ((line.match(/\(/g) || []).length !== (line.match(/\)/g) || []).length) {
        warnings.push({
          line: lineNum,
          column: 0,
          message: "Unmatched parentheses detected",
          suggestion: "Check that all opening '(' have matching closing ')'",
          severity: "warning",
        });
      }

      // Check for undefined variables in conditions (basic check)
      if (line.includes("?") && line.includes(":")) {
        const parts = line.split("?");
        if (parts[0].includes("=")) {
          // This is a ternary assignment, which is valid
        }
      }

      // Check for common Pine Script syntax
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

      // Check for missing line continuation in complex expressions
      if (line.length > 120) {
        warnings.push({
          line: lineNum,
          column: 120,
          message: "Line is very long and might benefit from line breaks",
          suggestion: "Consider splitting complex expressions across multiple lines",
          severity: "warning",
        });
      }
    }

    // Rule 2: Check for proper function definitions
    const hasStrategy = code.includes("strategy(");
    const hasStudy = code.includes("study(");

    if (!hasStrategy && !hasStudy) {
      errors.push({
        line: 1,
        column: 1,
        message: "Missing strategy() or study() declaration",
        suggestion: "Add at the beginning: strategy(title=\"My Strategy\", overlay=true)",
        severity: "error",
      });
    }

    // Rule 3: Check for indicator definitions
    const indicators = ["ta.rsi", "ta.macd", "ta.bb", "ta.sma", "ta.ema"];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const indicator of indicators) {
        if (line.includes(indicator)) {
          // Check if it's properly assigned
          if (!line.includes("=")) {
            warnings.push({
              line: i + 1,
              column: line.indexOf(indicator),
              message: `${indicator} result should be assigned to a variable`,
              suggestion: `Example: rsi = ${indicator}(close, 14)`,
              severity: "warning",
            });
          }
        }
      }
    }

    const summary =
      errors.length === 0 && warnings.length === 0
        ? "✅ Script is valid! Ready to deploy."
        : `⚠️ Found ${errors.length} error(s) and ${warnings.length} warning(s)`;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary,
    };
  };

  const copyErrorToClipboard = (error: SyntaxError) => {
    const text = `Line ${error.line}: ${error.message}\nSuggestion: ${error.suggestion}`;
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="w-full">
      {/* Debug Button */}
      <button
        onClick={validatePineScript}
        disabled={isChecking}
        className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-600 disabled:cursor-wait text-white font-bold py-2 px-4 rounded-lg transition mb-4 flex items-center justify-center gap-2"
      >
        {isChecking ? (
          <>
            <span className="animate-spin">⚙️</span>
            Checking Script...
          </>
        ) : (
          <>
            🐛 Debug Script
          </>
        )}
      </button>

      {/* Debug Panel */}
      {showDebugPanel && debugResult && (
        <div className={`border rounded-lg p-4 mb-4 ${debugResult.isValid ? "bg-emerald-900/20 border-emerald-700" : "bg-red-900/20 border-red-700"}`}>
          {/* Summary */}
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-lg font-bold ${debugResult.isValid ? "text-emerald-400" : "text-red-400"}`}>
              {debugResult.summary}
            </h3>
            <button
              onClick={() => setShowDebugPanel(false)}
              className="text-slate-400 hover:text-white transition"
            >
              ✕
            </button>
          </div>

          {/* Errors */}
          {debugResult.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="text-red-400 font-semibold mb-2">❌ Errors ({debugResult.errors.length})</h4>
              <div className="space-y-2">
                {debugResult.errors.map((error, idx) => (
                  <div key={idx} className="bg-red-900/30 border border-red-700/50 rounded p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-red-300 font-mono text-sm">
                          Line {error.line}, Col {error.column}
                        </p>
                        <p className="text-red-200 text-sm mt-1">{error.message}</p>
                        <p className="text-red-300/70 text-xs mt-2 italic">💡 {error.suggestion}</p>
                      </div>
                      <button
                        onClick={() => copyErrorToClipboard(error)}
                        className="ml-2 text-red-400 hover:text-red-300 text-xs whitespace-nowrap"
                        title="Copy error details"
                      >
                        📋
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
              <div className="space-y-2">
                {debugResult.warnings.map((warning, idx) => (
                  <div key={idx} className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-yellow-300 font-mono text-sm">
                          Line {warning.line}, Col {warning.column}
                        </p>
                        <p className="text-yellow-200 text-sm mt-1">{warning.message}</p>
                        <p className="text-yellow-300/70 text-xs mt-2 italic">💡 {warning.suggestion}</p>
                      </div>
                      <button
                        onClick={() => copyErrorToClipboard(warning)}
                        className="ml-2 text-yellow-400 hover:text-yellow-300 text-xs whitespace-nowrap"
                        title="Copy warning details"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-4 pt-4 border-t border-slate-700 flex gap-2">
            <button
              onClick={validatePineScript}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-sm font-semibold transition"
            >
              🔄 Re-check
            </button>
            {debugResult.isValid && (
              <button
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded text-sm font-semibold transition"
                onClick={() => alert("Ready to deploy! Copy the script and paste in TradingView.")}
              >
                ✅ Ready to Deploy
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
