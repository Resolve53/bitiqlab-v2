/**
 * Candle-by-candle backtest executor (Truth Engine Phase 1).
 *
 * Execution timing:
 * - Strategy entry/exit signals confirmed on close of candle N
 * - Orders fill at open of candle N+1 (plus slippage)
 * - After entry at open of N+1, that same bar's OHLC is checked for SL/TP
 * - Same-bar SL+TP: adverse event first; intrabar_conflict=true
 * - Gap through SL/TP: fill at worse executable open (+ slippage)
 *
 * Capital policy (deterministic):
 * - Risk-based quantity is capped so marginUsed + entryCommission <= equity
 * - Spot (leverage=1): notional + entryCommission <= equity
 * - Records requestedRiskUsd vs actualRiskUsd when capped
 */

import { buildIndicatorSeries } from "./indicators";
import { evaluateCondition } from "./rule-evaluator";
import { applySlippage, entrySide, exitSide } from "./slippage";
import type {
  BacktestTradeRecord,
  ConditionSnapshot,
  EvaluatedSignal,
  ExitReason,
  OHLCVBar,
  StrategyDefinition,
  TradeDirection,
} from "./types";

export interface ExecutorConfig {
  initialCapital: number;
  commissionPct: number;
  slippagePct: number;
  /** Override strategy leverage when provided */
  leverage?: number;
}

interface OpenPosition {
  direction: TradeDirection;
  entryPrice: number;
  entryTime: Date;
  entryBarIndex: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number | null;
  requestedRiskUsd: number;
  actualRiskUsd: number;
  capitalCapped: boolean;
  positionNotional: number;
  leverage: number;
  marginUsed: number;
  entryConditions: ConditionSnapshot;
  entryCommission: number;
  highestPrice: number;
  lowestPrice: number;
  pendingStrategyExit?: {
    signalBarIndex: number;
    conditions: ConditionSnapshot;
  };
}

export interface ExecutorResult {
  trades: BacktestTradeRecord[];
  signals: EvaluatedSignal[];
  equityTimeline: { timestamp: Date; equity: number }[];
  finalEquity: number;
  initialCapital: number;
}

export class TruthBacktestExecutor {
  private readonly initialCapital: number;
  private readonly commissionPct: number;
  private readonly slippagePct: number;
  private readonly leverageOverride?: number;

  constructor(config: ExecutorConfig) {
    if (!(config.initialCapital > 0)) {
      throw new Error("initialCapital must be > 0");
    }
    this.initialCapital = config.initialCapital;
    this.commissionPct = config.commissionPct;
    this.slippagePct = config.slippagePct;
    this.leverageOverride = config.leverage;
  }

  execute(bars: OHLCVBar[], strategy: StrategyDefinition): ExecutorResult {
    if (bars.length < 3) {
      throw new Error("Need at least 3 bars for backtest execution");
    }
    if (!strategy.entries?.length) {
      throw new Error("Strategy has no directional entry setups");
    }

    const leverage =
      this.leverageOverride && this.leverageOverride > 0
        ? this.leverageOverride
        : strategy.leverage > 0
          ? strategy.leverage
          : 1;

    if (strategy.marketType === "spot" && leverage !== 1) {
      throw new Error("Spot backtests require leverage=1");
    }

    const series = buildIndicatorSeries(bars);
    const signals: EvaluatedSignal[] = [];
    const trades: BacktestTradeRecord[] = [];
    const equityTimeline: { timestamp: Date; equity: number }[] = [
      { timestamp: bars[0].timestamp, equity: this.initialCapital },
    ];

    let equity = this.initialCapital;
    let position: OpenPosition | null = null;
    let pendingEntry: {
      signalBarIndex: number;
      direction: TradeDirection;
      conditions: ConditionSnapshot;
      passedRules: string[];
    } | null = null;

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];

      // 1) Fill pending entry at open of this bar
      if (pendingEntry && !position) {
        const opened = this.tryOpenPosition(
          bar,
          i,
          pendingEntry,
          strategy,
          equity,
          leverage
        );
        if (opened) {
          position = opened;
          signals.push({
            barIndex: pendingEntry.signalBarIndex,
            timestamp: bars[pendingEntry.signalBarIndex].timestamp,
            action: "entry",
            direction: pendingEntry.direction,
            conditions: pendingEntry.conditions,
            passedRules: pendingEntry.passedRules,
          });
        }
        pendingEntry = null;
      } else if (pendingEntry && position) {
        pendingEntry = null;
      }

