/**
 * Deterministic PAPER fill engine.
 *
 * Timing and math match Truth Engine (see truth-engine/ASSUMPTIONS.md):
 * - Signals on close of N fill at open of N+1 (+ slippage)
 * - Same-bar SL+TP → adverse (SL) first; intrabarConflict=true
 * - Gap through SL/TP → conservative fill (do not credit favorable open)
 *
 * This module never imports BinanceTradingClient or any order API.
 */

import { buildIndicatorSeries } from "@/truth-engine/indicators";
import { evaluateCondition } from "@/truth-engine/rule-evaluator";
import { applySlippage, entrySide, exitSide } from "@/truth-engine/slippage";
import type {
  ExitReason,
  OHLCVBar,
  StrategyDefinition,
  TradeDirection,
} from "@/truth-engine/types";
import type {
  PaperEventType,
  PaperExecutionState,
  PaperOpenPositionState,
  PaperPendingEntry,
} from "./types";

export interface PaperFillEvent {
  eventType: PaperEventType;
  candleTimestamp: string;
  signal?: unknown;
  fillPrice?: number;
  fee?: number;
  slippage?: number;
  quantity?: number;
  realizedPnl?: number;
  reason?: string;
  direction?: TradeDirection;
  idempotencySuffix?: string;
}

export interface PaperClosedTrade {
  direction: TradeDirection;
  entryCandleTs: string;
  exitCandleTs: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fee: number;
  slippageEntry: number;
  slippageExit: number;
  realizedPnl: number;
  reason: ExitReason;
  signal?: unknown;
  intrabarConflict: boolean;
  gapFill: boolean;
}

export interface PaperEngineResult {
  state: PaperExecutionState;
  events: PaperFillEvent[];
  closedTrades: PaperClosedTrade[];
  openedTrades: Array<{
    direction: TradeDirection;
    entryCandleTs: string;
    entryPrice: number;
    quantity: number;
    fee: number;
    slippageEntry: number;
    stopLoss: number;
    takeProfit: number | null;
    leverage: number;
    signal?: unknown;
  }>;
  lastProcessedCandleTs: string | null;
  unrealizedPnl: number;
  markPrice: number | null;
  equityTimeline: number[];
}

function emptyState(
  equity: number,
  commissionPct: number,
  slippagePct: number
): PaperExecutionState {
  return {
    pendingEntry: null,
    position: null,
    equity,
    peakEquity: equity,
    maxDrawdown: 0,
    feesPaid: 0,
    realizedPnl: 0,
    wins: 0,
    losses: 0,
    totalTrades: 0,
    commissionPct,
    slippagePct,
  };
}

function cloneState(state: PaperExecutionState): PaperExecutionState {
  return JSON.parse(JSON.stringify(state)) as PaperExecutionState;
}

function markToMarket(
  position: PaperOpenPositionState,
  markPrice: number
): number {
  if (position.direction === "long") {
    return (markPrice - position.entryPrice) * position.quantity;
  }
  return (position.entryPrice - markPrice) * position.quantity;
}

/**
 * Cap quantity so marginUsed + entryCommission <= availableEquity.
 * Copied from TruthBacktestExecutor.sizePosition — do not "improve" fills.
 */
