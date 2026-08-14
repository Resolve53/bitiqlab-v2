/**
 * TradingView alert setup.
 *
 * Existing MCP `alert_create` is a PRICE alert (condition + price). That is
 * the wrong alert type for strategy webhook candidates. Do not treat it as
 * success for Stage 1.
 *
 * Stage 1 tries a strategy-webhook DOM flow when the MCP HTTP adapter exposes
 * it. If that cannot set webhook URL + once-per-bar-close + JSON message,
 * return ALERT_SETUP_REQUIRED with exact manual instructions. Never fake it.
 */

import { candidateWebhookUrl } from "./webhook-security";
import type { AlertSetupResult } from "./types";

export function manualAlertInstructions(input: {
  strategyName?: string;
  symbol: string;
  timeframe: string;
  webhookUrl: string;
  snapshotHash: string;
  strategyVersionId: string;
}): string[] {
  return [
    "Compiled Pine is NOT enough. A real TradingView alert must fire on confirmed candle close.",
    `Open the chart for ${input.symbol} ${input.timeframe} with the compiled Bitiq strategy on it.`,
    "Create Alert (Alt+A).",
    `Condition: the deployed strategy${input.strategyName ? ` ("${input.strategyName}")` : ""} → "alert() function calls only".`,
    "Do NOT use a price crossing / greater-than price alert. Do NOT use order-fill alerts (those can double-fire).",
    "Options / trigger: Once Per Bar Close (matches alert.freq_once_per_bar_close in Pine).",
    `Notifications → Webhook URL: ${input.webhookUrl}`,
    "The alert message body is produced by Pine alert() as JSON (candidate_id, strategy_id, strategy_version_id, snapshot_hash, …). Leave the message field unused if the UI sends the alert() payload as the webhook body.",
    `Confirm the JSON includes strategy_version_id=${input.strategyVersionId} and snapshot_hash=${input.snapshotHash}.`,
    "Expiration: Open-ended.",
    "Create the alert, then wait for one confirmed candle-close trigger. Bitiq must persist exactly one tradingview_candidates row.",
    "Until that candidate is stored, TradingView monitoring is NOT complete.",
  ];
}

export interface AlertCreateAttempt {
  success?: boolean;
  error?: string;
  webhook_url_set?: boolean;
  once_per_bar_close?: boolean;
  condition_is_alert_function?: boolean;
  message_is_json?: boolean;
  verified_in_list?: boolean;
  [key: string]: unknown;
}

export async function setupTradingViewAlert(opts: {
  symbol: string;
  timeframe: string;
  strategyName?: string;
  snapshotHash: string;
  strategyVersionId: string;
  webhookUrl?: string;
  attempt?: () => Promise<AlertCreateAttempt>;
}): Promise<AlertSetupResult> {
  const webhookUrl = opts.webhookUrl || candidateWebhookUrl();
  const instructions = manualAlertInstructions({
    strategyName: opts.strategyName,
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    webhookUrl,
    snapshotHash: opts.snapshotHash,
    strategyVersionId: opts.strategyVersionId,
  });

  if (!opts.attempt) {
    return {
      status: "ALERT_SETUP_REQUIRED",
      verified: false,
      instructions,
      webhook_url: webhookUrl,
      detail:
        "MCP alert_create only supports price alerts. Strategy webhook alerts must be created manually unless a dedicated strategy-alert tool succeeds.",
    };
  }

  let raw: AlertCreateAttempt;
  try {
    raw = await opts.attempt();
  } catch (err) {
    return {
      status: "ALERT_SETUP_REQUIRED",
      verified: false,
      instructions,
      webhook_url: webhookUrl,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const complete =
    raw.success === true &&
    raw.webhook_url_set === true &&
    raw.once_per_bar_close === true &&
    raw.condition_is_alert_function === true;

  if (!complete) {
    return {
      status: "ALERT_SETUP_REQUIRED",
      verified: false,
      instructions,
      webhook_url: webhookUrl,
      detail:
        raw.error ||
        "Strategy webhook alert could not be fully created/verified via MCP. Manual setup required.",
      raw,
    };
  }

  return {
    status: raw.verified_in_list ? "VERIFIED" : "CREATED",
    verified: raw.verified_in_list === true,
    instructions,
    webhook_url: webhookUrl,
    detail: raw.verified_in_list
      ? "TradingView alert created and listed"
      : "TradingView alert create clicked; list verification not confirmed",
    raw,
  };
}