      // 2) Manage open position on this candle (including entry bar N+1)
      if (position) {
        if (
          position.pendingStrategyExit &&
          i > position.pendingStrategyExit.signalBarIndex
        ) {
          const exitPx = applySlippage(
            bar.open,
            exitSide(position.direction),
            this.slippagePct
          );
          const trade = this.closePosition(
            position,
            exitPx,
            bar.timestamp,
            "strategy_exit",
            position.pendingStrategyExit.conditions,
            false,
            false,
            equity
          );
          trades.push(trade);
          equity += trade.netPnl;
          equityTimeline.push({ timestamp: bar.timestamp, equity });
          position = null;
        } else {
          this.updateExcursions(position, bar);

          const slTp = this.checkStopTakeProfit(position, bar);
          if (slTp) {
            const trade = this.closePosition(
              position,
              slTp.price,
              bar.timestamp,
              slTp.reason,
              { intrabar: true, gapFill: slTp.gapFill },
              slTp.intrabarConflict,
              slTp.gapFill,
              equity
            );
            trades.push(trade);
            equity += trade.netPnl;
            equityTimeline.push({ timestamp: bar.timestamp, equity });
            position = null;
          } else if (
            strategy.risk.maxHoldBars &&
            i - position.entryBarIndex >= strategy.risk.maxHoldBars
          ) {
            const exitPx = applySlippage(
              bar.close,
              exitSide(position.direction),
              this.slippagePct
            );
            const trade = this.closePosition(
              position,
              exitPx,
              bar.timestamp,
              "timeout",
              { maxHoldBars: strategy.risk.maxHoldBars },
              false,
              false,
              equity
            );
            trades.push(trade);
            equity += trade.netPnl;
            equityTimeline.push({ timestamp: bar.timestamp, equity });
            position = null;
          }
        }
      }

      // 3) Evaluate closed-candle rules
      if (i === 0) continue;

      if (position && !position.pendingStrategyExit && strategy.exitCondition) {
        const exitEval = evaluateCondition(
          strategy.exitCondition,
          series,
          i,
          series.close
        );
        if (exitEval.passed) {
          position.pendingStrategyExit = {
            signalBarIndex: i,
            conditions: exitEval.conditions,
          };
          signals.push({
            barIndex: i,
            timestamp: bar.timestamp,
            action: "exit",
            direction: position.direction,
            conditions: exitEval.conditions,
            passedRules: exitEval.passedRules,
          });
        }
      }

