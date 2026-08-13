/**
 * Candle-by-candle backtest executor (Truth Engine Phase 1).
 *
 * Execution timing:
 * - Strategy entry/exit signals confirmed on close of candle N
 * - Orders fill at open of candle N+1 (plus slippage)
 * - SL/TP checked intrabar on every bar while in a position
 * - Same-bar SL+TP: adverse event first; intrabar_conflict=true
 */

import { buildIndicatorSeries } from "./indicators";
import { evaluateRules } from "./rule-evaluator";
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
  initialRiskUsd: number;
  positionNotional: number;
  leverage: number;
  marginUsed: number;
  entryConditions: ConditionSnapshot;
  entryCommission: number;
  highestPrice: number;
  lowestPrice: number;
  pendingStrategyExit?: { signalBarIndex: number; conditions: ConditionSnapshot };
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
  private readonly leverage: number;

  constructor(config: ExecutorConfig) {
    if (!(config.initialCapital > 0)) {
      throw new Error("initialCapital must be > 0");
    }
    this.initialCapital = config.initialCapital;
    this.commissionPct = config.commissionPct;
    this.slippagePct = config.slippagePct;
    this.leverage = config.leverage && config.leverage > 0 ? config.leverage : 1;
  }

  execute(bars: OHLCVBar[], strategy: StrategyDefinition): ExecutorResult {
    if (bars.length < 3) {
      throw new Error("Need at least 3 bars for backtest execution");
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
        position = this.openPosition(bar, i, pendingEntry, strategy, equity);
        signals.push({
          barIndex: pendingEntry.signalBarIndex,
          timestamp: bars[pendingEntry.signalBarIndex].timestamp,
          action: "entry",
          direction: pendingEntry.direction,
          conditions: pendingEntry.conditions,
          passedRules: pendingEntry.passedRules,
        });
        pendingEntry = null;
      } else if (pendingEntry && position) {
        pendingEntry = null; // already in position
      }

      // 2) Manage open position on this candle
      if (position) {
        // Fill pending strategy exit at open
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
              { intrabar: true },
              slTp.intrabarConflict,
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
              equity
            );
            trades.push(trade);
            equity += trade.netPnl;
            equityTimeline.push({ timestamp: bar.timestamp, equity });
            position = null;
          }
        }
      }

      // 3) Evaluate closed-candle rules (no future peek)
      if (i === 0) continue;

      if (position && !position.pendingStrategyExit && strategy.exitRules.length) {
        const exitEval = evaluateRules(
          strategy.exitRules,
          series,
          i,
          series.close,
          "and"
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
        const entryEval = evaluateRules(
          strategy.entryRules,
          series,
          i,
          series.close,
          "and"
        );
        if (entryEval.passed) {
          const direction = pickDirection(strategy, entryEval.conditions);
          if (direction && strategy.allowedDirections.includes(direction)) {
            pendingEntry = {
              signalBarIndex: i,
              direction,
              conditions: entryEval.conditions,
              passedRules: entryEval.passedRules,
            };
          }
        }
      }
    }

    // End of test — close remaining
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
        equity
      );
      trades.push(trade);
      equity += trade.netPnl;
      equityTimeline.push({ timestamp: last.timestamp, equity });
      position = null;
    }

    return {
      trades,
      signals,
      equityTimeline,
      finalEquity: equity,
      initialCapital: this.initialCapital,
    };
  }

  private openPosition(
    bar: OHLCVBar,
    barIndex: number,
    pending: {
      direction: TradeDirection;
      conditions: ConditionSnapshot;
    },
    strategy: StrategyDefinition,
    equity: number
  ): OpenPosition {
    const stopPct = strategy.risk.stopLossPct;
    if (!stopPct || stopPct <= 0) {
      throw new Error("stopLossPct required for position sizing");
    }

    const rawEntry = bar.open;
    const fillEntry = applySlippage(
      rawEntry,
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

    const riskPerUnit = Math.abs(fillEntry - stopLoss);
    if (!(riskPerUnit > 0)) {
      throw new Error("riskPerUnit must be > 0");
    }

    const riskAmount = equity * (strategy.risk.riskPerTradePct / 100);
    const quantity = riskAmount / riskPerUnit;
    const positionNotional = fillEntry * quantity;
    const marginUsed = positionNotional / this.leverage;
    const entryCommission =
      fillEntry * quantity * (this.commissionPct / 100);

    return {
      direction: pending.direction,
      entryPrice: fillEntry,
      entryTime: bar.timestamp,
      entryBarIndex: barIndex,
      quantity,
      stopLoss,
      takeProfit,
      initialRiskUsd: riskAmount,
      positionNotional,
      leverage: this.leverage,
      marginUsed,
      entryConditions: pending.conditions,
      entryCommission,
      highestPrice: bar.high,
      lowestPrice: bar.low,
    };
  }

  private updateExcursions(position: OpenPosition, bar: OHLCVBar): void {
    if (bar.high > position.highestPrice) position.highestPrice = bar.high;
    if (bar.low < position.lowestPrice) position.lowestPrice = bar.low;
  }

  private checkStopTakeProfit(
    position: OpenPosition,
    bar: OHLCVBar
  ): {
    price: number;
    reason: ExitReason;
    intrabarConflict: boolean;
  } | null {
    const { direction, stopLoss, takeProfit } = position;
    let hitSL = false;
    let hitTP = false;

    if (direction === "long") {
      hitSL = bar.low <= stopLoss;
      hitTP = takeProfit != null && bar.high >= takeProfit;
    } else {
      hitSL = bar.high >= stopLoss;
      hitTP = takeProfit != null && bar.low <= takeProfit;
    }

    if (hitSL && hitTP) {
      // Conservative: adverse first
      const adversePrice = applySlippage(
        stopLoss,
        exitSide(direction),
        this.slippagePct
      );
      return {
        price: adversePrice,
        reason: "stop_loss",
        intrabarConflict: true,
      };
    }
    if (hitSL) {
      return {
        price: applySlippage(stopLoss, exitSide(direction), this.slippagePct),
        reason: "stop_loss",
        intrabarConflict: false,
      };
    }
    if (hitTP && takeProfit != null) {
      return {
        price: applySlippage(takeProfit, exitSide(direction), this.slippagePct),
        reason: "take_profit",
        intrabarConflict: false,
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
    const pnlPctOnEquity =
      equityBefore > 0 ? netPnl / equityBefore : 0;

    const riskPerUnit = Math.abs(entryPrice - position.stopLoss);
    const initialRiskUsd = position.initialRiskUsd;
    const realizedR =
      initialRiskUsd > 0 ? netPnl / initialRiskUsd : 0;

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
      initialRiskUsd,
      realizedR,
      mfe,
      mae,
      exitReason,
      entryConditions: position.entryConditions,
      exitConditions,
      leverage: position.leverage,
      marginUsed: position.marginUsed,
      intrabarConflict,
    };
  }
}

function pickDirection(
  strategy: StrategyDefinition,
  conditions: ConditionSnapshot
): TradeDirection | null {
  if (strategy.allowedDirections.length === 1) {
    return strategy.allowedDirections[0];
  }
  for (const [k, v] of Object.entries(conditions)) {
    if (k.includes("rsi") && k.includes("::left") && typeof v === "number") {
      if (v <= 40 && strategy.allowedDirections.includes("long")) return "long";
      if (v >= 60 && strategy.allowedDirections.includes("short"))
        return "short";
    }
  }
  return strategy.allowedDirections[0] ?? null;
}
