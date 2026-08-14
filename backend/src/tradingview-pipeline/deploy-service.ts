/**
 * Stage 1 generate + deploy from an immutable strategy version.
 */

import { loadFrozenVersionAuthority, type AuthorityDeps } from "./authority";
import { generatePineFromFrozen, pineContainsProvenance } from "./pine-translator";
import { runMcpDeployPipeline } from "./mcp-deploy";
import { setupTradingViewAlert } from "./alert-setup";
import { candidateWebhookUrl, getConfiguredWebhookToken } from "./webhook-security";
import { mcpAttemptStrategyAlert, mcpDeployPine, mcpHealth } from "./mcp-client";
import { BITIQ_ENGINE_ID, BITIQ_PINE_VERSION } from "./constants";
import { McpDeployError, PineAuthorityError } from "./errors";
import type {
  McpDeployInput,
  McpDeployResult,
  McpDeployTools,
  PineGenerateRequest,
  PineGenerateResult,
  TradingViewDeploymentRow,
} from "./types";

export interface DeployPersistence {
  insertTradingViewDeployment?: (row: {
    strategy_id: string;
    strategy_version_id: string;
    snapshot_hash: string;
    symbol: string;
    timeframe: string;
    pine_script: string;
    pine_version: string;
    compile_status: string;
    alert_status: string;
    alert_instructions: string | null;
    webhook_url: string | null;
    verification: unknown;
  }) => Promise<TradingViewDeploymentRow>;
}

export function generatePineForVersion(
  authority: Awaited<ReturnType<typeof loadFrozenVersionAuthority>>
): PineGenerateResult {
  const token = getConfiguredWebhookToken();
  const pine = generatePineFromFrozen(authority, { webhookToken: token });
  const markers = pineContainsProvenance(pine, {
    strategyId: authority.strategyId,
    strategyVersionId: authority.strategyVersionId,
    snapshotHash: authority.snapshotHash,
  });
  if (!markers.strategy_id || !markers.strategy_version_id || !markers.snapshot_hash) {
    throw new PineAuthorityError(
      "Generated Pine is missing provenance markers",
      "PROVENANCE_MISSING"
    );
  }
  return {
    pine_script: pine,
    strategy_id: authority.strategyId,
    strategy_version_id: authority.strategyVersionId,
    snapshot_hash: authority.snapshotHash,
    symbol: authority.symbol,
    timeframe: authority.timeframe,
    pine_version: BITIQ_PINE_VERSION,
    engine: BITIQ_ENGINE_ID,
    webhook_url: candidateWebhookUrl(),
    directions: authority.strategy.entries.map((e) =>
      e.direction === "short" ? "SHORT" : "LONG"
    ),
  };
}

export async function generatePineFromRequest(
  deps: AuthorityDeps,
  request: PineGenerateRequest
): Promise<PineGenerateResult> {
  const authority = await loadFrozenVersionAuthority(deps, request);
  return generatePineForVersion(authority);
}

/**
 * When the MCP HTTP server already executed the CDP tools, wrap those facts
 * so runMcpDeployPipeline still applies fail-closed verification.
 * For unit tests, pass `tools` directly and skip HTTP.
 */
export async function deployFrozenPine(
  deps: AuthorityDeps & DeployPersistence,
  request: PineGenerateRequest,
  tools?: McpDeployTools
): Promise<{
  pine: PineGenerateResult;
  deploy: McpDeployResult;
  deployment?: TradingViewDeploymentRow;
}> {
  const pine = await generatePineFromRequest(deps, request);
  const webhookUrl = pine.webhook_url;

  const alert = await setupTradingViewAlert({
    symbol: pine.symbol,
    timeframe: pine.timeframe,
    snapshotHash: pine.snapshot_hash,
    strategyVersionId: pine.strategy_version_id,
    webhookUrl,
    attempt: tools
      ? undefined
      : async () =>
          mcpAttemptStrategyAlert({
            webhook_url: webhookUrl,
            symbol: pine.symbol,
            timeframe: pine.timeframe,
            message: "BITIQ_CANDIDATE_JSON",
          }),
  });

  const input: McpDeployInput = {
    strategy_id: pine.strategy_id,
    strategy_version_id: pine.strategy_version_id,
    snapshot_hash: pine.snapshot_hash,
    symbol: pine.symbol,
    timeframe: pine.timeframe,
    pine_script: pine.pine_script,
  };

  let deploy: McpDeployResult;
  if (tools) {
    deploy = await runMcpDeployPipeline(tools, input, alert);
  } else {
    const healthy = await mcpHealth();
    if (!healthy) {
      deploy = await runMcpDeployPipeline(
        {
          chart_set_symbol: async () => ({
            success: false,
            error: "MCP server unreachable",
          }),
          pine_set_source: async () => ({
            success: false,
            error: "MCP server unreachable",
          }),
          pine_smart_compile: async () => ({
            success: false,
            error: "MCP server unreachable",
          }),
        },
        input,
        alert
      );
    } else {
      const facts = await mcpDeployPine(input);
      // MCP HTTP already ran the tools. Feed the returned facts through the
      // same fail-closed verifier (do not trust a "deployed" flag from HTTP).
      const replay: McpDeployTools = {
        chart_set_symbol: async () =>
          facts.steps.chart_set_symbol || {
            success: !facts.error,
            error: facts.error,
          },
        chart_set_timeframe: async () =>
          facts.steps.chart_set_timeframe || { success: true },
        pine_set_source: async () =>
          facts.steps.pine_set_source || {
            success: !facts.error,
            error: facts.error,
          },
        pine_smart_compile: async () =>
          facts.steps.pine_smart_compile || {
            success: !facts.error,
            error: facts.error,
          },
        pine_get_source: async () => ({
          success: true,
          source: facts.pine_source || pine.pine_script,
        }),
        chart_get_state: async () =>
          facts.chart_state || { success: true, symbol: input.symbol, timeframe: input.timeframe },
      };
      deploy = await runMcpDeployPipeline(replay, input, alert);
    }
  }

  if (deploy.status === "deployed" && (!deploy.compiled || !deploy.verified)) {
    throw new McpDeployError(
      "Refusing status=deployed because compile/verification did not succeed",
      "DEPLOY_INVARIANT"
    );
  }

  let deployment: TradingViewDeploymentRow | undefined;
  if (deps.insertTradingViewDeployment) {
    deployment = await deps.insertTradingViewDeployment({
      strategy_id: pine.strategy_id,
      strategy_version_id: pine.strategy_version_id,
      snapshot_hash: pine.snapshot_hash,
      symbol: pine.symbol,
      timeframe: pine.timeframe,
      pine_script: pine.pine_script,
      pine_version: pine.pine_version,
      compile_status: deploy.status,
      alert_status: deploy.alert.status,
      alert_instructions: deploy.alert.instructions.join("\n"),
      webhook_url: deploy.alert.webhook_url,
      verification: {
        compiled: deploy.compiled,
        verified: deploy.verified,
        monitoring_complete: deploy.monitoring_complete,
        provenance_verified: deploy.provenance_verified,
        failure: deploy.failure || null,
      },
    });
  }

  return { pine, deploy, deployment };
}