      if (!position && !pendingEntry) {
        // Evaluate each directional setup independently; first match wins (stable order)
        for (const setup of strategy.entries) {
          const entryEval = evaluateCondition(
            setup.condition,
            series,
            i,
            series.close
          );
          if (entryEval.passed) {
            pendingEntry = {
              signalBarIndex: i,
              direction: setup.direction,
              conditions: entryEval.conditions,
              passedRules: entryEval.passedRules,
            };
            break;
          }
        }
      }
    }

    if (position) {
      const last = bars[bars.length - 1];
      const exitPx = applySlippage(
        last.close,
        exitSide(position.direction),
        this.slippagePct
      );
      const trade = this.closePosition(
        position,
        exitPx,
        last.timestamp,
        "end_of_test",
        {},
        false,
        false,
        equity
      );
      trades.push(trade);
      equity += trade.netPnl;
      equityTimeline.push({ timestamp: last.timestamp, equity });
    }

    return {
      trades,
      signals,
      equityTimeline,
      finalEquity: equity,
      initialCapital: this.initialCapital,
    };
  }

  /**
   * Cap quantity so marginUsed + entryCommission <= availableEquity.
   * Spot: notional + fees <= equity (leverage must be 1).
   * Futures: notional/leverage + fees <= equity.
   */
  private sizePosition(params: {
    equity: number;
    entryPrice: number;
    stopLoss: number;
    riskPerTradePct: number;
    leverage: number;
  }): {
    quantity: number;
    requestedRiskUsd: number;
    actualRiskUsd: number;
    capitalCapped: boolean;
    positionNotional: number;
    marginUsed: number;
    entryCommission: number;
  } | null {
    const { equity, entryPrice, stopLoss, riskPerTradePct, leverage } = params;
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    if (!(riskPerUnit > 0)) {
      throw new Error("riskPerUnit must be > 0");
    }

    const requestedRiskUsd = equity * (riskPerTradePct / 100);
    let quantity = requestedRiskUsd / riskPerUnit;

    const feeRate = this.commissionPct / 100;
    // qty * entry * (1/leverage + feeRate) <= equity
    const costPerUnit = entryPrice * (1 / leverage + feeRate);
    if (!(costPerUnit > 0)) {
      return null;
    }
    const maxAffordableQty = equity / costPerUnit;
    let capitalCapped = false;
    if (quantity > maxAffordableQty) {
      quantity = maxAffordableQty;
      capitalCapped = true;
    }

    if (!(quantity > 0) || !Number.isFinite(quantity)) {
      return null;
    }

    const positionNotional = entryPrice * quantity;
    const marginUsed = positionNotional / leverage;
    const entryCommission = positionNotional * feeRate;

    if (marginUsed + entryCommission > equity + 1e-9) {
      // Numerical guard — shrink slightly
      const scale =
        equity / (marginUsed + entryCommission);
      quantity *= scale * 0.999999;
      capitalCapped = true;
    }

    const finalNotional = entryPrice * quantity;
    const finalMargin = finalNotional / leverage;
    const finalCommission = finalNotional * feeRate;
    const actualRiskUsd = quantity * riskPerUnit;

    if (finalMargin + finalCommission > equity + 1e-6) {
      return null;
    }

    return {
      quantity,
      requestedRiskUsd,
      actualRiskUsd,
      capitalCapped,
      positionNotional: finalNotional,
      marginUsed: finalMargin,
      entryCommission: finalCommission,
    };
  }

  private tryOpenPosition(
    bar: OHLCVBar,
    barIndex: number,
    pending: {
      direction: TradeDirection;
      conditions: ConditionSnapshot;
    },
    strategy: StrategyDefinition,
    equity: number,
    leverage: number
  ): OpenPosition | null {
    const stopPct = strategy.risk.stopLossPct;
    if (!stopPct || stopPct <= 0) {
      throw new Error("stopLossPct required for position sizing");
    }

    const fillEntry = applySlippage(
      bar.open,
      entrySide(pending.direction),
      this.slippagePct
    );

    let stopLoss: number;
    let takeProfit: number | null = null;
    if (pending.direction === "long") {
      stopLoss = fillEntry * (1 - stopPct / 100);
      if (strategy.risk.takeProfitPct) {
        takeProfit = fillEntry * (1 + strategy.risk.takeProfitPct / 100);
      }
    } else {
      stopLoss = fillEntry * (1 + stopPct / 100);
      if (strategy.risk.takeProfitPct) {
        takeProfit = fillEntry * (1 - strategy.risk.takeProfitPct / 100);
      }
    }

    const sized = this.sizePosition({
      equity,
      entryPrice: fillEntry,
      stopLoss,
      riskPerTradePct: strategy.risk.riskPerTradePct,
      leverage,
    });
    if (!sized) {
      return null; // cannot afford any size — skip entry deterministically
    }

    return {
      direction: pending.direction,
      entryPrice: fillEntry,
      entryTime: bar.timestamp,
      entryBarIndex: barIndex,
      quantity: sized.quantity,
      stopLoss,
      takeProfit,
      requestedRiskUsd: sized.requestedRiskUsd,
      actualRiskUsd: sized.actualRiskUsd,
      capitalCapped: sized.capitalCapped,
      positionNotional: sized.positionNotional,
      leverage,
      marginUsed: sized.marginUsed,
      entryConditions: pending.conditions,
      entryCommission: sized.entryCommission,
      highestPrice: bar.high,
      lowestPrice: bar.low,
    };
  }

  private updateExcursions(position: OpenPosition, bar: OHLCVBar): void {
    if (bar.high > position.highestPrice) position.highestPrice = bar.high;
    if (bar.low < position.lowestPrice) position.lowestPrice = bar.low;
  }

  /**
   * Gap-aware SL/TP.
   * LONG SL: if open < stop → fill at open (worse) + sell slippage
   * SHORT SL: if open > stop → fill at open (worse) + buy slippage
   * LONG TP: if open > TP → conservative fill at min(open, TP) path:
   *   open already above TP; pessimistic sell uses TP (cannot assume better open)
   *   Actually conservative for LONG exit = lower price → use TP if open > TP? 
   *   Wait: if market gaps above TP, a limit sell would fill at open (better).
   *   Conservative = assume TP fill (worse than open). Documented.
   * SHORT TP: if open < TP → conservative use TP (higher buy = worse than open)
   */
  private checkStopTakeProfit(
    position: OpenPosition,
    bar: OHLCVBar
  ): {
    price: number;
    reason: ExitReason;
    intrabarConflict: boolean;
    gapFill: boolean;
  } | null {
    const { direction, stopLoss, takeProfit } = position;
    const side = exitSide(direction);

    let hitSL = false;
    let hitTP = false;
    let slGapped = false;
    let tpGapped = false;

    if (direction === "long") {
      slGapped = bar.open < stopLoss;
      hitSL = slGapped || bar.low <= stopLoss;
      if (takeProfit != null) {
        tpGapped = bar.open > takeProfit;
        hitTP = tpGapped || bar.high >= takeProfit;
      }
    } else {
      slGapped = bar.open > stopLoss;
      hitSL = slGapped || bar.high >= stopLoss;
      if (takeProfit != null) {
        tpGapped = bar.open < takeProfit;
        hitTP = tpGapped || bar.low <= takeProfit;
      }
    }

    const slPrice = (): number => {
      if (slGapped) {
        return applySlippage(bar.open, side, this.slippagePct);
      }
      return applySlippage(stopLoss, side, this.slippagePct);
    };

    const tpPrice = (): number => {
      if (takeProfit == null) return bar.close;
      if (tpGapped) {
        // Conservative: do not credit the favorable gap; fill at target + slippage
        return applySlippage(takeProfit, side, this.slippagePct);
      }
      return applySlippage(takeProfit, side, this.slippagePct);
    };

    if (hitSL && hitTP) {
      return {
        price: slPrice(),
        reason: "stop_loss",
        intrabarConflict: true,
        gapFill: slGapped,
      };
    }
    if (hitSL) {
      return {
        price: slPrice(),
        reason: "stop_loss",
        intrabarConflict: false,
        gapFill: slGapped,
      };
    }
    if (hitTP) {
      return {
        price: tpPrice(),
        reason: "take_profit",
        intrabarConflict: false,
        gapFill: tpGapped,
      };
    }
    return null;
  }

  private closePosition(
    position: OpenPosition,
    exitPrice: number,
    exitTime: Date,
    exitReason: ExitReason,
    exitConditions: ConditionSnapshot,
    intrabarConflict: boolean,
    gapFill: boolean,
    equityBefore: number
  ): BacktestTradeRecord {
    const { direction, entryPrice, quantity } = position;
    const grossPnl =
      direction === "long"
        ? (exitPrice - entryPrice) * quantity
        : (entryPrice - exitPrice) * quantity;

    const exitCommission =
      exitPrice * quantity * (this.commissionPct / 100);
    const fees = position.entryCommission + exitCommission;
    const netPnl = grossPnl - fees;

    const positionNotional = position.positionNotional;
    const pnlPctOnPosition =
      positionNotional > 0 ? netPnl / positionNotional : 0;
    const pnlPctOnEquity = equityBefore > 0 ? netPnl / equityBefore : 0;

    const actualRiskUsd = position.actualRiskUsd;
    const realizedR = actualRiskUsd > 0 ? netPnl / actualRiskUsd : 0;

    let mfe: number;
    let mae: number;
    if (direction === "long") {
      mfe = (position.highestPrice - entryPrice) * quantity;
      mae = (position.lowestPrice - entryPrice) * quantity;
    } else {
      mfe = (entryPrice - position.lowestPrice) * quantity;
      mae = (entryPrice - position.highestPrice) * quantity;
    }

    return {
      entryTime: position.entryTime.toISOString(),
      exitTime: exitTime.toISOString(),
      direction,
      entryPrice,
      exitPrice,
      quantity,
      positionNotional,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      grossPnl,
      fees,
      netPnl,
      pnlPctOnPosition,
      pnlPctOnEquity,
      requestedRiskUsd: position.requestedRiskUsd,
      actualRiskUsd,
      initialRiskUsd: actualRiskUsd,
      capitalCapped: position.capitalCapped,
      realizedR,
      mfe,
      mae,
      exitReason,
      entryConditions: position.entryConditions,
      exitConditions,
      leverage: position.leverage,
      marginUsed: position.marginUsed,
      intrabarConflict,
      gapFill,
    };
  }
}