function sizePosition(params: {
  equity: number;
  entryPrice: number;
  stopLoss: number;
  riskPerTradePct: number;
  leverage: number;
  commissionPct: number;
}): {
  quantity: number;
  requestedRiskUsd: number;
  actualRiskUsd: number;
  capitalCapped: boolean;
  positionNotional: number;
  marginUsed: number;
  entryCommission: number;
} | null {
  const { equity, entryPrice, stopLoss, riskPerTradePct, leverage, commissionPct } =
    params;
  const riskPerUnit = Math.abs(entryPrice - stopLoss);
  if (!(riskPerUnit > 0)) {
    throw new Error("riskPerUnit must be > 0");
  }

  const requestedRiskUsd = equity * (riskPerTradePct / 100);
  let quantity = requestedRiskUsd / riskPerUnit;

  const feeRate = commissionPct / 100;
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
    const scale = equity / (marginUsed + entryCommission);
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

function tryOpenPosition(params: {
  bar: OHLCVBar;
  pending: PaperPendingEntry;
  strategy: StrategyDefinition;
  equity: number;
  leverage: number;
  commissionPct: number;
  slippagePct: number;
}): PaperOpenPositionState | null {
  const { bar, pending, strategy, equity, leverage, commissionPct, slippagePct } =
    params;
  const stopPct = strategy.risk.stopLossPct;
  if (!stopPct || stopPct <= 0) {
    throw new Error("stopLossPct required for position sizing");
  }

  const fillEntry = applySlippage(
    bar.open,
    entrySide(pending.direction),
    slippagePct
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

  const sized = sizePosition({
    equity,
    entryPrice: fillEntry,
    stopLoss,
    riskPerTradePct: strategy.risk.riskPerTradePct,
    leverage,
    commissionPct,
  });
  if (!sized) return null;

  return {
    direction: pending.direction,
    entryPrice: fillEntry,
    entryTime: bar.timestamp.toISOString(),
    entryCandleTs: bar.timestamp.toISOString(),
    barsHeld: 0,
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
    pendingStrategyExit: null,
  };
}

/**
 * Gap-aware SL/TP. Same-candle SL+TP → stop first (conservative).
 */
function checkStopTakeProfit(
  position: PaperOpenPositionState,
  bar: OHLCVBar,
  slippagePct: number
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
      return applySlippage(bar.open, side, slippagePct);
    }
    return applySlippage(stopLoss, side, slippagePct);
  };

  const tpPrice = (): number => {
    if (takeProfit == null) return bar.close;
    return applySlippage(takeProfit, side, slippagePct);
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

function closePosition(params: {
  position: PaperOpenPositionState;
  exitPrice: number;
  exitTime: Date;
  exitReason: ExitReason;
  commissionPct: number;
  equityBefore: number;
}): {
  netPnl: number;
  fees: number;
  grossPnl: number;
  exitCommission: number;
} {
  const { position, exitPrice, exitReason, commissionPct } = params;
  void exitReason;
  const { direction, entryPrice, quantity } = position;
  const grossPnl =
    direction === "long"
      ? (exitPrice - entryPrice) * quantity
      : (entryPrice - exitPrice) * quantity;
  const exitCommission = exitPrice * quantity * (commissionPct / 100);
  const fees = position.entryCommission + exitCommission;
  const netPnl = grossPnl - fees;
  return { netPnl, fees, grossPnl, exitCommission };
}

function updateDrawdown(state: PaperExecutionState, markedEquity: number): void {
  if (markedEquity > state.peakEquity) state.peakEquity = markedEquity;
  if (state.peakEquity > 0) {
    const dd = (state.peakEquity - markedEquity) / state.peakEquity;
    if (dd > state.maxDrawdown) state.maxDrawdown = dd;
  }
}

export function initialPaperState(params: {
  initialCapital: number;
  commissionPct: number;
  slippagePct: number;
}): PaperExecutionState {
  return emptyState(params.initialCapital, params.commissionPct, params.slippagePct);
}

/**
 * Process a chronological window of CLOSED bars.
 * `executeFromIndex` is the first bar that may generate fills/signals.
 * Bars before that are warmup for indicators only (no paper trades).
 */
export function processClosedBars(params: {
  bars: OHLCVBar[];
  executeFromIndex: number;
  strategy: StrategyDefinition;
  state: PaperExecutionState;
}): PaperEngineResult {
  const { bars, strategy } = params;
  const state = cloneState(params.state);
  const events: PaperFillEvent[] = [];
  const closedTrades: PaperEngineResult["closedTrades"] = [];
  const openedTrades: PaperEngineResult["openedTrades"] = [];
  const equityTimeline: number[] = [state.equity];

  if (bars.length === 0) {
    return {
      state,
      events,
      closedTrades,
      openedTrades,
      lastProcessedCandleTs: null,
      unrealizedPnl: 0,
      markPrice: null,
      equityTimeline,
    };
  }

  const executeFromIndex = Math.max(0, params.executeFromIndex);
  const leverage =
    strategy.leverage > 0 ? strategy.leverage : 1;
  if (strategy.marketType === "spot" && leverage !== 1) {
    throw new Error("Spot paper sessions require leverage=1");
  }

  const series = buildIndicatorSeries(bars);
  const commissionPct = state.commissionPct;
  const slippagePct = state.slippagePct;

  let lastProcessed: string | null = null;

  for (let i = executeFromIndex; i < bars.length; i++) {
    const bar = bars[i];
    const candleTs = bar.timestamp.toISOString();

    // 1) Fill pending entry at open of this bar
    if (state.pendingEntry && !state.position) {
      const opened = tryOpenPosition({
        bar,
        pending: state.pendingEntry,
        strategy,
        equity: state.equity,
        leverage,
        commissionPct,
        slippagePct,
      });
      if (opened) {
        state.position = opened;
        const rawOpen = bar.open;
        const slipAmt = Math.abs(opened.entryPrice - rawOpen);
        events.push({
          eventType: "fill_entry",
          candleTimestamp: candleTs,
          fillPrice: opened.entryPrice,
          fee: opened.entryCommission,
          slippage: slipAmt,
          quantity: opened.quantity,
          reason: "entry",
          direction: opened.direction,
          signal: {
            action: "entry",
            direction: opened.direction,
            conditions: state.pendingEntry.conditions,
            passedRules: state.pendingEntry.passedRules,
            signalCandleTs: state.pendingEntry.signalCandleTs,
          },
        });
        openedTrades.push({
          direction: opened.direction,
          entryCandleTs: opened.entryCandleTs,
          entryPrice: opened.entryPrice,
          quantity: opened.quantity,
          fee: opened.entryCommission,
          slippageEntry: slipAmt,
          stopLoss: opened.stopLoss,
          takeProfit: opened.takeProfit,
          leverage: opened.leverage,
          signal: {
            conditions: state.pendingEntry.conditions,
            passedRules: state.pendingEntry.passedRules,
          },
        });
        state.feesPaid += opened.entryCommission;
      }
      state.pendingEntry = null;
    } else if (state.pendingEntry && state.position) {
      state.pendingEntry = null;
    }

    // 2) Manage open position on this candle (including entry bar)
    if (state.position) {
      const pos = state.position;
      const pendingExit = pos.pendingStrategyExit;
      const pendingExitDue =
        pendingExit &&
        new Date(pendingExit.signalCandleTs).getTime() < bar.timestamp.getTime();

      if (pendingExitDue && pendingExit) {
        const exitPx = applySlippage(
          bar.open,
          exitSide(pos.direction),
          slippagePct
        );
        const closed = closePosition({
          position: pos,
          exitPrice: exitPx,
          exitTime: bar.timestamp,
          exitReason: "strategy_exit",
          commissionPct,
          equityBefore: state.equity,
        });
        const slipAmt = Math.abs(exitPx - bar.open);
        events.push({
          eventType: "fill_exit",
          candleTimestamp: candleTs,
          fillPrice: exitPx,
          fee: closed.exitCommission,
          slippage: slipAmt,
          quantity: pos.quantity,
          realizedPnl: closed.netPnl,
          reason: "strategy_exit",
          direction: pos.direction,
          signal: pendingExit.conditions,
        });
        closedTrades.push({
          direction: pos.direction,
          entryCandleTs: pos.entryCandleTs,
          exitCandleTs: candleTs,
          entryPrice: pos.entryPrice,
          exitPrice: exitPx,
          quantity: pos.quantity,
          fee: closed.fees,
          slippageEntry: 0,
          slippageExit: slipAmt,
          realizedPnl: closed.netPnl,
          reason: "strategy_exit",
          signal: pendingExit.conditions,
          intrabarConflict: false,
          gapFill: false,
        });
        state.equity += closed.netPnl;
        state.realizedPnl += closed.netPnl;
        state.feesPaid += closed.exitCommission;
        state.totalTrades += 1;
        if (closed.netPnl > 0) state.wins += 1;
        else if (closed.netPnl < 0) state.losses += 1;
        state.position = null;
        equityTimeline.push(state.equity);
      } else {
        if (bar.high > pos.highestPrice) pos.highestPrice = bar.high;
        if (bar.low < pos.lowestPrice) pos.lowestPrice = bar.low;
        // barsHeld ≡ i - entryBarIndex (0 on the entry bar), matching Truth Engine.
        if (pos.entryCandleTs !== candleTs) {
          pos.barsHeld += 1;
        }

        const slTp = checkStopTakeProfit(pos, bar, slippagePct);
        if (slTp) {
          const closed = closePosition({
            position: pos,
            exitPrice: slTp.price,
            exitTime: bar.timestamp,
            exitReason: slTp.reason,
            commissionPct,
            equityBefore: state.equity,
          });
          const intended =
            slTp.reason === "stop_loss" ? pos.stopLoss : pos.takeProfit ?? slTp.price;
          events.push({
            eventType: "fill_exit",
            candleTimestamp: candleTs,
            fillPrice: slTp.price,
            fee: closed.exitCommission,
            slippage: Math.abs(slTp.price - intended),
            quantity: pos.quantity,
            realizedPnl: closed.netPnl,
            reason: slTp.intrabarConflict
              ? `${slTp.reason}+intrabar_conflict`
              : slTp.reason,
            direction: pos.direction,
            signal: {
              intrabarConflict: slTp.intrabarConflict,
              gapFill: slTp.gapFill,
            },
          });
          closedTrades.push({
            direction: pos.direction,
            entryCandleTs: pos.entryCandleTs,
            exitCandleTs: candleTs,
            entryPrice: pos.entryPrice,
            exitPrice: slTp.price,
            quantity: pos.quantity,
            fee: closed.fees,
            slippageEntry: 0,
            slippageExit: Math.abs(slTp.price - intended),
            realizedPnl: closed.netPnl,
            reason: slTp.reason,
            signal: {
              intrabarConflict: slTp.intrabarConflict,
              gapFill: slTp.gapFill,
            },
            intrabarConflict: slTp.intrabarConflict,
            gapFill: slTp.gapFill,
          });
          state.equity += closed.netPnl;
          state.realizedPnl += closed.netPnl;
          state.feesPaid += closed.exitCommission;
          state.totalTrades += 1;
          if (closed.netPnl > 0) state.wins += 1;
          else if (closed.netPnl < 0) state.losses += 1;
          state.position = null;
          equityTimeline.push(state.equity);
        } else if (
          strategy.risk.maxHoldBars &&
          pos.barsHeld >= strategy.risk.maxHoldBars
        ) {
          const exitPx = applySlippage(
            bar.close,
            exitSide(pos.direction),
            slippagePct
          );
          const closed = closePosition({
            position: pos,
            exitPrice: exitPx,
            exitTime: bar.timestamp,
            exitReason: "timeout",
            commissionPct,
            equityBefore: state.equity,
          });
          events.push({
            eventType: "fill_exit",
            candleTimestamp: candleTs,
            fillPrice: exitPx,
            fee: closed.exitCommission,
            slippage: Math.abs(exitPx - bar.close),
            quantity: pos.quantity,
            realizedPnl: closed.netPnl,
            reason: "timeout",
            direction: pos.direction,
          });
          closedTrades.push({
            direction: pos.direction,
            entryCandleTs: pos.entryCandleTs,
            exitCandleTs: candleTs,
            entryPrice: pos.entryPrice,
            exitPrice: exitPx,
            quantity: pos.quantity,
            fee: closed.fees,
            slippageEntry: 0,
            slippageExit: Math.abs(exitPx - bar.close),
            realizedPnl: closed.netPnl,
            reason: "timeout",
            intrabarConflict: false,
            gapFill: false,
          });
          state.equity += closed.netPnl;
          state.realizedPnl += closed.netPnl;
          state.feesPaid += closed.exitCommission;
          state.totalTrades += 1;
          if (closed.netPnl > 0) state.wins += 1;
          else if (closed.netPnl < 0) state.losses += 1;
          state.position = null;
          equityTimeline.push(state.equity);
        }
      }
    }

    // 3) Evaluate closed-candle rules (never on bar 0 — matches Truth Engine)
    if (i > 0) {
      if (
        state.position &&
        !state.position.pendingStrategyExit &&
        strategy.exitCondition
      ) {
        const exitEval = evaluateCondition(
          strategy.exitCondition,
          series,
          i,
          series.close
        );
        if (exitEval.passed) {
          state.position.pendingStrategyExit = {
            signalCandleTs: candleTs,
            conditions: exitEval.conditions,
          };
          events.push({
            eventType: "signal_exit",
            candleTimestamp: candleTs,
            reason: "strategy_exit_signal",
            direction: state.position.direction,
            signal: {
              action: "exit",
              conditions: exitEval.conditions,
              passedRules: exitEval.passedRules,
            },
          });
        }
      }

      if (!state.position && !state.pendingEntry) {
        for (const setup of strategy.entries) {
          const entryEval = evaluateCondition(
            setup.condition,
            series,
            i,
            series.close
          );
          if (entryEval.passed) {
            state.pendingEntry = {
              signalCandleTs: candleTs,
              direction: setup.direction,
              conditions: entryEval.conditions,
              passedRules: entryEval.passedRules,
            };
            events.push({
              eventType: "signal_entry",
              candleTimestamp: candleTs,
              reason: "entry_signal",
              direction: setup.direction,
              signal: {
                action: "entry",
                direction: setup.direction,
                conditions: entryEval.conditions,
                passedRules: entryEval.passedRules,
              },
            });
            break;
          }
        }
      }
    }

    const unrealized = state.position
      ? markToMarket(state.position, bar.close)
      : 0;
    updateDrawdown(state, state.equity + unrealized);
    events.push({
      eventType: "candle_processed",
      candleTimestamp: candleTs,
      reason: "closed_candle",
    });
    lastProcessed = candleTs;
  }

  const lastBar = bars[bars.length - 1];
  const unrealizedPnl = state.position
    ? markToMarket(state.position, lastBar.close)
    : 0;

  return {
    state,
    events,
    closedTrades,
    openedTrades,
    lastProcessedCandleTs: lastProcessed,
    unrealizedPnl,
    markPrice: lastBar.close,
    equityTimeline,
  };
}

export function computeUnrealized(
  position: PaperOpenPositionState | null,
  markPrice: number | null
): number {
  if (!position || markPrice == null) return 0;
  return markToMarket(position, markPrice);
}

export { sizePosition, checkStopTakeProfit };
