/**
 * Backtest Executor
 * Core engine for simulating trades and calculating metrics
 */

import { v4 as uuid } from "uuid";
import {
  Trade,
  BacktestRun,
  BacktestWindow,
  TradeDirection,
  Strategy,
  EquityPoint,
} from "@bitiqlab/core";

export interface OHLCVBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategySignal {
  timestamp: Date;
  type: "entry" | "exit";
  direction?: "long" | "short";
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  conditions?: Record<string, any>;
  exit_reason?: string;
}

export interface BacktestConfig {
  strategy_id: string;
  version: number;
  symbol: string;
  timeframe: string;
  market_type: "spot" | "futures";
  leverage: number;
  commission_percent?: number;  // Default: 0.1%
  slippage_percent?: number;  // Default: 0.01%
}

/**
 * Main Backtest Executor
 * Simulates strategy execution on historical data
 */
export class BacktestExecutor {
  private config: BacktestConfig;
  private trades: Trade[] = [];
  private equity: number;
  private equityCurve: EquityPoint[] = [];
  private currentPosition: Position | null = null;

  constructor(config: BacktestConfig, initialCapital: number = 10000) {
    this.config = {
      ...config,
      commission_percent: config.commission_percent ?? 0.1,
      slippage_percent: config.slippage_percent ?? 0.01,
    };
    this.equity = initialCapital;
  }

  /**
   * Execute backtest on historical data
   */
  async execute(
    bars: OHLCVBar[],
    signals: StrategySignal[]
  ): Promise<BacktestRun> {
    this.trades = [];
    this.equityCurve = [];
    this.currentPosition = null;

    // Sort signals by timestamp
    const sortedSignals = [...signals].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Process each signal
    for (const signal of sortedSignals) {
      const bar = this.findBar(bars, signal.timestamp);
      if (!bar) continue;

      if (signal.type === "entry") {
        this.handleEntrySignal(signal, bar);
      } else if (signal.type === "exit") {
        this.handleExitSignal(signal, bar);
      }
    }

    // Close any remaining positions at the end
    if (this.currentPosition) {
      const lastBar = bars[bars.length - 1];
      this.closePosition(this.currentPosition, lastBar.close, lastBar.timestamp, "timeout");
    }

    // Calculate metrics
    const backtest = this.calculateMetrics(bars);
    return backtest;
  }

  /**
   * Handle entry signal
   */
  private handleEntrySignal(signal: StrategySignal, bar: OHLCVBar): void {
    if (this.currentPosition) {
      // Already in a position, skip
      return;
    }

    const entry_price = this.applySlippage(
      signal.entry_price || bar.close,
      signal.direction === "short"
    );

    const trade: Trade = {
      id: uuid(),
      strategy_id: this.config.strategy_id,
      session_id: uuid(),  // Would be backtest run ID
      symbol: this.config.symbol,
      timeframe: this.config.timeframe,
      market_type: this.config.market_type,
      leverage: this.config.leverage,
      direction: signal.direction as TradeDirection,
      entry_price,
      entry_time: bar.timestamp,
      entry_conditions: signal.conditions,
      stop_loss: signal.stop_loss || 0,
      take_profit: signal.take_profit || 0,
      exit_price: 0,
      exit_time: new Date(),
      exit_reason: "manual",
      pnl_percent: 0,
      pnl_absolute: 0,
      r_r_actual: 0,
      max_favorable_excursion: 0,
      max_adverse_excursion: 0,
      duration_minutes: 0,
      created_at: new Date(),
    };

    this.currentPosition = {
      trade,
      bar_entry: bar,
      highest_price: bar.high,
      lowest_price: bar.low,
    };
  }

  /**
   * Handle exit signal
   */
  private handleExitSignal(signal: StrategySignal, bar: OHLCVBar): void {
    if (!this.currentPosition) {
      return;  // No position to exit
    }

    const exit_price = this.applySlippage(
      signal.entry_price || bar.close,
      this.currentPosition.trade.direction === "long"
    );

    this.closePosition(
      this.currentPosition,
      exit_price,
      bar.timestamp,
      signal.exit_reason || "manual"
    );
  }

  /**
   * Close a position and record the trade
   */
  private closePosition(
    position: Position,
    exit_price: number,
    exit_time: Date,
    exit_reason: string
  ): void {
    const trade = position.trade;
    const entry_price = trade.entry_price;
    const quantity = 1;  // For now, assume 1 unit

    // Calculate P&L
    let pnl_percent: number;
    let max_favorable: number;
    let max_adverse: number;

    if (trade.direction === "long") {
      pnl_percent = (exit_price - entry_price) / entry_price;
      max_favorable = (position.highest_price - entry_price) / entry_price;
      max_adverse = (position.lowest_price - entry_price) / entry_price;
    } else {
      pnl_percent = (entry_price - exit_price) / entry_price;
      max_favorable = (entry_price - position.lowest_price) / entry_price;
      max_adverse = (entry_price - position.highest_price) / entry_price;
    }

    // Apply commission
    const commission = (Math.abs(pnl_percent) * this.config.commission_percent!) / 100;
    const net_pnl_percent = pnl_percent - commission;

    // Update equity
    const pnl_usd = this.equity * net_pnl_percent;
    this.equity += pnl_usd;

    // Calculate R:R
    const risk = Math.abs(entry_price - trade.stop_loss) / entry_price;
    const reward = Math.abs(trade.take_profit - entry_price) / entry_price;
    const r_r_actual = risk > 0 ? reward / risk : 0;

    // Update trade
    trade.exit_price = exit_price;
    trade.exit_time = exit_time;
    trade.exit_reason = exit_reason as any;
    trade.pnl_percent = net_pnl_percent;
    trade.pnl_absolute = pnl_usd;
    trade.r_r_actual = r_r_actual;
    trade.max_favorable_excursion = max_favorable;
    trade.max_adverse_excursion = max_adverse;
    trade.duration_minutes = Math.floor(
      (exit_time.getTime() - trade.entry_time.getTime()) / 60000
    );

    this.trades.push(trade);
    this.currentPosition = null;

    // Add equity point
    this.equityCurve.push({
      timestamp: exit_time,
      equity: this.equity,
      cumulative_return: (this.equity - 10000) / 10000,
    });
  }

