/**
 * Walk-Forward Validator
 * Validates strategies against overfitting using rolling windows
 */

import {
  WalkForwardResult,
  WalkForwardWindow,
  BacktestRun,
} from "../../core";
import { OHLCVBar, BacktestExecutor, StrategySignal, BacktestConfig } from "../engine/backtest-executor";
import { v4 as uuid } from "uuid";

export interface WalkForwardConfig {
  strategy_id: string;
  version: number;
  data_period_months: number;  // Total data window (e.g., 12)
  window_size_months: number;  // Rolling window (e.g., 3)
  train_percent: number;  // Percentage for training (e.g., 0.6)
}

/**
 * Walk-Forward Validator
 * Tests strategy on multiple rolling windows to detect overfitting
 */
export class WalkForwardValidator {
  private config: WalkForwardConfig;

  constructor(config: WalkForwardConfig) {
    this.config = config;
  }

  /**
   * Execute walk-forward validation
   */
  async validate(
    allBars: OHLCVBar[],
    getSignalsCallback: (
      bars: OHLCVBar[],
      isTesting: boolean
    ) => Promise<StrategySignal[]>
  ): Promise<WalkForwardResult> {
    const windows = this.createRollingWindows(allBars);
    const windowResults: WalkForwardWindow[] = [];

    let totalTrainSharpe = 0;
    let totalTestSharpe = 0;

    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];

      // Training phase
      const trainBars = allBars.slice(window.train_start_idx, window.train_end_idx);
      const trainSignals = await getSignalsCallback(trainBars, false);
      const trainResult = await this.runBacktest(trainBars, trainSignals, false);

      // Testing phase (out-of-sample)
      const testBars = allBars.slice(window.test_start_idx, window.test_end_idx);
      const testSignals = await getSignalsCallback(testBars, true);
      const testResult = await this.runBacktest(testBars, testSignals, true);

      totalTrainSharpe += trainResult.sharpe_ratio;
      totalTestSharpe += testResult.sharpe_ratio;

      windowResults.push({
        window_number: i + 1,
        train_start: trainBars[0].timestamp,
        train_end: trainBars[trainBars.length - 1].timestamp,
        test_start: testBars[0].timestamp,
        test_end: testBars[testBars.length - 1].timestamp,
        train_sharpe: trainResult.sharpe_ratio,
        train_trades: trainResult.total_trades,
        test_sharpe: testResult.sharpe_ratio,
        test_trades: testResult.total_trades,
        test_max_drawdown: testResult.max_drawdown,
      });
    }

    const avgTrainSharpe = totalTrainSharpe / windows.length;
    const avgTestSharpe = totalTestSharpe / windows.length;

    // Calculate consistency score
    const consistencyScore = this.calculateConsistency(windowResults);

    // Detect overfitting
    const overFittingRatio = avgTrainSharpe / avgTestSharpe;
    const isOverfit = overFittingRatio > 1.3;  // Threshold: 30% difference

    return {
      strategy_id: this.config.strategy_id,
      version: this.config.version,
      avg_sharpe: avgTestSharpe,  // Use out-of-sample Sharpe
      avg_max_drawdown: windowResults.reduce((sum, w) => sum + w.test_max_drawdown, 0) /
        windowResults.length,
      consistency_score: consistencyScore,
      windows: windowResults,
      is_overfit: isOverfit,
      overfitting_ratio: overFittingRatio,
      created_at: new Date(),
    };
  }

  /**
   * Create rolling windows for walk-forward analysis
   */
  private createRollingWindows(
    bars: OHLCVBar[]
  ): {
    train_start_idx: number;
    train_end_idx: number;
    test_start_idx: number;
    test_end_idx: number;
  }[] {
    const windows: any[] = [];
    const windowSizeMonths = this.config.window_size_months;
    const totalMonths = this.config.data_period_months;

    // Calculate bar indices per month (approximately 21 trading days per month)
    const barsPerMonth = Math.ceil(bars.length / totalMonths);
    const testWindowBars = barsPerMonth * windowSizeMonths;
    const trainWindowBars = Math.floor(testWindowBars * this.config.train_percent);

    // Create rolling windows
    let currentIdx = 0;
    const maxIdx = bars.length;

    while (currentIdx + trainWindowBars + testWindowBars <= maxIdx) {
      windows.push({
        train_start_idx: currentIdx,
        train_end_idx: currentIdx + trainWindowBars,
        test_start_idx: currentIdx + trainWindowBars,
        test_end_idx: currentIdx + trainWindowBars + testWindowBars,
      });

      currentIdx += testWindowBars;  // Move window forward by test size
    }

    return windows;
  }

  /**
   * Run backtest on a subset of bars
   */
  private async runBacktest(
    bars: OHLCVBar[],
    signals: StrategySignal[],
    _isTesting: boolean
  ): Promise<BacktestRun> {
    const config: BacktestConfig = {
      strategy_id: this.config.strategy_id,
      version: this.config.version,
      symbol: "BTCUSDT",  // Would come from strategy config
      timeframe: "1h",  // Would come from strategy config
      market_type: "spot",
      leverage: 1,
    };

    const executor = new BacktestExecutor(config);
    return executor.execute(bars, signals);
  }

  /**
   * Calculate consistency score from window results
   * Higher score = more consistent performance across windows
   */
  private calculateConsistency(windows: WalkForwardWindow[]): number {
    const testSharpes = windows.map((w) => w.test_sharpe);
    const mean = testSharpes.reduce((a, b) => a + b, 0) / testSharpes.length;
    const variance =
      testSharpes.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) /
      testSharpes.length;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation (lower is better)
    const cv = mean !== 0 ? stdDev / Math.abs(mean) : 1;

    // Convert to 0-1 scale (1 = perfect consistency)
    return Math.max(0, 1 - Math.min(cv, 1));
  }
}

/**
 * Out-of-Sample Validator
 * Validates by holding out last N months of data
 */
export class OutOfSampleValidator {
  /**
   * Validate using last N months as out-of-sample data
   */
  static async validate(
    bars: OHLCVBar[],
    holdoutMonths: number,
    getSignalsCallback: (
      bars: OHLCVBar[],
      isTesting: boolean
    ) => Promise<StrategySignal[]>,
    strategyConfig: BacktestConfig
  ): Promise<{
    in_sample_result: BacktestRun;
    out_of_sample_result: BacktestRun;
    overfitting_score: number;
  }> {
    // Calculate split point
    const barsPerMonth = Math.ceil(bars.length / 12);  // Assume 12 months of data
    const testWindowBars = barsPerMonth * holdoutMonths;
    const splitIdx = bars.length - testWindowBars;

    // In-sample (training data)
    const trainBars = bars.slice(0, splitIdx);
    const trainSignals = await getSignalsCallback(trainBars, false);
    const executor1 = new BacktestExecutor(strategyConfig);
    const in_sample_result = await executor1.execute(trainBars, trainSignals);

    // Out-of-sample (testing data)
    const testBars = bars.slice(splitIdx);
    const testSignals = await getSignalsCallback(testBars, true);
    const executor2 = new BacktestExecutor(strategyConfig);
    const out_of_sample_result = await executor2.execute(testBars, testSignals);

    // Calculate overfitting score
    const overfitting_score =
      out_of_sample_result.sharpe_ratio > 0
        ? in_sample_result.sharpe_ratio / out_of_sample_result.sharpe_ratio
        : 0;

    return {
      in_sample_result,
      out_of_sample_result,
      overfitting_score,
    };
  }
}
