#!/usr/bin/env node

/**
 * One-time local/headful TradingView login against the persistent profile.
 * Does not print cookies, tokens, or credentials.
 *
 * Usage:
 *   TRADINGVIEW_BROWSER_HEADLESS=false \
 *   TRADINGVIEW_BROWSER_USER_DATA_DIR=./.tv-profile \
 *   node tradingview-browser-bootstrap.js
 */

const { createRuntime, DEFAULT_PROFILE } = require("./tradingview-browser-runtime");

const profile = process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR || DEFAULT_PROFILE;
process.env.TRADINGVIEW_BROWSER_ENABLED = process.env.TRADINGVIEW_BROWSER_ENABLED || "true";
process.env.TRADINGVIEW_BROWSER_HEADLESS =
  process.env.TRADINGVIEW_BROWSER_HEADLESS || "false";
process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR = profile;

const runtime = createRuntime();

function logSnap(prefix, snap) {
  console.log(
    `${prefix} browser=${snap.browser} cdp=${snap.cdp} tradingview=${snap.tradingview} authenticated=${snap.authenticated}`
  );
  if (snap.page_target_count != null) {
    console.log(
      `${prefix} targets=${snap.page_target_count} selected=${snap.selected_target_url || "none"} readyState=${snap.page_ready_state || "n/a"} reason=${snap.detection_reason || "n/a"}`
    );
  }
}

async function main() {
  console.log("[bootstrap] Starting Chromium with persistent profile");
  console.log(`[bootstrap] user-data-dir=${profile}`);
  console.log("[bootstrap] Sign in to TradingView in the opened window. This process now probes the chart tab via CDP (it does not guess from process liveness).");
  const snap = await runtime.start();
  logSnap("[bootstrap]", snap);
  if (snap.cdp !== "ok") {
    console.error("[bootstrap] CDP did not become ready. Check TRADINGVIEW_BROWSER_EXECUTABLE.");
    process.exitCode = 1;
    return;
  }

  const holdMs = Number(process.env.TRADINGVIEW_BOOTSTRAP_HOLD_MS || 15 * 60 * 1000);
  const started = Date.now();
  while (Date.now() - started < holdMs) {
    const probed = await runtime.probeAndApply();
    logSnap("[bootstrap]", probed);
    if (probed.authenticated === "yes" && probed.tradingview === "ready") {
      console.log("[bootstrap] Session looks authenticated. You can stop this process; the profile on disk will be reused.");
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
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
