/**
 * Claude mutation proposer — structured tool-use only.
 * Reuses Anthropic infrastructure from Phase 1; dedicated mutation tool.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/beta/tools/messages";
import { resolveStrategyClaudeModel } from "@/autoresearch/wrapper";
import {
  ALLOWED_MUTATION_TYPES,
  SUBMIT_STRATEGY_MUTATION_TOOL,
  buildMutationCorrectionPrompt,
  buildMutationSystemPrompt,
  buildMutationUserPrompt,
  parseStructuredMutation,
} from "./mutation-schema";
import {
  assertNoTestPayload,
  assertTrainDiagnosticsOnly,
} from "./isolation";
import type { MutationProposer, StructuredMutation } from "./types";

function extractToolInput(
  content: Array<{ type: string; [key: string]: unknown }>,
  toolName: string
): unknown {
  const block = content.find(
    (c) => c.type === "tool_use" && c.name === toolName
  );
  if (!block) {
    throw new Error(
      `Claude did not call ${toolName}. Structured mutation tool output is required.`
    );
  }
  return block.input;
}

export function createClaudeMutationProposer(params?: {
  apiKey?: string;
  model?: string;
  client?: {
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
  };
}): MutationProposer {
  const model = resolveStrategyClaudeModel(params?.model);
  const client =
    params?.client ||
    new Anthropic({ apiKey: params?.apiKey || process.env.ANTHROPIC_API_KEY });

  return async (ctx) => {
    assertTrainDiagnosticsOnly(ctx.trainDiagnostics);
    const claudePayload = {
      parent: ctx.parent,
      trainDiagnostics: ctx.trainDiagnostics,
      previousExperiments: ctx.previousExperiments,
      allowedMutationTypes: ctx.allowedMutationTypes,
    };
    assertNoTestPayload(claudePayload);

    const runOnce = async (userPrompt: string) => {
      const response = await client.beta.tools.messages.create({
        model,
        max_tokens: 2048,
        system: buildMutationSystemPrompt(),
        messages: [{ role: "user", content: userPrompt }],
        tools: [SUBMIT_STRATEGY_MUTATION_TOOL as unknown as Tool],
        tool_choice: {
          type: "tool",
          name: SUBMIT_STRATEGY_MUTATION_TOOL.name,
        },
      });
      const raw = extractToolInput(
        response.content as Array<{ type: string; [key: string]: unknown }>,
        SUBMIT_STRATEGY_MUTATION_TOOL.name
      );
      const mutation = parseStructuredMutation(raw);
      return { mutation, raw, modelId: model };
    };

    try {
      return await runOnce(
        buildMutationUserPrompt({
          parentStrategy: ctx.parent,
          trainDiagnostics: ctx.trainDiagnostics,
          previousExperiments: ctx.previousExperiments,
          allowedMutationTypes:
            ctx.allowedMutationTypes.length > 0
              ? ctx.allowedMutationTypes
              : ALLOWED_MUTATION_TYPES,
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // One correction attempt
      return await runOnce(
        buildMutationCorrectionPrompt({
          previous: null,
          error: message,
          parentStrategy: ctx.parent,
        })
      );
    }
  };
}

export type { StructuredMutation };
