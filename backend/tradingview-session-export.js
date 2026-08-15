#!/usr/bin/env node

/**
 * Export TradingView session cookies from a local authenticated Chrome via CDP.
 * Writes an encrypted one-time artifact. Never prints cookie values or tokens.
 *
 *   TRADINGVIEW_BROWSER_USER_DATA_DIR=./.tv-profile \
 *   npm run tv:session-export -- --out ./tv-session-bootstrap.enc
 *
 * Full Chrome profile copy is not required and is not supported.
 */

const { createRuntime, DEFAULT_PROFILE } = require("./tradingview-browser-runtime");
const transfer = require("./tradingview-session-transfer");

function parseArgs(argv) {
  const out = { out: null, secret: null, force: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") out.out = argv[++i];
    else if (arg === "--secret") out.secret = argv[++i];
    else if (arg === "--force") out.force = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`Usage: npm run tv:session-export -- [--out <file>] [--force]

Exports only tradingview.com cookies (including HttpOnly) from the local
authenticated Chrome via CDP. Writes an AES-256-GCM artifact.

  TRADINGVIEW_BROWSER_USER_DATA_DIR=./.tv-profile \\
  npm run tv:session-export -- --out ./tv-session-bootstrap.enc

Do not copy .tv-profile onto Railway. Cookie encryption is OS-specific.
Never paste cookie values into logs, tickets, or source.`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const profile = process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR || DEFAULT_PROFILE;
  process.env.TRADINGVIEW_BROWSER_ENABLED = process.env.TRADINGVIEW_BROWSER_ENABLED || "true";
  process.env.TRADINGVIEW_BROWSER_USER_DATA_DIR = profile;
  if (process.env.TRADINGVIEW_BROWSER_HEADLESS == null || process.env.TRADINGVIEW_BROWSER_HEADLESS === "") {
    process.env.TRADINGVIEW_BROWSER_HEADLESS = "true";
  }

  const runtime = createRuntime();
  const snap = await runtime.start();
  if (snap.cdp !== "ok") {
    console.error("[session-export] CDP is not ready. Run tv:bootstrap first against this profile.");
    process.exitCode = 1;
    await runtime.stop();
    return;
  }

  const probed = await runtime.probeAndApply();
  console.log(
    `[session-export] tradingview=${probed.tradingview} authenticated=${probed.authenticated}`
  );
  if (probed.authenticated !== "yes") {
    console.error("[session-export] fail closed: TradingView is not authenticated. Sign in with tv:bootstrap first.");
    process.exitCode = 1;
    if (!probed.adopted_cdp) await runtime.stop();
    return;
  }

  const cookies = await transfer.collectCookiesFromCdp({
    host: "127.0.0.1",
    port: runtime.config().cdpPort,
  });
  const result = transfer.exportSessionToArtifact({
    cookies,
    outPath: args.out,
    secret: args.secret,
    force: args.force,
    env: process.env,
    source: { transfer: "cdp", os: process.platform },
  });

  console.log(`[session-export] wrote artifact (mode 0600) ${transfer.formatSummary(result.summary)}`);
  console.log(`[session-export] path=${result.path}`);
  if (result.secret) {
    console.log("[session-export] ONE-TIME SECRET (treat as a password; this is the only time it is printed):");
    console.log(result.secret);
  } else {
    console.log("[session-export] used a provided secret from --secret or TRADINGVIEW_SESSION_BOOTSTRAP_SECRET (not printed)");
  }
  console.log("[session-export] Full Chrome profile copy is not required and is not supported.");
  console.log("[session-export] Copy only this artifact onto the Railway volume, then run tv:session-import.");

  if (!probed.adopted_cdp) {
    await runtime.stop();
  }
}

main().catch(async (err) => {
  const code = err && err.code ? err.code : "EXPORT_FAILED";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[session-export] failed: ${code}`);
  if (!/cookie|sessionid|authorization|password|bearer /i.test(message)) {
    console.error(`[session-export] ${message}`);
  }
  process.exit(1);
});
