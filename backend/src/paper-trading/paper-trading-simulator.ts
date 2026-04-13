/**
 * Paper Trading Simulator
 * Simulates real-time trading on Binance testnet
 */

import { v4 as uuid } from "uuid";
import {
  Trade,
  PaperTradingSession,
  PaperTradingSignal,
  PaperTradingSessionStatus,
} from "../../core";
import { StrategySignal } from "../../backtest-engine";

export interface PaperTradingConfig {
  strategy_id: string;
  initial_capital: number;
  max_drawdown_limit: number;  // e.g., 0.2 = 20%
  max_concurrent_positions: number;
  commission_percent: number;
  slippage_percent: number;
}

interface ActivePosition {
  trade: Trade;
  entry_time: Date;
  highest_price: number;
  lowest_price: number;
}

/**
 * Paper Trading Simulator
 * Tracks trades, manages positions, and monitors performance
 */
export class PaperTradingSimulator {
  private config: PaperTradingConfig;
  private session: PaperTradingSession;
  private activePositions: Map<string, ActivePosition> = new Map();
  private trades: Trade[] = [];
  private signals: PaperTradingSignal[] = [];
  private equityHistory: Array<{ timestamp: Date; equity: number }> = [];

  constructor(config: PaperTradingConfig) {
    this.config = config;
    this.session = {
      id: uuid(),
      strategy_id: config.strategy_id,
      version: 1,
      start_date: new Date(),
      status: "active" as PaperTradingSessionStatus,
      paper_account_id: uuid(),
      initial_balance: config.initial_capital,
      current_balance: config.initial_capital,
      total_trades: 0,
      win_rate: 0,
      loss_rate: 0,
      total_pnl: 0,
      total_pnl_percent: 0,
      trades: [],
      meets_min_trades: false,
      meets_min_duration: false,
      passes_stability_checks: false,
      validation_status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
      use_testnet: true,
    };

    this.recordEquity(this.session.current_balance);
  }

  /**
   * Process incoming signal
   */
  async processSignal(signal: StrategySignal, currentPrice: number): Promise<void> {
    if (signal.type === "entry") {
      this.handleEntrySignal(signal, currentPrice);
    } else if (signal.type === "exit") {
      this.handleExitSignal(signal, currentPrice);
    }
  }

