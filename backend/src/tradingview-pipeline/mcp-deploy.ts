/**
 * MCP deploy orchestration.
 *
 * Receives frozen-version Pine and drives:
 *   chart_set_symbol → chart_set_timeframe → pine_set_source → pine_smart_compile
 * then verifies. Never returns status=deployed on compile/verify failure.
 *
 * Compiled Pine is NOT "monitoring complete". Alert creation is a separate
 * required step (automated when MCP can do it, otherwise ALERT_SETUP_REQUIRED).
 */

import { pineContainsProvenance } from "./pine-translator";
import {
  toTradingViewResolution,
  toTradingViewSymbol,
} from "./constants";
import type {
  AlertSetupResult,
  McpDeployInput,
  McpDeployResult,
  McpDeployTools,
  McpToolResult,
} from "./types";
import { manualAlertInstructions } from "./alert-setup";

function toolFailed(result: McpToolResult | undefined): boolean {
  if (!result) return true;
  if (result.error) return true;
  if (result.has_errors === true) return true;
  if (Array.isArray(result.errors) && result.errors.length > 0) return true;
  if (result.success === false) return true;
  return false;
}

function sourceText(result: McpToolResult | undefined, fallback: string): string {
  const src = result?.source;
  return typeof src === "string" && src.length > 0 ? src : fallback;
}

function symbolMatches(actual: unknown, expectedTv: string, expectedRaw: string): boolean {
  const a = String(actual || "").toUpperCase().replace(/\s/g, "");
  if (!a || a === "UNKNOWN") return false;
  const expTv = expectedTv.toUpperCase();
  const expRaw = expectedRaw.toUpperCase();
  return a.includes(expRaw) || a.includes(expTv) || expTv.includes(a) || expRaw.includes(a);
}

function timeframeMatches(actual: unknown, expected: string, tvResolution: string): boolean {
  const a = String(actual || "").toUpperCase().replace(/\s/g, "");
  if (!a) return false;
  const candidates = [
    expected.toUpperCase(),
    tvResolution.toUpperCase(),
    expected.replace("m", "").toUpperCase(),
  ];
  return candidates.some((c) => a === c || a.includes(c) || c.includes(a));
}