  /**
   * Find OHLCV bar at specific timestamp
   */
  private findBar(bars: OHLCVBar[], timestamp: Date): OHLCVBar | null {
    // Find the bar that contains or is closest to this timestamp
    return (
      bars.find(
        (bar) =>
          bar.timestamp.getTime() <= timestamp.getTime() &&
          bar.timestamp.getTime() + 60000 > timestamp.getTime()
      ) || null
    );
  }

  /**
   * Apply slippage to entry/exit prices
   */
  private applySlippage(price: number, isEntry: boolean): number {
    const slippage =
      (price * (this.config.slippage_percent || 0.01)) / 100;
    return isEntry ? price + slippage : price - slippage;
  }

  /**
   * Calculate all backtest metrics
   */
  private calculateMetrics(bars: OHLCVBar[]): BacktestRun {
    const window: BacktestWindow = "12m";  // Default
    const startDate = bars[0].timestamp;
    const endDate = bars[bars.length - 1].timestamp;

    // Calculate win/loss metrics
    const winningTrades = this.trades.filter((t) => t.pnl_percent > 0);
    const losingTrades = this.trades.filter((t) => t.pnl_percent < 0);
    const totalTrades = this.trades.length;

    const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0;

    // Calculate profit factor
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl_absolute, 0);
    const grossLoss = losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl_absolute), 0);
    const profitFactor = grossLoss !== 0 ? grossProfit / grossLoss : 0;

    // Calculate Sharpe ratio
    const returns = this.trades.map((t) => t.pnl_percent);
    const sharpeRatio = this.calculateSharpe(returns);

    // Calculate max drawdown
    const maxDrawdown = this.calculateMaxDrawdown();

    // Calculate total return
    const totalReturn = (this.equity - 10000) / 10000;

    // Calculate average R:R
    const avgRR =
      this.trades.length > 0
        ? this.trades.reduce((sum, t) => sum + (t.r_r_actual || 0), 0) /
          this.trades.length
        : 0;

    return {
      id: uuid(),
      strategy_id: this.config.strategy_id,
      version: this.config.version,
      window,
      start_date: new Date(startDate),
      end_date: new Date(endDate),
      total_trades: totalTrades,
      win_rate: winRate,
      profit_factor: profitFactor,
      sharpe_ratio: sharpeRatio,
      sortino_ratio: this.calculateSortino(returns),
      max_drawdown: maxDrawdown,
      avg_r_r: avgRR,
      total_return: totalReturn,
      trades: this.trades,
      daily_returns: returns,
      equity_curve: this.equityCurve,
      created_at: new Date(),
      test_duration_minutes: Math.floor(
        (endDate.getTime() - startDate.getTime()) / 60000
      ),
      data_points: bars.length,
    };
  }

  /**
   * Calculate Sharpe ratio from returns
   */
  private calculateSharpe(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) /
      returns.length;
    const stdDev = Math.sqrt(variance);

    const riskFreeRate = 0.02 / 252;  // Annualized to daily
    return stdDev > 0 ? (mean - riskFreeRate) / stdDev : 0;
  }

  /**
   * Calculate Sortino ratio (only downside volatility)
   */
  private calculateSortino(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downside = returns
      .filter((r) => r < mean)
      .reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0);

    const downsidevariace = downside / returns.length;
    const downsideStdDev = Math.sqrt(downsidevariace);

    const riskFreeRate = 0.02 / 252;
    return downsideStdDev > 0 ? (mean - riskFreeRate) / downsideStdDev : 0;
  }

  /**
   * Calculate maximum drawdown from equity curve
   */
  private calculateMaxDrawdown(): number {
    if (this.equityCurve.length < 2) return 0;

    let maxDrawdown = 0;
    let peak = this.equityCurve[0].equity;

    for (const point of this.equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const drawdown = (peak - point.equity) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Get equity curve for visualization
   */
  getEquityCurve(): EquityPoint[] {
    return this.equityCurve;
  }

  /**
   * Get all trades
   */
  getTrades(): Trade[] {
    return this.trades;
  }
}

/**
 * Internal position tracking
 */
interface Position {
  trade: Trade;
  bar_entry: OHLCVBar;
  highest_price: number;
  lowest_price: number;
}
