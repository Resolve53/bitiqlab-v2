/**
 * Signal Generator
 * Converts strategy rules into trading signals using indicator data
 */

import { StrategySignal } from "@bitiqlab/backtest-engine";
import { EntryRules, ExitRules } from "@bitiqlab/core";
import { TradingViewDataFetcher, IndicatorResponse } from "./data-fetcher";

export interface SignalGeneratorConfig {
  symbol: string;
  timeframe: string;
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  market_type: "spot" | "futures";
  leverage: number;
}

/**
 * Signal Generator
 * Evaluates strategy rules and generates entry/exit signals
 */
export class SignalGenerator {
  private config: SignalGeneratorConfig;
  private dataFetcher: TradingViewDataFetcher;

  constructor(config: SignalGeneratorConfig, dataFetcher: TradingViewDataFetcher) {
    this.config = config;
    this.dataFetcher = dataFetcher;
  }

  /**
   * Generate signals from historical data
   */
  async generateSignals(
    start_date: Date,
    end_date: Date
  ): Promise<StrategySignal[]> {
    // Extract required indicators from rules
    const requiredIndicators = this.extractRequiredIndicators();

    // Fetch data from TradingView
    const indicatorData = await this.dataFetcher.getIndicators(
      this.config.symbol,
      this.config.timeframe,
      Array.from(requiredIndicators),
      start_date,
      end_date
    );

    // Generate signals by evaluating rules
    const signals = this.evaluateRules(indicatorData);

    return signals;
  }

  /**
   * Generate real-time signal for current bar
   */
  async generateRealtimeSignal(
    currentBar: any,
    indicatorValues: IndicatorResponse
  ): Promise<StrategySignal | null> {
    // Evaluate entry conditions
    const entrySignal = this.evaluateEntryConditions(indicatorValues, currentBar);
    if (entrySignal) {
      return entrySignal;
    }

    // Evaluate exit conditions
    const exitSignal = this.evaluateExitConditions(indicatorValues, currentBar);
    if (exitSignal) {
      return exitSignal;
    }

    return null;
  }

