/**
 * Autoresearch Loop
 * Autonomous continuous improvement of trading strategies
 */

import { Strategy, BacktestRun, TRADING_CONSTANTS } from "@bitiqlab/core";
import { BacktestExecutor, OHLCVBar, StrategySignal } from "@bitiqlab/backtest-engine";
import { StrategyGenerator } from "./strategy-generator";
import { SimpleGit } from "simple-git";

export interface AutoresearchConfig {
  strategy_id: string;
  target_metric: "sharpe_ratio" | "profit_factor" | "win_rate";
  max_iterations: number;
  improvement_threshold: number;  // e.g., 0.05 = 5% improvement required
  time_limit_minutes?: number;
  git_repo_path: string;
}

export interface AutoresearchResult {
  iterations_completed: number;
  baseline_metric: number;
  final_metric: number;
  total_improvement: number;
  improvements_made: Array<{
    iteration: number;
    change: string;
    metric_before: number;
    metric_after: number;
    improvement: number;
    kept: boolean;
    git_commit_hash?: string;
  }>;
  status: "completed" | "stopped" | "failed";
  reason: string;
}

/**
 * Autoresearch Loop
 * Continuously improves strategy through iterative backtesting and refinement
 */
export class AutoresearchLoop {
  private config: AutoresearchConfig;
  private generator: StrategyGenerator;
  private git: SimpleGit;
  private startTime: number = 0;

  constructor(config: AutoresearchConfig, generator?: StrategyGenerator) {
    this.config = config;
    this.generator = generator || new StrategyGenerator();
    this.git = require("simple-git")(config.git_repo_path);
  }

  /**
   * Run autoresearch loop
   */
  async run(
    strategy: Strategy,
    historicalData: OHLCVBar[],
    getSignalsCallback: (
      strategy: Strategy,
      bars: OHLCVBar[]
    ) => Promise<StrategySignal[]>
  ): Promise<AutoresearchResult> {
    this.startTime = Date.now();
    const improvements: AutoresearchResult["improvements_made"] = [];

    // Run initial backtest
    const signals = await getSignalsCallback(strategy, historicalData);
    const executor = new BacktestExecutor(
      {
        strategy_id: strategy.id,
        version: strategy.version,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        market_type: strategy.market_type,
        leverage: strategy.leverage,
      },
      10000
    );

    const baselineResult = await executor.execute(historicalData, signals);
    const baselineMetric = this.getMetricValue(baselineResult);

    console.log(
      `[Autoresearch] Baseline ${this.config.target_metric}: ${baselineMetric.toFixed(4)}`
    );

    let currentStrategy = { ...strategy };
    let currentMetric = baselineMetric;
    let iterationCount = 0;

    // Main research loop
    while (
      iterationCount < this.config.max_iterations &&
      !this.isTimeLimitExceeded()
    ) {
      iterationCount++;
      console.log(
        `\n[Autoresearch] Iteration ${iterationCount}/${this.config.max_iterations}`
      );

      try {
        // Get improvement suggestions
        const suggestions = await this.generator.suggestImprovements(
          currentStrategy,
          {
            sharpe_ratio: baselineResult.sharpe_ratio,
            max_drawdown: baselineResult.max_drawdown,
            win_rate: baselineResult.win_rate,
            profit_factor: baselineResult.profit_factor,
            total_trades: baselineResult.total_trades,
          }
        );

        // Apply first suggestion
        if (suggestions.suggestions.length === 0) {
          console.log("[Autoresearch] No suggestions generated, stopping");
          break;
        }

        const suggestion = suggestions.suggestions[0];
        const change = `${suggestion.parameter}: ${suggestion.current_value} → ${suggestion.suggested_value}`;
        console.log(`[Autoresearch] Trying: ${change}`);

        // Apply change to strategy
        const modifiedStrategy = this.applyChange(
          currentStrategy,
          suggestion.parameter,
          suggestion.suggested_value
        );

        // Run backtest on modified strategy
        const modifiedSignals = await getSignalsCallback(
          modifiedStrategy,
          historicalData
        );
        const modifiedExecutor = new BacktestExecutor(
          {
            strategy_id: modifiedStrategy.id,
            version: modifiedStrategy.version,
            symbol: modifiedStrategy.symbol,
            timeframe: modifiedStrategy.timeframe,
            market_type: modifiedStrategy.market_type,
            leverage: modifiedStrategy.leverage,
          },
          10000
        );

        const modifiedResult = await modifiedExecutor.execute(
          historicalData,
          modifiedSignals
        );
        const modifiedMetric = this.getMetricValue(modifiedResult);

        const improvement = modifiedMetric - currentMetric;
        const improvementPercent = (improvement / currentMetric) * 100;

        console.log(
          `[Autoresearch] Result: ${modifiedMetric.toFixed(4)} (${improvementPercent > 0 ? "+" : ""}${improvementPercent.toFixed(2)}%)`
        );

        // Decide whether to keep the change
        if (
          improvementPercent >=
          this.config.improvement_threshold * 100
        ) {
          console.log(
            `[Autoresearch] ✓ Improvement exceeds threshold, KEEPING change`
          );

          // Commit to git
          const commitHash = await this.commitChange(
            modifiedStrategy,
            change,
            improvementPercent
          );

          improvements.push({
            iteration: iterationCount,
            change,
            metric_before: currentMetric,
            metric_after: modifiedMetric,
            improvement: improvementPercent,
            kept: true,
            git_commit_hash: commitHash,
          });

          // Update current state
          currentStrategy = modifiedStrategy;
          currentMetric = modifiedMetric;
        } else {
          console.log(
            `[Autoresearch] ✗ Improvement below threshold (${improvementPercent.toFixed(2)}% < ${this.config.improvement_threshold * 100}%), REVERTING`
          );

          improvements.push({
            iteration: iterationCount,
            change,
            metric_before: currentMetric,
            metric_after: modifiedMetric,
            improvement: improvementPercent,
            kept: false,
          });
        }
      } catch (error) {
        console.error(`[Autoresearch] Error in iteration ${iterationCount}:`, error);
        continue;
      }
    }

    const totalImprovement =
      ((currentMetric - baselineMetric) / baselineMetric) * 100;

    const result: AutoresearchResult = {
      iterations_completed: iterationCount,
      baseline_metric: baselineMetric,
      final_metric: currentMetric,
      total_improvement: totalImprovement,
      improvements_made: improvements,
      status: this.isTimeLimitExceeded() ? "stopped" : "completed",
      reason:
        iterationCount >= this.config.max_iterations
          ? "Max iterations reached"
          : this.isTimeLimitExceeded()
            ? "Time limit exceeded"
            : "No further improvements found",
    };

    console.log("\n[Autoresearch] Summary:");
    console.log(
      `- Total improvement: ${totalImprovement.toFixed(2)}% (${baselineMetric.toFixed(4)} → ${currentMetric.toFixed(4)})`
    );
    console.log(`- Successful improvements: ${improvements.filter((i) => i.kept).length}`);
    console.log(`- Failed attempts: ${improvements.filter((i) => !i.kept).length}`);

    return result;
  }

