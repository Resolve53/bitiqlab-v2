/**
 * Strategy Generator
 * Generates trading strategy rules from natural language prompts using Claude
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  Strategy,
  EntryRules,
  ExitRules,
  PositionSizing,
  Timeframe,
} from "@bitiqlab/core";
import { v4 as uuid } from "uuid";

export interface GenerateStrategyRequest {
  prompt: string;
  symbol: string;
  timeframe: Timeframe;
  market_type: "spot" | "futures";
  leverage?: number;
}

export interface GeneratedStrategy {
  name: string;
  description: string;
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  position_sizing: PositionSizing;
}

/**
 * Strategy Generator using Claude API
 */
export class StrategyGenerator {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey,  // Uses ANTHROPIC_API_KEY env var if not provided
    });
  }

  /**
   * Generate strategy from natural language prompt
   */
  async generate(request: GenerateStrategyRequest): Promise<Strategy> {
    const generatedStrategy = await this.generateStrategyRules(request);

    return {
      id: uuid(),
      name: generatedStrategy.name,
      description: generatedStrategy.description,
      symbol: request.symbol,
      timeframe: request.timeframe,
      market_type: request.market_type,
      leverage: request.leverage || (request.market_type === "spot" ? 1 : 3),
      entry_rules: generatedStrategy.entry_rules,
      exit_rules: generatedStrategy.exit_rules,
      position_sizing: generatedStrategy.position_sizing,
      status: "draft",
      version: 1,
      backtest_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: "system",
      git_commit_hash: undefined,
    };
  }

  /**
   * Generate strategy rules using Claude
   */
  private async generateStrategyRules(
    request: GenerateStrategyRequest
  ): Promise<GeneratedStrategy> {
    const systemPrompt = `You are an expert algorithmic trading strategist. Generate trading strategies that are:
- Based on technical analysis
- Specific with entry/exit conditions
- Risk-managed with stop losses and take profits
- Executable with common indicators (RSI, MACD, EMA, SMA, Bollinger Bands, STOCH, ATR, ADX)

Always return a valid JSON response with the exact structure provided.`;

    const userPrompt = `Create a trading strategy for ${request.symbol} on the ${request.timeframe} timeframe (${request.market_type} market).

Requirements:
${request.prompt}

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "name": "Strategy Name",
  "description": "Brief description",
  "entry_rules": {
    "direction": "long" | "short",
    "conditions": "Specific entry condition using indicators (e.g., 'RSI < 30 AND MACD_histogram > 0')",
    "confirmation_timeframe": "Optional higher timeframe for confirmation"
  },
  "exit_rules": {
    "stop_loss_percent": -2,
    "take_profit_percent": 5,
    "exit_conditions": "Optional additional exit conditions",
    "time_based_exit": "Optional time-based exit (e.g., '4h')"
  },
  "position_sizing": {
    "risk_per_trade": 2,
    "max_concurrent_positions": 5,
    "position_size": "kelly" | "fixed" | "volatility_adjusted",
    "max_leverage": 3
  }
}`;

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Extract JSON from response
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    // Parse JSON response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const strategyData = JSON.parse(jsonMatch[0]) as GeneratedStrategy;

    // Validate structure
    if (!strategyData.name || !strategyData.entry_rules || !strategyData.exit_rules) {
      throw new Error("Invalid strategy structure returned by Claude");
    }

    return strategyData;
  }

  /**
   * Suggest improvements for a strategy based on backtest results
   */
  async suggestImprovements(
    strategy: Strategy,
    backtest_results: {
      sharpe_ratio: number;
      max_drawdown: number;
      win_rate: number;
      profit_factor: number;
      total_trades: number;
    }
  ): Promise<{
    suggestions: Array<{
      parameter: string;
      current_value: any;
      suggested_value: any;
      reasoning: string;
      expected_impact: string;
    }>;
    overall_assessment: string;
  }> {
    const systemPrompt = `You are an expert trading strategist analyzing backtest results and suggesting improvements.
Focus on:
- Risk management (stop loss, take profit, position sizing)
- Entry/exit logic (indicator thresholds, confirmations)
- Reducing drawdown and improving Sharpe ratio
- Increasing win rate or profit factor

Provide specific, actionable suggestions.`;

    const userPrompt = `Analyze this strategy and its backtest results, then suggest improvements.

Strategy: ${JSON.stringify(strategy, null, 2)}

Backtest Results:
- Sharpe Ratio: ${backtest_results.sharpe_ratio.toFixed(2)}
- Max Drawdown: ${(backtest_results.max_drawdown * 100).toFixed(2)}%
- Win Rate: ${(backtest_results.win_rate * 100).toFixed(2)}%
- Profit Factor: ${backtest_results.profit_factor.toFixed(2)}
- Total Trades: ${backtest_results.total_trades}

Return ONLY a valid JSON object:
{
  "suggestions": [
    {
      "parameter": "parameter name",
      "current_value": current_value,
      "suggested_value": new_value,
      "reasoning": "explanation",
      "expected_impact": "description of expected improvement"
    }
  ],
  "overall_assessment": "Overall assessment of strategy strength and key improvement areas"
}`;

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      temperature: 0.6,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Refine strategy based on specific feedback
   */
  async refineStrategy(
    strategy: Strategy,
    feedback: string
  ): Promise<GeneratedStrategy> {
    const systemPrompt = `You are an expert trading strategist refining an existing strategy based on feedback.
Return the refined strategy as a valid JSON object with the exact same structure.`;

    const userPrompt = `Refine this trading strategy based on the feedback provided.

Current Strategy: ${JSON.stringify(strategy, null, 2)}

Feedback: ${feedback}

Return ONLY a valid JSON object with this structure:
{
  "name": "Updated Strategy Name",
  "description": "Updated description",
  "entry_rules": { ... },
  "exit_rules": { ... },
  "position_sizing": { ... }
}`;

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    return JSON.parse(jsonMatch[0]) as GeneratedStrategy;
  }
}
