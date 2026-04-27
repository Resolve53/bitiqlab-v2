/**
 * TradingView Strategy Manager
 * Manages strategies on TradingView charts via MCP
 *
 * Responsibilities:
 * 1. Register strategies with TradingView
 * 2. Monitor chart for entry/exit signals
 * 3. Execute trades based on signals
 */

import { getTradingViewMCP, TradingViewPrice, ChartState } from "./tradingview-mcp-client";
import { Strategy } from "@/core";

export interface StrategySignalEvent {
  strategy_id: string;
  symbol: string;
  signal: "BUY" | "SELL";
  price: number;
  confidence: number;
  reason: string;
  timestamp: string;
}

class TradingViewStrategyManager {
  private activePaperTrades = new Map<string, string>(); // strategy_id -> session_id
  private lastSignalTimes = new Map<string, number>(); // Prevent signal spam
  private signalCooldown = 5000; // 5 seconds between signals

  /**
   * Register a strategy with TradingView
   * Automatically adds required indicators and sets up monitoring
   */
  async registerStrategy(strategy: Strategy, symbol: string): Promise<void> {
    try {
      const mcp = getTradingViewMCP();

      console.log(`[STRATEGY] Registering strategy: ${strategy.name}`);
      console.log(`[STRATEGY] Symbol: ${symbol}, Timeframe: ${strategy.timeframe}`);
      console.log(`[STRATEGY] Auto-adding required indicators...`);

      // Add all required indicators automatically
      await this.setupIndicators(mcp, symbol, strategy.timeframe);

      // Get chart state to confirm connection
      const chartState = await mcp.getChartState(symbol, strategy.timeframe);

      console.log(
        `[STRATEGY] ✓ Connected to TradingView chart: ${chartState.symbol} ${chartState.timeframe}`
      );
      console.log(`[STRATEGY] Current price: $${chartState.price}`);
      console.log(
        `[STRATEGY] Indicators: RSI=${chartState.indicators.rsi}, MACD=${chartState.indicators.macd?.line}`
      );

      // Start monitoring this strategy
      this.startMonitoring(strategy, symbol);
    } catch (error) {
      console.error(`[STRATEGY] Failed to register strategy:`, error);
      throw error;
    }
  }

  /**
   * Automatically add all required indicators to the chart
   */
  private async setupIndicators(
    mcp: any,
    symbol: string,
    timeframe: string
  ): Promise<void> {
    try {
      // RSI (Period 14)
      await mcp.addIndicator(symbol, timeframe, "Relative Strength Index", {
        length: 14,
        source: "close",
      });

      // MACD (12, 26, 9)
      await mcp.addIndicator(symbol, timeframe, "MACD", {
        fastLength: 12,
        slowLength: 26,
        signalLength: 9,
        source: "close",
      });

      // Bollinger Bands (20, 2)
      await mcp.addIndicator(symbol, timeframe, "Bollinger Bands", {
        length: 20,
        deviation: 2,
        source: "close",
      });

      // Moving Average (20)
      await mcp.addIndicator(symbol, timeframe, "Moving Average", {
        length: 20,
        type: "SMA",
        source: "close",
      });

      // Moving Average (50)
      await mcp.addIndicator(symbol, timeframe, "Moving Average", {
        length: 50,
        type: "SMA",
        source: "close",
      });

      console.log(`[STRATEGY] ✓ All indicators added to chart`);
    } catch (error) {
      console.warn(
        `[STRATEGY] Warning: Could not auto-add all indicators. You may need to add them manually.`,
        error
      );
    }
  }

  /**
   * Link a strategy to a paper trading session
   */
  linkPaperTradingSession(strategy_id: string, session_id: string): void {
    this.activePaperTrades.set(strategy_id, session_id);
    console.log(`[STRATEGY] Linked strategy ${strategy_id} to session ${session_id}`);
  }

  /**
   * Unlink a strategy from paper trading
   */
  unlinkPaperTradingSession(strategy_id: string): void {
    this.activePaperTrades.delete(strategy_id);
    console.log(`[STRATEGY] Unlinked strategy ${strategy_id}`);
  }

  /**
   * Start monitoring a strategy on TradingView
   */
  private startMonitoring(strategy: Strategy, symbol: string): void {
    // Monitor every 5 seconds
    const monitorInterval = setInterval(async () => {
      try {
        await this.evaluateStrategy(strategy, symbol);
      } catch (error) {
        console.error(`[STRATEGY] Error monitoring ${strategy.name}:`, error);
      }
    }, 5000);

    // Store interval for cleanup
    (this as any).monitoringIntervals ??= new Map();
    (this as any).monitoringIntervals.set(strategy.id, monitorInterval);
  }

