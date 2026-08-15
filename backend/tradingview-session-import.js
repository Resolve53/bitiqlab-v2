#!/usr/bin/env node

/**
 * Import a TradingView session artifact into Chromium via CDP.
 * Must run in the same container as Chromium (CDP is 127.0.0.1 only).
 * Requires TRADINGVIEW_SESSION_BOOTSTRAP_SECRET. Never prints cookie values.
 *
 *   TRADINGVIEW_SESSION_BOOTSTRAP_SECRET=... \
 *   TRADINGVIEW_SESSION_BOOTSTRAP_PATH=/data/tv-session-bootstrap.enc \
 *   TRADINGVIEW_BROWSER_USER_DATA_DIR=/data/tradingview-profile \
 *   npm run tv:session-import
 *
 * Full Chrome profile copy is not required and is not supported.
 */

const { createRuntime, DEFAULT_PROFILE } = require("./tradingview-browser-runtime");
const transfer = require("./tradingview-session-transfer");

function parseArgs(argv) {
  const out = { in: null, secret: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--in") out.in = argv[++i];
    else if (arg === "--secret") out.secret = argv[++i];
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`Usage: npm run tv:session-import -- [--in <file>]

Applies tradingview.com cookies (including HttpOnly) to Chromium via CDP
*before* TradingView is opened/reloaded. Requires a one-time secret.

  TRADINGVIEW_SESSION_BOOTSTRAP_SECRET=<secret from export> \\
  TRADINGVIEW_SESSION_BOOTSTRAP_PATH=/data/tv-session-bootstrap.enc \\
  TRADINGVIEW_BROWSER_USER_DATA_DIR=/data/tradingview-profile \\
  npm run tv:session-import

Must run inside the tradingview-mcp container (CDP is loopback-only).
There is no public HTTP import endpoint.
After authenticated=yes, unset TRADINGVIEW_SESSION_BOOTSTRAP_SECRET.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  if (args.in) {
    process.env.TRADINGVIEW_SESSION_BOOTSTRAP_PATH = args.in;
  }
  if (args.secret) {
    process.env.TRADINGVIEW_SESSION_BOOTSTRAP_SECRET = args.secret;
  }

  const profile = process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR || DEFAULT_PROFILE;
  process.env.TRADINGVIEW_BROWSER_ENABLED = process.env.TRADINGVIEW_BROWSER_ENABLED || "true";
  process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR = profile;
  if (process.env.TRADINGVIEW_BROWSER_HEADLESS == null || process.env.TRADINGVIEW_BROWSER_HEADLESS === "") {
    process.env.TRADINGVIEW_BROWSER_HEADLESS = "true";
  }

  const request = transfer.resolveImportRequest({ env: process.env });
  if (!request.shouldImport) {
    if (request.failClosed || request.reason === "NO_ARTIFACT") {
      console.error(`[session-import] fail closed: ${request.reason}`);
      console.error("[session-import] Place the encrypted artifact and set TRADINGVIEW_SESSION_BOOTSTRAP_SECRET.");
      process.exitCode = 1;
      return;
    }
    console.error(`[session-import] nothing to import (${request.reason})`);
    process.exitCode = 1;
    return;
  }

  const runtime = createRuntime();
  const snap = await runtime.start();
  console.log(
    `[session-import] browser=${snap.browser} cdp=${snap.cdp} user_data_dir=${snap.user_data_dir}`
  );
  if (snap.cdp !== "ok") {
    console.error("[session-import] fail closed: CDP is not ready");
    process.exitCode = 1;
    await runtime.stop();
    return;
  }

  const bootstrap = snap.session_bootstrap || {};
  if (bootstrap.status === "failed") {
    console.error(`[session-import] fail closed: import status=failed reason=${bootstrap.reason || ""}`);
    process.exitCode = 1;
    await runtime.stop();
    return;
  }
  if (bootstrap.status !== "imported") {
    console.error("[session-import] fail closed: cookies were not applied before TradingView opened");
    process.exitCode = 1;
    await runtime.stop();
    return;
  }

  const settleMs = Number(process.env.TRADINGVIEW_SESSION_IMPORT_SETTLE_MS || 2500);
  const attempts = Number(process.env.TRADINGVIEW_SESSION_IMPORT_PROBE_ATTEMPTS || 8);
  let probed = snap;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(settleMs);
    probed = await runtime.probeAndApply();
    console.log(
      `[session-import] probe tradingview=${probed.tradingview} authenticated=${probed.authenticated} reason=${probed.detection_reason || ""}`
    );
    if (probed.tradingview === "ready" && probed.authenticated === "yes") break;
  }

  if (probed.tradingview !== "ready" || probed.authenticated !== "yes") {
    console.error("[session-import] fail closed: health did not reach tradingview=ready authenticated=yes");
    process.exitCode = 1;
    await runtime.stop();
    return;
  }

  console.log("[session-import] tradingview=ready authenticated=yes");
  console.log(`[session-import] profile persists at ${probed.user_data_dir}`);
  console.log("[session-import] Unset TRADINGVIEW_SESSION_BOOTSTRAP_SECRET. Artifact was deleted.");
  console.log("[session-import] Full Chrome profile copy is not required and is not supported.");

  if (!probed.adopted_cdp) {
    await runtime.stop();
  }
}

main().catch(async (err) => {
  const code = err && err.code ? err.code : "IMPORT_FAILED";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[session-import] failed: ${code}`);
  if (!/cookie|sessionid|authorization|password|bearer /i.test(message)) {
    console.error(`[session-import] ${message}`);
  }
  process.exit(1);
});
