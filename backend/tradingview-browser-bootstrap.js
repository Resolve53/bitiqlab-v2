#!/usr/bin/env node

/**
 * One-time local/headful TradingView login against the persistent profile.
 * Does not print cookies, tokens, or credentials.
 *
 * Usage:
 *   TRADINGVIEW_BROWSER_HEADLESS=false \
 *   TRADINGVIEW_BROWSER_USER_DATA_DIR=./.tv-profile \
 *   node tradingview-browser-bootstrap.js
 *
 * Safe first retry (verify browser/tab counts before a long poll):
 *   TRADINGVIEW_BOOTSTRAP_ONCE=1 \
 *   TRADINGVIEW_BROWSER_HEADLESS=false \
 *   TRADINGVIEW_BROWSER_USER_DATA_DIR=./.tv-profile \
 *   npm run tv:bootstrap
 */

const { createRuntime, DEFAULT_PROFILE } = require("./tradingview-browser-runtime");

const profile = process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR || DEFAULT_PROFILE;
process.env.TRADINGVIEW_BROWSER_ENABLED = process.env.TRADINGVIEW_BROWSER_ENABLED || "true";
process.env.TRADINGVIEW_BROWSER_HEADLESS =
  process.env.TRADINGVIEW_BROWSER_HEADLESS || "false";
process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR = profile;

const once = !/^(0|false|no|off)$/i.test(String(process.env.TRADINGVIEW_BOOTSTRAP_ONCE || "").trim())
  && Boolean(process.env.TRADINGVIEW_BOOTSTRAP_ONCE);
const runtime = createRuntime();

function logSnap(prefix, snap) {
  console.log(
    `${prefix} browser=${snap.browser} cdp=${snap.cdp} tradingview=${snap.tradingview} authenticated=${snap.authenticated}`
  );
  console.log(
    `${prefix} spawn_count=${snap.spawn_count} adopted_cdp=${snap.adopted_cdp} restart_attempts=${snap.restart_attempts} ensured_chart=${snap.ensured_chart_page}`
  );
  if (snap.page_target_count != null) {
    console.log(
      `${prefix} targets=${snap.page_target_count} selected=${snap.selected_target_url || "none"} readyState=${snap.page_ready_state || "n/a"} reason=${snap.detection_reason || "n/a"}`
    );
  }
  if (snap.page_target_count != null && snap.page_target_count > 4) {
    console.warn(
      `${prefix} WARNING: ${snap.page_target_count} page targets. Ctrl+C now. Quit every Chrome using this profile, then retry with TRADINGVIEW_BROWSER_RESET_SESSION=true. Do not keep polling.`
    );
  }
  if (snap.auth_signals) {
    const s = snap.auth_signals;
    console.log(
      `${prefix} auth_signals is_authenticated=${s.window_is_authenticated} has_user_username=${s.has_user_username} has_user_id=${s.has_user_id} sign_in=${s.has_sign_in} anonymous_menu=${s.has_anonymous_menu} account_menu=${s.has_account_menu} sign_out=${s.has_sign_out} profile_link=${s.has_profile_link}`
    );
    if (s.userish_data_names && s.userish_data_names.length) {
      console.log(`${prefix} userish_data_names=${s.userish_data_names.join(",")}`);
    }
  }
}

async function main() {
  console.log("[bootstrap] Starting Chromium with persistent profile");
  console.log(`[bootstrap] user-data-dir=${profile}`);
  if (process.env.TRADINGVIEW_BROWSER_RESET_SESSION) {
    console.log("[bootstrap] TRADINGVIEW_BROWSER_RESET_SESSION is set — session restore files will be cleared (cookies/login kept)");
  }
  if (once) {
    console.log("[bootstrap] ONCE mode: one start + one probe, then wait for Ctrl+C. Inspect spawn_count and targets before a long poll.");
  }
  console.log("[bootstrap] Sign in to TradingView in the opened window. This process now probes the chart tab via CDP (it does not guess from process liveness).");
  const snap = await runtime.start();
  logSnap("[bootstrap]", snap);
  if (snap.cdp !== "ok") {
    console.error("[bootstrap] CDP did not become ready. Check TRADINGVIEW_BROWSER_EXECUTABLE.");
    process.exitCode = 1;
    await runtime.stop();
    return;
  }
  if (snap.spawn_count > 1) {
    console.error(`[bootstrap] aborting: spawn_count=${snap.spawn_count} (expected 0 or 1). Previous Chrome may still be running.`);
    process.exitCode = 1;
    await runtime.stop();
    return;
  }

  const probed = await runtime.probeAndApply();
  logSnap("[bootstrap]", probed);
  if (once) {
    console.log("[bootstrap] ONCE mode complete. Leave this running only if spawn_count<=1 and targets look small. Ctrl+C to stop and clean up.");
    await new Promise(() => {});
    return;
  }

  if (probed.authenticated === "yes" && probed.tradingview === "ready") {
    console.log("[bootstrap] Session looks authenticated. You can stop this process; the profile on disk will be reused.");
    return;
  }

  const holdMs = Number(process.env.TRADINGVIEW_BOOTSTRAP_HOLD_MS || 15 * 60 * 1000);
  const started = Date.now();
  while (Date.now() - started < holdMs) {
    await new Promise((r) => setTimeout(r, 5000));
    const next = await runtime.probeAndApply();
    logSnap("[bootstrap]", next);
    if (next.spawn_count > 1) {
      console.error(`[bootstrap] aborting: spawn_count grew to ${next.spawn_count}. Polling never launches Chrome; this is a restart leak.`);
      process.exitCode = 1;
      await runtime.stop();
      return;
    }
    if (next.authenticated === "yes" && next.tradingview === "ready") {
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

main().catch(async (err) => {
  console.error("[bootstrap] failed:", err instanceof Error ? err.message : err);
  try {
    await runtime.stop();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
