import { describe, expect, it } from "vitest";
import { runMcpDeployPipeline, setupTradingViewAlert } from "@/tradingview-pipeline";
import type { McpDeployInput, McpDeployTools } from "../types";
import { longFrozen } from "./helpers";

const frozen = longFrozen();

const input: McpDeployInput = {
  strategy_id: frozen.row.strategy_id,
  strategy_version_id: frozen.row.id,
  snapshot_hash: frozen.hash,
  symbol: frozen.snapshot.symbol,
  timeframe: frozen.snapshot.timeframe,
  pine_script: `//@version=5
strategy("x")
// BITIQ_STRATEGY_ID: ${frozen.row.strategy_id}
// BITIQ_STRATEGY_VERSION_ID: ${frozen.row.id}
// BITIQ_SNAPSHOT_HASH: ${frozen.hash}
STRATEGY_ID = "${frozen.row.strategy_id}"
STRATEGY_VERSION_ID = "${frozen.row.id}"
SNAPSHOT_HASH = "${frozen.hash}"
`,
};

const pendingAlert = {
  status: "ALERT_SETUP_REQUIRED" as const,
  verified: false,
  instructions: ["manual"],
  webhook_url: "https://example.test/api/tradingview/candidates?token=x",
};

function okTools(overrides: Partial<McpDeployTools> = {}): McpDeployTools {
  return {
    chart_set_symbol: async () => ({ success: true, symbol: "BINANCE:BTCUSDT" }),
    chart_set_timeframe: async () => ({ success: true, timeframe: "60" }),
    pine_set_source: async () => ({ success: true }),
    pine_smart_compile: async () => ({ success: true, has_errors: false }),
    pine_get_source: async () => ({ success: true, source: input.pine_script }),
    chart_get_state: async () => ({
      success: true,
      symbol: "BINANCE:BTCUSDT",
      timeframe: "60",
    }),
    ...overrides,
  };
}

describe("D. MCP deploy", () => {
  it("sets symbol, source, and checks compile", async () => {
    const result = await runMcpDeployPipeline(okTools(), input, pendingAlert);
    expect(result.symbol_set).toBe(true);
    expect(result.source_set).toBe(true);
    expect(result.compile_succeeded).toBe(true);
    expect(result.compiled).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.provenance_verified).toBe(true);
    expect(result.status).toBe("compiled_verified");
    expect(result.monitoring_complete).toBe(false);
    expect(result.status).not.toBe("deployed");
  });

  it("does not return deployed when compile fails", async () => {
    const result = await runMcpDeployPipeline(
      okTools({
        pine_smart_compile: async () => ({
          success: false,
          error: "Compilation failed with errors",
          has_errors: true,
        }),
      }),
      input,
      pendingAlert
    );
    expect(result.compile_succeeded).toBe(false);
    expect(result.compiled).toBe(false);
    expect(result.status).toBe("compile_failed");
    expect(result.monitoring_complete).toBe(false);
    expect(result.status).not.toBe("deployed");
  });

  it("fails verification when provenance markers are missing from readback", async () => {
    const result = await runMcpDeployPipeline(
      okTools({
        pine_get_source: async () => ({
          success: true,
          source: "// no provenance",
        }),
      }),
      input,
      pendingAlert
    );
    expect(result.status).toBe("verification_failed");
    expect(result.compiled).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.monitoring_complete).toBe(false);
  });

  it("never treats compiled Pine as monitoring complete", async () => {
    const result = await runMcpDeployPipeline(okTools(), input, pendingAlert);
    expect(result.compiled).toBe(true);
    expect(result.monitoring_complete).toBe(false);
    expect(result.alert.status).toBe("ALERT_SETUP_REQUIRED");
  });

  it("setupTradingViewAlert does not fake success without webhook+once-per-bar-close", async () => {
    const alert = await setupTradingViewAlert({
      symbol: "BTCUSDT",
      timeframe: "1h",
      snapshotHash: frozen.hash,
      strategyVersionId: frozen.row.id,
      attempt: async () => ({ success: true }),
    });
    expect(alert.status).toBe("ALERT_SETUP_REQUIRED");
    expect(alert.verified).toBe(false);
    expect(alert.instructions.join(" ")).toMatch(/Once Per Bar Close/i);
  });
});