export async function runMcpDeployPipeline(
  tools: McpDeployTools,
  input: McpDeployInput,
  alert: AlertSetupResult
): Promise<McpDeployResult> {
  const tvSymbol = toTradingViewSymbol(input.symbol);
  const tvTf = toTradingViewResolution(input.timeframe);
  const steps: McpDeployResult["steps"] = {};

  const baseAlert = {
    status: alert.status,
    instructions: alert.instructions,
    webhook_url: alert.webhook_url,
    verified: alert.verified,
    detail: alert.detail,
  };

  const fail = (
    status: McpDeployResult["status"],
    failure: string,
    extra: Partial<McpDeployResult> = {}
  ): McpDeployResult => ({
    compiled: false,
    verified: false,
    monitoring_complete: false,
    status,
    symbol_set: extra.symbol_set ?? false,
    timeframe_set: extra.timeframe_set ?? false,
    source_set: extra.source_set ?? false,
    compile_succeeded: extra.compile_succeeded ?? false,
    provenance_verified: extra.provenance_verified ?? false,
    expected_strategy_version_match: extra.expected_strategy_version_match ?? false,
    expected_hash_match: extra.expected_hash_match ?? false,
    steps,
    failure,
    alert: baseAlert,
  });

  let symbolResult: McpToolResult;
  try {
    symbolResult = await tools.chart_set_symbol({ symbol: tvSymbol });
  } catch (err) {
    symbolResult = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  steps.chart_set_symbol = symbolResult;
  if (toolFailed(symbolResult)) {
    return fail(
      "symbol_failed",
      `chart_set_symbol failed: ${symbolResult.error || "unknown error"}`
    );
  }

  let timeframeSet = false;
  if (tools.chart_set_timeframe) {
    let tfResult: McpToolResult;
    try {
      tfResult = await tools.chart_set_timeframe({ timeframe: tvTf });
    } catch (err) {
      tfResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    steps.chart_set_timeframe = tfResult;
    timeframeSet = !toolFailed(tfResult);
  }

  let sourceResult: McpToolResult;
  try {
    sourceResult = await tools.pine_set_source({ source: input.pine_script });
  } catch (err) {
    sourceResult = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  steps.pine_set_source = sourceResult;
  if (toolFailed(sourceResult)) {
    return fail(
      "source_failed",
      `pine_set_source failed: ${sourceResult.error || "unknown error"}`,
      { symbol_set: true, timeframe_set: timeframeSet }
    );
  }

  let compileResult: McpToolResult;
  try {
    compileResult = await tools.pine_smart_compile();
  } catch (err) {
    compileResult = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  steps.pine_smart_compile = compileResult;
  if (toolFailed(compileResult)) {
    return fail(
      "compile_failed",
      `pine_smart_compile failed: ${compileResult.error || "compilation errors"}`,
      { symbol_set: true, timeframe_set: timeframeSet, source_set: true }
    );
  }

  let readback = input.pine_script;
  if (tools.pine_get_source) {
    let got: McpToolResult & { source?: string };
    try {
      got = await tools.pine_get_source();
    } catch (err) {
      got = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    steps.pine_get_source = got;
    if (!toolFailed(got) && typeof got.source === "string" && got.source.length > 0) {
      readback = got.source;
    }
  }

  const provenance = pineContainsProvenance(sourceText(steps.pine_get_source, readback), {
    strategyId: input.strategy_id,
    strategyVersionId: input.strategy_version_id,
    snapshotHash: input.snapshot_hash,
  });
  const provenanceOk =
    provenance.strategy_id &&
    provenance.strategy_version_id &&
    provenance.snapshot_hash;

  let stateOk = true;
  let symbolVerified = true;
  let tfVerified = timeframeSet || !tools.chart_set_timeframe;
  if (tools.chart_get_state) {
    let state: McpToolResult;
    try {
      state = await tools.chart_get_state();
    } catch (err) {
      state = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    steps.chart_get_state = state;
    if (toolFailed(state)) {
      stateOk = false;
    } else {
      symbolVerified = symbolMatches(
        state.symbol || state.ticker,
        tvSymbol,
        input.symbol
      );
      if (state.timeframe || state.resolution) {
        tfVerified = timeframeMatches(
          state.timeframe || state.resolution,
          input.timeframe,
          tvTf
        );
      }
    }
  }

  if (!provenanceOk || !symbolVerified || !tfVerified || !stateOk) {
    return {
      compiled: true,
      verified: false,
      monitoring_complete: false,
      status: "verification_failed",
      symbol_set: true,
      timeframe_set: timeframeSet,
      source_set: true,
      compile_succeeded: true,
      provenance_verified: provenanceOk,
      expected_strategy_version_match: provenance.strategy_version_id,
      expected_hash_match: provenance.snapshot_hash,
      steps,
      failure: !provenanceOk
        ? "Pine readback missing strategy_id / strategy_version_id / snapshot_hash provenance"
        : !symbolVerified
          ? "Chart symbol does not match requested symbol"
          : !tfVerified
            ? "Chart timeframe does not match requested timeframe"
            : "chart_get_state verification failed",
      alert: baseAlert,
    };
  }

  const alertVerified = alert.status === "VERIFIED" || alert.status === "CREATED";
  const monitoringComplete = alertVerified && alert.verified === true;

  return {
    compiled: true,
    verified: true,
    monitoring_complete: monitoringComplete,
    status: monitoringComplete ? "deployed" : "compiled_verified",
    symbol_set: true,
    timeframe_set: timeframeSet || tfVerified,
    source_set: true,
    compile_succeeded: true,
    provenance_verified: true,
    expected_strategy_version_match: true,
    expected_hash_match: true,
    steps,
    alert: baseAlert,
  };
}

export function compileIsNotMonitoring(result: McpDeployResult): boolean {
  return result.monitoring_complete === true
    ? result.compiled && result.verified && result.alert.verified
    : true;
}

export { manualAlertInstructions };
