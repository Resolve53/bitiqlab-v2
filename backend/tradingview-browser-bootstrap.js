#!/usr/bin/env node

/**
 * One-time local/headful TradingView login against the persistent profile.
 * Does not print cookies, tokens, or credentials.
 *
 * Usage:
 *   TRADINGVIEW_BROWSER_HEADLESS=false \
 *   TRADINGVIEW_BROWSER_USER_DATA_DIR=/data/tradingview-profile \
 *   node tradingview-browser-bootstrap.js
 */

const { createRuntime, DEFAULT_PROFILE } = require("./tradingview-browser-runtime");

const profile = process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR || DEFAULT_PROFILE;
process.env.TRADINGVIEW_BROWSER_ENABLED = process.env.TRADINGVIEW_BROWSER_ENABLED || "true";
process.env.TRADINGVIEW_BROWSER_HEADLESS =
  process.env.TRADINGVIEW_BROWSER_HEADLESS || "false";
process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR = profile;

const runtime = createRuntime();

async function main() {
  console.log("[bootstrap] Starting Chromium with persistent profile");
  console.log(`[bootstrap] user-data-dir=${profile}`);
  console.log("[bootstrap] Sign in to TradingView in the opened window, then leave this process running until /health shows authenticated=yes");
  const snap = await runtime.start();
  console.log(
    `[bootstrap] status=${snap.status} browser=${snap.browser} cdp=${snap.cdp} authenticated=${snap.authenticated}`
  );
  if (snap.cdp !== "ok") {
    console.error("[bootstrap] CDP did not become ready. Check TRADINGVIEW_BROWSER_EXECUTABLE.");
    process.exitCode = 1;
    return;
  }

  const holdMs = Number(process.env.TRADINGVIEW_BOOTSTRAP_HOLD_MS || 15 * 60 * 1000);
  const started = Date.now();
  while (Date.now() - started < holdMs) {
    await new Promise((r) => setTimeout(r, 5000));
    const now = runtime.snapshot();
    console.log(
      `[bootstrap] browser=${now.browser} cdp=${now.cdp} tradingview=${now.tradingview} authenticated=${now.authenticated}`
    );
    if (now.authenticated === "yes") {
      console.log("[bootstrap] Session looks authenticated. You can stop this process; the profile on disk will be reused.");
      break;
    }
  }
}

function shutdown() {
  runtime.stop().finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("[bootstrap] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