  /**
   * Extract required indicators from entry/exit rules
   */
  private extractRequiredIndicators(): Set<string> {
    const indicators = new Set<string>();

    // Parse entry rules
    const entryConditions = this.config.entry_rules.conditions || "";
    const exitConditions = this.config.exit_rules.exit_conditions || "";
    const allRules = entryConditions + " " + exitConditions;

    // Common indicator patterns
    const patterns = [
      /RSI\((\d+)\)/g,
      /MACD\((\d+),(\d+),(\d+)\)/g,
      /EMA\((\d+)\)/g,
      /SMA\((\d+)\)/g,
      /BB\((\d+),(\d+)\)/g,  // Bollinger Bands
      /STOCH\((\d+),(\d+),(\d+)\)/g,
      /ATR\((\d+)\)/g,
      /ADX\((\d+)\)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(allRules)) !== null) {
        const indicator = match[0].split("(")[0];
        indicators.add(indicator);
      }
    }

    return indicators;
  }

  /**
   * Evaluate rules and generate signals
   */
  private evaluateRules(indicatorData: IndicatorResponse): StrategySignal[] {
    const signals: StrategySignal[] = [];
    const timestamps = this.getCommonTimestamps(indicatorData);

    for (const timestamp of timestamps) {
      const values = this.getIndicatorValuesAtTime(indicatorData, timestamp);

      // Check entry conditions
      const entryConditionsMet = this.evaluateCondition(
        this.config.entry_rules.conditions as string,
        values
      );

      if (entryConditionsMet) {
        // Determine direction (long or short)
        const direction = this.determineDirection(values);

        // Calculate stop loss and take profit
        const { stop_loss, take_profit } = this.calculateLevels(values, direction);

        signals.push({
          timestamp,
          type: "entry",
          direction,
          entry_price: values.close,
          stop_loss,
          take_profit,
          conditions: values,
        });
      }

      // Check exit conditions
      const exitConditionsMet = this.evaluateCondition(
        this.config.exit_rules.exit_conditions as string,
        values
      );

      if (exitConditionsMet) {
        signals.push({
          timestamp,
          type: "exit",
          exit_reason: "strategy_signal",
          conditions: values,
        });
      }
    }

    return signals;
  }

  /**
   * Evaluate entry conditions at current state
   */
  private evaluateEntryConditions(
    indicators: IndicatorResponse,
    currentBar: any
  ): StrategySignal | null {
    const values = {
      ...currentBar,
      ...this.flattenIndicators(indicators),
    };

    const conditionsMet = this.evaluateCondition(
      this.config.entry_rules.conditions as string,
      values
    );

    if (conditionsMet) {
      const direction = this.determineDirection(values);
      const { stop_loss, take_profit } = this.calculateLevels(
        values,
        direction
      );

      return {
        timestamp: new Date(),
        type: "entry",
        direction,
        entry_price: currentBar.close,
        stop_loss,
        take_profit,
        conditions: values,
      };
    }

    return null;
  }

  /**
   * Evaluate exit conditions at current state
   */
  private evaluateExitConditions(
    indicators: IndicatorResponse,
    currentBar: any
  ): StrategySignal | null {
    const values = {
      ...currentBar,
      ...this.flattenIndicators(indicators),
    };

    const conditionsMet = this.evaluateCondition(
      this.config.exit_rules.exit_conditions as string,
      values
    );

    if (conditionsMet) {
      return {
        timestamp: new Date(),
        type: "exit",
        exit_reason: "strategy_signal",
        conditions: values,
      };
    }

    return null;
  }

  /**
   * Evaluate a condition string (e.g., "RSI < 30 AND MACD > 0")
   */
  private evaluateCondition(condition: string, values: Record<string, any>): boolean {
    try {
      // Replace indicator names with their values
      let evaluable = condition;

      // Replace all indicator references
      for (const [key, value] of Object.entries(values)) {
        const regex = new RegExp(`\\b${key}\\b`, "g");
        evaluable = evaluable.replace(regex, String(value));
      }

      // Use Function constructor (safer than eval)
      // eslint-disable-next-line no-new-func
      const func = new Function(`return ${evaluable}`);
      return func() as boolean;
    } catch (error) {
      console.error(`Error evaluating condition: ${condition}`, error);
      return false;
    }
  }

  /**
   * Get common timestamps across all indicators
   */
  private getCommonTimestamps(indicatorData: IndicatorResponse): Date[] {
    if (Object.keys(indicatorData).length === 0) return [];

    const firstIndicator = Object.values(indicatorData)[0];
    const timestamps = firstIndicator.map((v) => v.timestamp);

    // Filter to only timestamps that exist in all indicators
    return timestamps.filter((ts) =>
      Object.values(indicatorData).every((indicator) =>
        indicator.some((v) => v.timestamp.getTime() === ts.getTime())
      )
    );
  }

  /**
   * Get all indicator values at a specific timestamp
   */
  private getIndicatorValuesAtTime(
    indicatorData: IndicatorResponse,
    timestamp: Date
  ): Record<string, any> {
    const values: Record<string, any> = {
      timestamp,
    };

    for (const [indicator, data] of Object.entries(indicatorData)) {
      const value = data.find((v) => v.timestamp.getTime() === timestamp.getTime());
      if (value) {
        values[indicator] = value.value;
        if (value.signal) values[`${indicator}_signal`] = value.signal;
        if (value.histogram) values[`${indicator}_histogram`] = value.histogram;
      }
    }

    return values;
  }

  /**
   * Flatten nested indicator objects
   */
  private flattenIndicators(indicators: IndicatorResponse): Record<string, any> {
    const flat: Record<string, any> = {};

    for (const [indicator, values] of Object.entries(indicators)) {
      if (values.length > 0) {
        const latest = values[values.length - 1];
        flat[indicator] = latest.value;
        if (latest.signal) flat[`${indicator}_signal`] = latest.signal;
        if (latest.histogram) flat[`${indicator}_histogram`] = latest.histogram;
      }
    }

    return flat;
  }

  /**
   * Determine trade direction (long or short)
   */
  private determineDirection(values: Record<string, any>): "long" | "short" {
    // This can be enhanced based on more complex logic
    const direction = (this.config.entry_rules.direction as "long" | "short") || "long";
    return direction;
  }

  /**
   * Calculate stop loss and take profit levels
   */
  private calculateLevels(
    values: Record<string, any>,
    direction: "long" | "short"
  ): { stop_loss: number; take_profit: number } {
    const close = values.close || 0;
    const slPercent = (this.config.exit_rules.stop_loss_percent as number) || -2;
    const tpPercent = (this.config.exit_rules.take_profit_percent as number) || 5;

    let stop_loss: number;
    let take_profit: number;

    if (direction === "long") {
      stop_loss = close * (1 + slPercent / 100);
      take_profit = close * (1 + tpPercent / 100);
    } else {
      stop_loss = close * (1 - slPercent / 100);
      take_profit = close * (1 - tpPercent / 100);
    }

    return { stop_loss, take_profit };
  }
}