  /**
   * Get metric value from backtest result
   */
  private getMetricValue(result: BacktestRun): number {
    switch (this.config.target_metric) {
      case "sharpe_ratio":
        return result.sharpe_ratio;
      case "profit_factor":
        return result.profit_factor;
      case "win_rate":
        return result.win_rate;
      default:
        return result.sharpe_ratio;
    }
  }

  /**
   * Apply a change to strategy
   */
  private applyChange(
    strategy: Strategy,
    parameter: string,
    newValue: any
  ): Strategy {
    const modified = JSON.parse(JSON.stringify(strategy)) as Strategy;

    // Map parameter names to strategy fields
    if (parameter.includes("stop_loss")) {
      modified.exit_rules.stop_loss_percent = newValue;
    } else if (parameter.includes("take_profit")) {
      modified.exit_rules.take_profit_percent = newValue;
    } else if (parameter.includes("RSI")) {
      // Update RSI threshold in conditions
      const conditions = modified.entry_rules.conditions as string;
      modified.entry_rules.conditions = conditions.replace(
        /RSI\s*<\s*\d+/,
        `RSI < ${newValue}`
      );
    } else if (parameter.includes("risk_per_trade")) {
      modified.position_sizing.risk_per_trade = newValue;
    } else if (parameter.includes("max_concurrent")) {
      modified.position_sizing.max_concurrent_positions = newValue;
    }

    modified.version += 1;
    modified.updated_at = new Date();

    return modified;
  }

  /**
   * Commit change to git
   */
  private async commitChange(
    strategy: Strategy,
    change: string,
    improvement: number
  ): Promise<string> {
    try {
      // Update strategy config file (would save to actual file in production)
      console.log(`[Git] Committing: ${change} (${improvement.toFixed(2)}% improvement)`);

      // In production, would call git.add() and git.commit()
      // For now, just return a dummy hash
      const dummyHash = Math.random().toString(16).substring(2, 10);
      return dummyHash;
    } catch (error) {
      console.error("[Git] Commit failed:", error);
      return "";
    }
  }

  /**
   * Check if time limit exceeded
   */
  private isTimeLimitExceeded(): boolean {
    if (!this.config.time_limit_minutes) return false;

    const elapsedMinutes = (Date.now() - this.startTime) / 60000;
    return elapsedMinutes > this.config.time_limit_minutes;
  }
}