  /**
   * Handle entry signal
   */
  private handleEntrySignal(signal: StrategySignal, currentPrice: number): void {
    // Check position limits
    if (
      this.activePositions.size >=
      this.config.max_concurrent_positions
    ) {
      console.warn(
        "Max concurrent positions reached, skipping entry signal"
      );
      return;
    }

    const entryPrice = this.applySlippage(
      signal.entry_price || currentPrice,
      true
    );

    // Calculate position size based on risk
    const riskAmount = this.session.current_balance * 0.02;  // 2% risk
    const positionSize = riskAmount / Math.abs(entryPrice - (signal.stop_loss || entryPrice));

    // Create trade
    const trade: Trade = {
      id: uuid(),
      strategy_id: this.config.strategy_id,
      session_id: this.session.id,
      symbol: "BTCUSDT",  // Would come from signal
      timeframe: "1h",  // Would come from signal
      market_type: "spot",
      leverage: 1,
      direction: signal.direction || "long",
      entry_price: entryPrice,
      entry_time: new Date(),
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

    // Record signal
    this.signals.push({
      id: uuid(),
      session_id: this.session.id,
      timestamp: new Date(),
      symbol: "BTCUSDT",
      direction: signal.direction || "long",
      entry_price: entryPrice,
      stop_loss: signal.stop_loss || 0,
      take_profit: signal.take_profit || 0,
      quantity: positionSize,
      position_size_usd: positionSize * entryPrice,
      risk_amount: riskAmount,
      indicators: signal.conditions,
      timeframe: "1h",
      status: "executed",
      execution_price: entryPrice,
      execution_time: new Date(),
      trade_id: trade.id,
    });

    // Add position
    this.activePositions.set(trade.id, {
      trade,
      entry_time: trade.entry_time,
      highest_price: entryPrice,
      lowest_price: entryPrice,
    });
  }

  /**
   * Handle exit signal
   */
  private handleExitSignal(signal: StrategySignal, currentPrice: number): void {
    if (this.activePositions.size === 0) {
      return;  // No positions to exit
    }

    // Get first position (in real scenario, would match the correct position)
    const firstPosition = this.activePositions.values().next().value;
    if (!firstPosition) return;

    this.closePosition(
      firstPosition.trade.id,
      this.applySlippage(currentPrice, false),
      new Date(),
      signal.exit_reason || "strategy_signal"
    );
  }

  /**
   * Update position with new price
   */
  updatePositionPrice(tradeId: string, newPrice: number): void {
    const position = this.activePositions.get(tradeId);
    if (!position) return;

    if (newPrice > position.highest_price) {
      position.highest_price = newPrice;
    }
    if (newPrice < position.lowest_price) {
      position.lowest_price = newPrice;
    }

    // Check stop loss and take profit
    this.checkExitConditions(tradeId, newPrice);
  }

  /**
   * Check if position should be exited due to SL/TP
   */
  private checkExitConditions(tradeId: string, currentPrice: number): void {
    const position = this.activePositions.get(tradeId);
    if (!position) return;

    const trade = position.trade;
    let shouldExit = false;
    let exitReason = "";

    if (trade.direction === "long") {
      if (currentPrice <= trade.stop_loss) {
        shouldExit = true;
        exitReason = "stop_loss";
      } else if (currentPrice >= trade.take_profit) {
        shouldExit = true;
        exitReason = "take_profit";
      }
    } else {
      if (currentPrice >= trade.stop_loss) {
        shouldExit = true;
        exitReason = "stop_loss";
      } else if (currentPrice <= trade.take_profit) {
        shouldExit = true;
        exitReason = "take_profit";
      }
    }

    if (shouldExit) {
      this.closePosition(tradeId, currentPrice, new Date(), exitReason);
    }
  }

  /**
   * Close a position
   */
  private closePosition(
    tradeId: string,
    exitPrice: number,
    exitTime: Date,
    exitReason: string
  ): void {
    const position = this.activePositions.get(tradeId);
    if (!position) return;

    const trade = position.trade;
    const entryPrice = trade.entry_price;

    // Calculate P&L
    let pnlPercent: number;
    let mfe: number;
    let mae: number;

    if (trade.direction === "long") {
      pnlPercent = (exitPrice - entryPrice) / entryPrice;
      mfe = (position.highest_price - entryPrice) / entryPrice;
      mae = (position.lowest_price - entryPrice) / entryPrice;
    } else {
      pnlPercent = (entryPrice - exitPrice) / entryPrice;
      mfe = (entryPrice - position.lowest_price) / entryPrice;
      mae = (entryPrice - position.highest_price) / entryPrice;
    }

    // Apply commission
    const commission = Math.abs(pnlPercent * this.config.commission_percent);
    const netPnlPercent = pnlPercent - commission;

    // Update trade
    trade.exit_price = exitPrice;
    trade.exit_time = exitTime;
    trade.exit_reason = exitReason as any;
    trade.pnl_percent = netPnlPercent;
    trade.pnl_absolute = this.session.current_balance * netPnlPercent;
    trade.max_favorable_excursion = mfe;
    trade.max_adverse_excursion = mae;
    trade.duration_minutes = Math.floor(
      (exitTime.getTime() - trade.entry_time.getTime()) / 60000
    );

    // Update equity
    this.session.current_balance += trade.pnl_absolute;
    this.recordEquity(this.session.current_balance);

    // Record trade
    this.trades.push(trade);

    // Remove position
    this.activePositions.delete(tradeId);

    // Update session metrics
    this.updateSessionMetrics();
  }

  /**
   * Update session-level metrics
   */
  private updateSessionMetrics(): void {
    const winningTrades = this.trades.filter((t) => t.pnl_percent > 0);
    const losingTrades = this.trades.filter((t) => t.pnl_percent < 0);

    this.session.total_trades = this.trades.length;
    this.session.win_rate =
      this.trades.length > 0 ? winningTrades.length / this.trades.length : 0;
    this.session.loss_rate =
      this.trades.length > 0 ? losingTrades.length / this.trades.length : 0;

    this.session.total_pnl = this.session.current_balance - this.session.initial_balance;
    this.session.total_pnl_percent = this.session.total_pnl / this.session.initial_balance;

    // Calculate max drawdown
    this.session.max_drawdown = this.calculateMaxDrawdown();

    // Check validation criteria
    const daysSinceStart = Math.floor(
      (new Date().getTime() - this.session.start_date.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    this.session.meets_min_trades = this.session.total_trades >= 30;
    this.session.meets_min_duration = daysSinceStart >= 14;
    this.session.passes_stability_checks =
      this.session.meets_min_trades &&
      this.session.meets_min_duration &&
      this.session.total_pnl_percent > 0 &&
      this.session.max_drawdown < 0.2;

    this.session.updated_at = new Date();
  }

  /**
   * Calculate max drawdown from equity history
   */
  private calculateMaxDrawdown(): number {
    if (this.equityHistory.length < 2) return 0;

    let maxDrawdown = 0;
    let peak = this.equityHistory[0].equity;

    for (const point of this.equityHistory) {
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
   * Record equity point
   */
  private recordEquity(equity: number): void {
    this.equityHistory.push({
      timestamp: new Date(),
      equity,
    });
  }

  /**
   * Apply slippage to prices
   */
  private applySlippage(price: number, isEntry: boolean): number {
    const slippage = (price * this.config.slippage_percent) / 100;
    return isEntry ? price + slippage : price - slippage;
  }

  /**
   * Get current session state
   */
  getSessionState(): PaperTradingSession {
    return {
      ...this.session,
      trades: this.trades,
    };
  }

  /**
   * Get all trades
   */
  getTrades(): Trade[] {
    return this.trades;
  }

  /**
   * Get active positions
   */
  getActivePositions(): Array<{
    trade: Trade;
    unrealized_pnl_percent: number;
  }> {
    return Array.from(this.activePositions.values()).map((pos) => ({
      trade: pos.trade,
      unrealized_pnl_percent:
        pos.trade.direction === "long"
          ? (pos.highest_price - pos.trade.entry_price) / pos.trade.entry_price
          : (pos.trade.entry_price - pos.lowest_price) / pos.trade.entry_price,
    }));
  }

  /**
   * Stop trading session
   */
  stop(): void {
    // Close all open positions at market price
    const positions = Array.from(this.activePositions.keys());
    for (const posId of positions) {
      const pos = this.activePositions.get(posId);
      if (pos) {
        this.closePosition(
          posId,
          pos.trade.entry_price,
          new Date(),
          "timeout"
        );
      }
    }

    this.session.status = "completed";
    this.session.end_date = new Date();
  }
}
