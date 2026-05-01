/**
 * POST /api/strategies/analyze-pine-script
 * Uses Claude AI to analyze and fix Pine Script code
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { Anthropic } from "@anthropic-ai/sdk";
import { sendSuccess, sendError, asyncHandler } from "@/lib/utils";

interface AnalyzeRequest {
  script_content: string;
  fix_errors?: boolean;
}

interface AnalyzeResponse {
  original_script: string;
  fixed_script: string;
  issues_found: string[];
  fixes_applied: string[];
  analysis: string;
  claude_suggestions: string;
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const { script_content, fix_errors = true }: AnalyzeRequest = req.body;

  if (!script_content || script_content.trim().length === 0) {
    return sendError(res, "Script content is required", 400, req);
  }

  try {
    console.log("[CLAUDE] Analyzing Pine Script for errors and improvements");

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // First request: Analyze the script
    const analysisPrompt = `You are an expert Pine Script developer. Analyze this Pine Script code and identify ALL issues:

\`\`\`pine
${script_content}
\`\`\`

Provide:
1. List of issues found (syntax, logic, best practices)
2. Line-by-line analysis of problems
3. Severity of each issue (critical, warning, info)
4. Detailed explanation of what's wrong`;

    const analysisResponse = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: analysisPrompt,
        },
      ],
    });

    const analysisText =
      analysisResponse.content[0].type === "text" ? analysisResponse.content[0].text : "";

    console.log("[CLAUDE] Analysis complete");

    // Second request: Fix the script
    let fixedScript = script_content;
    let fixesApplied: string[] = [];

    if (fix_errors) {
      const fixPrompt = `You are an expert Pine Script developer. Fix ALL errors in this Pine Script code.

IMPORTANT RULES:
1. Keep the logic and intent intact
2. Fix syntax errors
3. Ensure proper line continuation
4. Add missing declarations
5. Correct any typos or logic errors
6. Maintain code style and comments

BROKEN CODE:
\`\`\`pine
${script_content}
\`\`\`

Return ONLY the fixed Pine Script code in a markdown code block. No explanations, just the corrected code.`;

      const fixResponse = await anthropic.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 3000,
        messages: [
          {
            role: "user",
            content: fixPrompt,
          },
        ],
      });

      const fixedText = fixResponse.content[0].type === "text" ? fixResponse.content[0].text : "";

      // Extract code from markdown block
      const codeMatch = fixedText.match(/```(?:pine)?\n?([\s\S]*?)\n?```/);
      if (codeMatch) {
        fixedScript = codeMatch[1].trim();
        fixesApplied.push("Code analyzed and fixed by Claude AI");
      }

      console.log("[CLAUDE] Script fixed");
    }

    // Extract issues from analysis
    const issuesFound: string[] = [];
    const lines = analysisText.split("\n");
    for (const line of lines) {
      if (line.includes("Error:") || line.includes("Issue:") || line.includes("Problem:")) {
        issuesFound.push(line.trim());
      }
    }

    const response: AnalyzeResponse = {
      original_script: script_content,
      fixed_script: fixedScript,
      issues_found: issuesFound.length > 0 ? issuesFound : [analysisText.substring(0, 200)],
      fixes_applied: fixesApplied.length > 0 ? fixesApplied : ["Analysis complete - review suggestions"],
      analysis: analysisText,
      claude_suggestions: `Claude analyzed your Pine Script and ${fix_errors ? "provided fixes" : "identified issues"}. Review the analysis and apply the fixes to your code.`,
    };

    return sendSuccess(res, response, 200, req);
  } catch (error) {
    console.error("[CLAUDE] Analysis error:", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to analyze Pine Script",
      500,
      req
    );
  }
});
