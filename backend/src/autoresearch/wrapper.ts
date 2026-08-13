/**
 * Production StrategyGenerator — Anthropic tool-use → Truth Engine executable strategies.
 * Replaces the compile-only stub that returned {}.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/beta/tools/messages";
import {
  SUBMIT_EXECUTABLE_STRATEGY_TOOL,
  buildCorrectionUserPrompt,
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  type ClaudeExecutableStrategy,
} from "@/lib/claude-strategy-schema";

export type { GeneratedStrategy, GenerateConfig } from "../autoresearch.d";

export interface StrategyGenerateConfig {
  prompt: string;
  symbol: string;
  timeframe: string;
  market_type: string;
  leverage?: number;
}

export interface StrategyGenerateResult extends ClaudeExecutableStrategy {
  status: "draft";
  version: number;
  created_at: Date;
}

export interface AnthropicToolsClient {
  beta: {
    tools: {
      messages: {
        create: (body: Record<string, unknown>) => Promise<{
          content: Array<{ type: string; [key: string]: unknown }>;
          stop_reason: string | null;
        }>;
      };
    };
  };
}

function extractToolInput(
  content: Array<{ type: string; [key: string]: unknown }>,
  toolName: string
): unknown {
  const block = content.find(
    (c) => c.type === "tool_use" && c.name === toolName
  );
  if (!block) {
    throw new Error(
      `Claude did not call ${toolName}. Structured strategy tool output is required.`
    );
  }
  return block.input;
}

function asExecutableStrategy(raw: unknown): ClaudeExecutableStrategy {
  if (!raw || typeof raw !== "object") {
    throw new Error("Claude tool input was empty or not an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.entries) || obj.entries.length === 0) {
    throw new Error("Claude returned null/empty entries — refusing to continue");
  }
  if (typeof obj.stop_loss_percent !== "number") {
    throw new Error("Claude omitted stop_loss_percent");
  }
  if (typeof obj.risk_per_trade_pct !== "number") {
    throw new Error("Claude omitted risk_per_trade_pct");
  }
  if (typeof obj.leverage !== "number") {
    throw new Error("Claude omitted leverage");
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new Error("Claude omitted strategy name");
  }
  return {
    name: obj.name,
    description: typeof obj.description === "string" ? obj.description : "",
    symbol: String(obj.symbol || ""),
    timeframe: String(obj.timeframe || ""),
    market_type:
      obj.market_type === "futures" ? "futures" : "spot",
    entries: obj.entries as ClaudeExecutableStrategy["entries"],
    exit_condition: obj.exit_condition ?? null,
    stop_loss_percent: obj.stop_loss_percent,
    take_profit_percent:
      typeof obj.take_profit_percent === "number"
        ? obj.take_profit_percent
        : undefined,
    risk_per_trade_pct: obj.risk_per_trade_pct,
    leverage: obj.leverage,
  };
}

/** Resolve Claude model: injected override → STRATEGY_CLAUDE_MODEL → fail closed. */
export function resolveStrategyClaudeModel(explicitModel?: string): string {
  const injected = explicitModel?.trim();
  if (injected) return injected;
  const fromEnv = process.env.STRATEGY_CLAUDE_MODEL?.trim();
  if (fromEnv) return fromEnv;
  throw new Error(
    "STRATEGY_CLAUDE_MODEL is required for AI strategy generation. Set it to an active Anthropic API model ID."
  );
}

export class StrategyGenerator {
  private client: AnthropicToolsClient;
  private readonly resolvedModel: string;

  constructor(
    apiKey: string,
    options?: { client?: AnthropicToolsClient; model?: string }
  ) {
    this.client =
      options?.client ||
      (new Anthropic({ apiKey }) as unknown as AnthropicToolsClient);
    this.resolvedModel = resolveStrategyClaudeModel(options?.model);
  }

  /** Model ID that will be sent to Anthropic (injected or STRATEGY_CLAUDE_MODEL). */
  get model(): string {
    return this.resolvedModel;
  }

  private async callSubmitTool(params: {
    system: string;
    user: string;
  }): Promise<ClaudeExecutableStrategy> {
    const tools = [SUBMIT_EXECUTABLE_STRATEGY_TOOL as unknown as Tool];
    const message = await this.client.beta.tools.messages.create({
      model: this.resolvedModel,
      max_tokens: 4096,
      system: params.system,
      tools,
      messages: [{ role: "user", content: params.user }],
    });

    const input = extractToolInput(
      message.content,
      SUBMIT_EXECUTABLE_STRATEGY_TOOL.name
    );
    return asExecutableStrategy(input);
  }

  /**
   * Generate a structured executable strategy via Anthropic tool use.
   * Never returns {}.
   */
  async generate(config: StrategyGenerateConfig): Promise<StrategyGenerateResult> {
    const generated = await this.callSubmitTool({
      system: buildGenerationSystemPrompt(),
      user: buildGenerationUserPrompt(config),
    });

    // Prefer caller-selected market params when Claude drifts
    generated.symbol = (config.symbol || generated.symbol).toUpperCase();
    generated.timeframe = config.timeframe || generated.timeframe;
    generated.market_type =
      config.market_type === "futures" ? "futures" : "spot";

    return {
      ...generated,
      status: "draft",
      version: 1,
      created_at: new Date(),
    };
  }

  /**
   * One bounded correction attempt after Truth Engine validation failure.
   */
  async generateCorrected(
    config: StrategyGenerateConfig,
    previous: unknown,
    validationError: string
  ): Promise<StrategyGenerateResult> {
    const generated = await this.callSubmitTool({
      system: buildGenerationSystemPrompt(),
      user: buildCorrectionUserPrompt({
        previous,
        validationError,
        symbol: config.symbol,
        timeframe: config.timeframe,
        market_type: config.market_type,
        originalPrompt: config.prompt,
      }),
    });

    generated.symbol = (config.symbol || generated.symbol).toUpperCase();
    generated.timeframe = config.timeframe || generated.timeframe;
    generated.market_type =
      config.market_type === "futures" ? "futures" : "spot";

    return {
      ...generated,
      status: "draft",
      version: 1,
      created_at: new Date(),
    };
  }

  /** Kept for API compatibility; not used by Phase 1 or Phase 3. */
  async suggestImprovements(strategy: unknown, backtestResult: unknown) {
    return {
      suggestions:
        "Phase 3 uses @/research-engine controlled mutations — do not use suggestImprovements.",
      strategy,
      backtestResult,
      timestamp: new Date(),
    };
  }
}

/** @deprecated Quarantined — Phase 3 uses @/research-engine instead. */
export class AutoresearchOptimizer {
  async optimize(strategy: unknown, _backtestData: unknown) {
    return {
      success: false,
      optimizedStrategy: strategy,
      improvements:
        "AutoresearchOptimizer is quarantined. Use POST /api/research/run (Phase 3 Controlled Autoresearch).",
    };
  }
}

export default {
  StrategyGenerator,
  AutoresearchOptimizer,
};
