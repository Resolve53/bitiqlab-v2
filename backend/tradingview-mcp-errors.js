/**
 * Precise MCP / browser / TradingView error classes.
 * Backend must surface these instead of "MCP server unreachable".
 */

const MCP_ERROR_CLASSES = {
  MCP_HTTP_UNREACHABLE: "MCP_HTTP_UNREACHABLE",
  BROWSER_NOT_RUNNING: "BROWSER_NOT_RUNNING",
  CDP_UNREACHABLE: "CDP_UNREACHABLE",
  TRADINGVIEW_PAGE_NOT_READY: "TRADINGVIEW_PAGE_NOT_READY",
  TRADINGVIEW_AUTH_REQUIRED: "TRADINGVIEW_AUTH_REQUIRED",
  TRADINGVIEW_SELECTOR_NOT_FOUND: "TRADINGVIEW_SELECTOR_NOT_FOUND",
  PINE_EDITOR_NOT_FOUND: "PINE_EDITOR_NOT_FOUND",
  PINE_EDITOR_SETUP_REQUIRED: "PINE_EDITOR_SETUP_REQUIRED",
  COMPILE_FAILED: "COMPILE_FAILED",
};

class McpRuntimeError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "McpRuntimeError";
    this.code = code;
    this.error_class = code;
  }
}

function classifyConnectError(err, state) {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (state && state.browserEnabled && !state.browserRunning) {
    return new McpRuntimeError(
      MCP_ERROR_CLASSES.BROWSER_NOT_RUNNING,
      "Chromium browser process is not running"
    );
  }
  if (/ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|socket hang up|connect ECONN/i.test(msg)) {
    return new McpRuntimeError(
      MCP_ERROR_CLASSES.CDP_UNREACHABLE,
      `CDP is unreachable (${msg}). This is not an MCP HTTP outage.`
    );
  }
  if (state && state.browserRunning && !state.cdpReady) {
    return new McpRuntimeError(
      MCP_ERROR_CLASSES.CDP_UNREACHABLE,
      "Browser is up but CDP is not ready"
    );
  }
  if (/timeout|ETIMEDOUT/i.test(msg)) {
    return new McpRuntimeError(
      MCP_ERROR_CLASSES.CDP_UNREACHABLE,
      `CDP connection timed out (${msg})`
    );
  }
  return new McpRuntimeError(MCP_ERROR_CLASSES.CDP_UNREACHABLE, msg);
}

function classifyPageState(page) {
  if (!page) {
    return new McpRuntimeError(
      MCP_ERROR_CLASSES.TRADINGVIEW_PAGE_NOT_READY,
      "TradingView page has not been probed yet"
    );
  }
  if (page.authenticated === "no") {
    return new McpRuntimeError(
      MCP_ERROR_CLASSES.TRADINGVIEW_AUTH_REQUIRED,
      "TradingView session is not authenticated. Export a local CDP session (npm run tv:session-export) and import it on Railway (npm run tv:session-import). Do not copy a macOS Chrome profile onto Linux."
    );
  }
  if (!page.ready) {
    return new McpRuntimeError(
      MCP_ERROR_CLASSES.TRADINGVIEW_PAGE_NOT_READY,
      "TradingView chart page is not ready"
    );
  }
  return null;
}

function asToolError(err) {
  const code =
    (err && (err.error_class || err.code)) ||
    MCP_ERROR_CLASSES.CDP_UNREACHABLE;
  const message = err instanceof Error ? err.message : String(err || code);
  return {
    success: false,
    error: message,
    error_class: code,
  };
}

/**
 * CDP API method names contain the substring "cookie" but are safe to log.
 * Strip them before scanning so Storage.setCookies does not false-positive.
 */
const CDP_COOKIE_API_NAMES =
  /\b(?:Storage\.setCookies|Network\.setCookies?|Network\.deleteCookies|Network\.getAllCookies|Network\.getCookies)\b/gi;

function looksLikeSecret(text) {
  const scanned = String(text || "").replace(CDP_COOKIE_API_NAMES, "[cdp-api]");
  // Match secret-bearing text: cookie dumps, cookie names (sessionid), auth, tokens.
  // Bare "cookie(s)" still redacts; CDP method labels were stripped above.
  return /\bcookies?\b|authorization|bearer |sessionid|webhook_token|password|api[_-]?key/i.test(
    scanned
  );
}

function sanitizeLogValue(value) {
  if (value == null) return value;
  const s = String(value);
  if (looksLikeSecret(s)) return "[redacted]";
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

module.exports = {
  MCP_ERROR_CLASSES,
  McpRuntimeError,
  classifyConnectError,
  classifyPageState,
  asToolError,
  looksLikeSecret,
  sanitizeLogValue,
};