  /**
   * Evaluate strategy on current chart
   */
  private async evaluateStrategy(strategy: Strategy, symbol: string): Promise<void> {
    try {
      const mcp = getTradingViewMCP();

      // Get current chart state
      const chartState = await mcp.getChartState(symbol, strategy.timeframe);

      // Check if we have an active session for this strategy
      const sessionId = this.activePaperTrades.get(strategy.id);
      if (!sessionId) {
        return; // Strategy not linked to paper trading
      }

      // Get last signal time to avoid spam
      const lastSignalTime = this.lastSignalTimes.get(strategy.id) || 0;
      const now = Date.now();
      if (now - lastSignalTime < this.signalCooldown) {
        return; // Cooldown period not passed
      }

      // Evaluate entry/exit conditions
      const signal = this.generateSignal(strategy, chartState);

      if (signal) {
        console.log(`[STRATEGY] 📊 Signal generated: ${signal.signal}`);
        console.log(`[STRATEGY] Reason: ${signal.reason}`);
        console.log(`[STRATEGY] Confidence: ${signal.confidence}%`);

        // Update last signal time
        this.lastSignalTimes.set(strategy.id, now);

        // Return signal for execution
        // (The monitor endpoint will execute the actual trade)
      }
    } catch (error) {
      console.warn(`[STRATEGY] Error evaluating strategy:`, error);
    }
  }

  /**
   * Generate trading signal based on strategy rules and chart data
   */
  private generateSignal(
    strategy: Strategy,
    chartState: ChartState
  ): StrategySignalEvent | null {
    const { symbol, price, indicators } = chartState;
    let signal: "BUY" | "SELL" | null = null;
    let confidence = 0;
    const reasons: string[] = [];

    // Check entry rules
    if (!indicators.rsi && !indicators.macd && !indicators.moving_average_20) {
      console.warn(`[STRATEGY] No indicator data available`);
      return null;
    }

    // RSI-based signals
    if (indicators.rsi !== undefined) {
      if (indicators.rsi < 30) {
        reasons.push(`RSI oversold (${indicators.rsi.toFixed(1)})`);
        confidence += 35;
        signal = "BUY";
      } else if (indicators.rsi > 70) {
        reasons.push(`RSI overbought (${indicators.rsi.toFixed(1)})`);
        confidence -= 20;
      }
    }

    // MACD-based signals
    if (indicators.macd) {
      if (
        indicators.macd.line > indicators.macd.signal &&
        indicators.macd.histogram > 0
      ) {
        reasons.push(`MACD bullish crossover`);
        confidence += 30;
        signal = "BUY";
      } else if (
        indicators.macd.line < indicators.macd.signal &&
        indicators.macd.histogram < 0
      ) {
        reasons.push(`MACD bearish crossover`);
        confidence -= 25;
      }
    }

    // Moving Average signals
    if (
      indicators.moving_average_20 &&
      indicators.moving_average_50
    ) {
      if (
        price > indicators.moving_average_20 &&
        indicators.moving_average_20 > indicators.moving_average_50
      ) {
        reasons.push(`Price above MA20, MA20 > MA50 (uptrend)`);
        confidence += 25;
        signal = "BUY";
      } else if (
        price < indicators.moving_average_20 &&
        indicators.moving_average_20 < indicators.moving_average_50
      ) {
        reasons.push(`Price below MA20, MA20 < MA50 (downtrend)`);
        confidence -= 20;
      }
    }

    // Bollinger Bands
    if (indicators.bollinger_bands) {
      if (price < indicators.bollinger_bands.lower) {
        reasons.push(`Price below lower Bollinger Band`);
        confidence += 25;
        signal = "BUY";
      } else if (price > indicators.bollinger_bands.upper) {
        reasons.push(`Price above upper Bollinger Band`);
        confidence -= 15;
      }
    }

    // Clamp confidence
    confidence = Math.max(-100, Math.min(100, confidence));

    // Generate signal if confidence > 50
    if (confidence > 50) {
      const finalSignal = signal || "BUY";
      return {
        strategy_id: strategy.id,
        symbol,
        signal: finalSignal,
        price,
        confidence: Math.abs(confidence),
        reason: reasons.join("; ") || "Strategy conditions met",
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Stop monitoring a strategy
   */
  stopMonitoring(strategy_id: string): void {
    const intervals = (this as any).monitoringIntervals as Map<string, NodeJS.Timeout>;
    if (intervals?.has(strategy_id)) {
      clearInterval(intervals.get(strategy_id));
      intervals.delete(strategy_id);
      console.log(`[STRATEGY] Stopped monitoring: ${strategy_id}`);
    }
  }

  /**
   * Get active strategies
   */
  getActiveStrategies(): Array<{ strategy_id: string; session_id: string }> {
    const active: Array<{ strategy_id: string; session_id: string }> = [];
    for (const [strategyId, sessionId] of this.activePaperTrades.entries()) {
      active.push({ strategy_id: strategyId, session_id: sessionId });
    }
    return active;
  }
}

// Singleton instance
let manager: TradingViewStrategyManager | null = null;

export function getStrategyManager(): TradingViewStrategyManager {
  if (!manager) {
    manager = new TradingViewStrategyManager();
  }
  return manager;
}
