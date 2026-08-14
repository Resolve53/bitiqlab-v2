/**
 * Phase 4B tick — process new CLOSED candles for a RUNNING paper session.
 * Deterministic worker function. Not an infinite loop. Simulated fills only.
 *
 * This file must never import the exchange trading client or place exchange orders.
 */

import {
  PAPER_FORWARD_EXEC_ENGINE_VERSION,
  PAPER_SIMULATED_NOTICE,
  assertPaperForwardEnabled,
  getTradingSafetyState,
} from "@/lib/trading-safety";
import {
  fetchHistoricalOHLCV,
  type FetchMarketDataResult,
} from "@/truth-engine/market-data";
import type { OHLCVBar } from "@/truth-engine/types";
import { PaperLifecycleError, isTerminalLifecycle } from "./lifecycle";
import { Phase4PersistenceError } from "./persistence-errors";
import {
  failPaperSession,
  getPaperSession,
  type PaperForwardPersistence,
} from "./session-service";
import { PaperSnapshotError, verifyImmutableSnapshot } from "./snapshot";
import {
  PAPER_MAX_BARS_PER_TICK,
  PaperCandleError,
  assertChronologicalClosedBars,
  lookbackStart,
  splitWarmupAndExecute,
} from "./closed-candles";
import {
  initialPaperState,
  processClosedBars,
} from "./sim-executor";
import { buildPaperMetrics } from "./paper-metrics";
import type { PaperForwardSession, PaperSessionMetrics } from "./types";
import type {
  PaperExecutionPersistence,
  PaperEventInsert,
} from "./execution-persistence";

export class PaperTickError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PaperTickError";
    this.statusCode = statusCode;
  }
}

export interface MarketDataPort {
  fetch: (params: {
    symbol: string;
    timeframe: string;
    start: Date;
    end: Date;
  }) => Promise<FetchMarketDataResult>;
}

export const defaultMarketDataPort: MarketDataPort = {
  fetch: async (params) =>
    fetchHistoricalOHLCV({
      ...params,
      allowAnyUsdtSymbol: true,
    }),
};

export interface TickInput {
  sessionId: string;
  actor?: string;
  /** Injected closed bars (tests). When set, live Binance fetch is skipped. */
  bars?: OHLCVBar[];
  now?: Date;
  maxBars?: number;
}

export interface TickResult {
  session: PaperForwardSession;
  metrics: PaperSessionMetrics;
  candlesProcessed: number;
  lastProcessedCandleTs: string | null;
  eventsCreated: number;
  tradesOpened: number;
  tradesClosed: number;
  skippedDuplicate: boolean;
  notice: string;
  safety: ReturnType<typeof getTradingSafetyState>;
}

function eventKey(
  sessionId: string,
  eventType: string,
  candleTs: string
): string {
  return `${sessionId}:${eventType}:${candleTs}`;
}

export async function tickPaperSession(
  sessionDb: PaperForwardPersistence,
  execDb: PaperExecutionPersistence,
  input: TickInput,
  market: MarketDataPort = defaultMarketDataPort
): Promise<TickResult> {
  assertPaperForwardEnabled();

  const actor = input.actor || "explicit_api_caller";
  const now = input.now ?? new Date();
  const maxBars = Math.min(
    input.maxBars ?? PAPER_MAX_BARS_PER_TICK,
    PAPER_MAX_BARS_PER_TICK
  );

  let session = await getPaperSession(sessionDb, input.sessionId);

  if (session.lifecycle_status !== "RUNNING") {
    const status = session.lifecycle_status;
    if (status === "CREATED") {
      throw new PaperTickError(
        "Refusing paper execution: session is CREATED (start it first)"
      );
    }
    if (status === "PAUSED") {
      throw new PaperTickError(
        "Refusing paper execution: session is PAUSED"
      );
    }
    if (isTerminalLifecycle(status)) {
      throw new PaperTickError(
        `Refusing paper execution: session is terminal (${status})`
      );
    }
    throw new PaperTickError(
      `Refusing paper execution: invalid lifecycle ${status}`
    );
  }

  if (!session.strategy_version_id || !session.snapshot_hash) {
    await failClosed(sessionDb, session.id, "missing provenance", actor);
    throw new PaperSnapshotError("Session missing provenance");
  }

  let verified;
  try {
    verified = verifyImmutableSnapshot(session);
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "corrupt snapshot";
    await failClosed(sessionDb, session.id, reason, actor);
    throw err instanceof PaperSnapshotError
      ? err
      : new PaperSnapshotError(reason);
  }

  const { strategy, commissionPct, slippagePct } = verified;

  let allBars: OHLCVBar[];
  if (input.bars) {
    allBars = assertChronologicalClosedBars(
      input.bars,
      session.timeframe,
      now
    );
  } else {
    const cursorMs = session.last_processed_candle_ts
      ? new Date(session.last_processed_candle_ts).getTime()
      : session.started_at
        ? new Date(session.started_at).getTime()
        : now.getTime();
    const from = lookbackStart(session.timeframe, new Date(cursorMs));
    let fetched: FetchMarketDataResult;
    try {
      fetched = await market.fetch({
        symbol: session.symbol,
        timeframe: session.timeframe,
        start: from,
        end: now,
      });
    } catch (err) {
      throw new PaperTickError(
        `Failed to fetch closed OHLCV (no fabricated candles): ${
          err instanceof Error ? err.message : String(err)
        }`,
        502
      );
    }
    allBars = assertChronologicalClosedBars(
      fetched.bars,
      session.timeframe,
      now
    );
  }

  const executeFromTs = session.started_at || session.start_time || null;
  const { executeFromIndex, execute } = splitWarmupAndExecute({
    bars: allBars,
    executeFromTs,
    lastProcessedCandleTs: session.last_processed_candle_ts ?? null,
  });

  if (execute.length === 0) {
    const metrics =
      session.paper_metrics ||
      buildPaperMetrics({
        initialCapital: session.initial_balance,
        state:
          session.execution_state ||
          initialPaperState({
            initialCapital: session.initial_balance,
            commissionPct,
            slippagePct,
          }),
        unrealizedPnl: session.unrealized_pnl ?? 0,
        lastProcessedCandleTs: session.last_processed_candle_ts ?? null,
      });
    return {
      session,
      metrics,
      candlesProcessed: 0,
      lastProcessedCandleTs: session.last_processed_candle_ts ?? null,
      eventsCreated: 0,
      tradesOpened: 0,
      tradesClosed: 0,
      skippedDuplicate: false,
      notice: PAPER_SIMULATED_NOTICE,
      safety: getTradingSafetyState(),
    };
  }

  const bounded = execute.slice(0, maxBars);
  const lastBoundedTs = bounded[bounded.length - 1].timestamp.getTime();
  const barsForEngine = allBars.filter(
    (b) => b.timestamp.getTime() <= lastBoundedTs
  );

  const priorState =
    session.execution_state ||
    initialPaperState({
      initialCapital: session.initial_balance,
      commissionPct,
      slippagePct,
    });
  // Frozen fees from first tick stay in state even if someone edits live strategy.
  priorState.commissionPct = priorState.commissionPct ?? commissionPct;
  priorState.slippagePct = priorState.slippagePct ?? slippagePct;

  const result = processClosedBars({
    bars: barsForEngine,
    executeFromIndex,
    strategy,
    state: priorState,
  });

  if (!result.lastProcessedCandleTs) {
    return {
      session,
      metrics: buildPaperMetrics({
        initialCapital: session.initial_balance,
        state: result.state,
        unrealizedPnl: result.unrealizedPnl,
        lastProcessedCandleTs: session.last_processed_candle_ts ?? null,
      }),
      candlesProcessed: 0,
      lastProcessedCandleTs: session.last_processed_candle_ts ?? null,
      eventsCreated: 0,
      tradesOpened: 0,
      tradesClosed: 0,
      skippedDuplicate: true,
      notice: PAPER_SIMULATED_NOTICE,
      safety: getTradingSafetyState(),
    };
  }

  const metrics = buildPaperMetrics({
    initialCapital: session.initial_balance,
    state: result.state,
    unrealizedPnl: result.unrealizedPnl,
    lastProcessedCandleTs: result.lastProcessedCandleTs,
    equityTimeline: result.equityTimeline,
  });

  let eventsCreated = 0;
  try {
    for (const ev of result.events) {
      const row: PaperEventInsert = {
        session_id: session.id,
        strategy_version_id: session.strategy_version_id,
        snapshot_hash: session.snapshot_hash,
        event_type: ev.eventType,
        candle_timestamp: ev.candleTimestamp,
        signal: ev.signal ?? null,
        fill_price: ev.fillPrice ?? null,
        fee: ev.fee ?? null,
        slippage: ev.slippage ?? null,
        quantity: ev.quantity ?? null,
        realized_pnl: ev.realizedPnl ?? null,
        reason: ev.reason ?? null,
        engine_version: PAPER_FORWARD_EXEC_ENGINE_VERSION,
        idempotency_key: eventKey(session.id, ev.eventType, ev.candleTimestamp),
      };
      const inserted = await execDb.insertPaperForwardEvent(row);
      if (!inserted.duplicate) eventsCreated += 1;
    }

    for (const opened of result.openedTrades) {
      await execDb.insertPaperForwardTrade({
        session_id: session.id,
        strategy_version_id: session.strategy_version_id,
        snapshot_hash: session.snapshot_hash,
        direction: opened.direction,
        entry_candle_ts: opened.entryCandleTs,
        entry_price: opened.entryPrice,
        quantity: opened.quantity,
        fee: opened.fee,
        slippage_entry: opened.slippageEntry,
        reason: "open",
        signal: opened.signal ?? null,
        engine_version: PAPER_FORWARD_EXEC_ENGINE_VERSION,
        status: "open",
        unrealized_pnl: 0,
      });
    }

    for (const closed of result.closedTrades) {
      try {
        await execDb.updatePaperForwardTrade(session.id, closed.entryCandleTs, {
          exit_candle_ts: closed.exitCandleTs,
          exit_price: closed.exitPrice,
          fee: closed.fee,
          slippage_exit: closed.slippageExit,
          realized_pnl: closed.realizedPnl,
          unrealized_pnl: 0,
          reason: closed.reason,
          status: "closed",
          signal: closed.signal ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/matched no persisted trade/i.test(message)) throw err;
        const inserted = await execDb.insertPaperForwardTrade({
          session_id: session.id,
          strategy_version_id: session.strategy_version_id,
          snapshot_hash: session.snapshot_hash,
          direction: closed.direction,
          entry_candle_ts: closed.entryCandleTs,
          exit_candle_ts: closed.exitCandleTs,
          entry_price: closed.entryPrice,
          exit_price: closed.exitPrice,
          quantity: closed.quantity,
          fee: closed.fee,
          slippage_entry: closed.slippageEntry,
          slippage_exit: closed.slippageExit,
          realized_pnl: closed.realizedPnl,
          unrealized_pnl: 0,
          reason: closed.reason,
          signal: closed.signal ?? null,
          engine_version: PAPER_FORWARD_EXEC_ENGINE_VERSION,
          status: "closed",
        });
        void inserted;
      }
    }

    if (result.state.position) {
      const pos = result.state.position;
      await execDb.upsertPaperForwardPosition({
        session_id: session.id,
        strategy_version_id: session.strategy_version_id,
        snapshot_hash: session.snapshot_hash,
        direction: pos.direction,
        entry_candle_ts: pos.entryCandleTs,
        entry_price: pos.entryPrice,
        quantity: pos.quantity,
        stop_loss: pos.stopLoss,
        take_profit: pos.takeProfit,
        leverage: pos.leverage,
        fee: pos.entryCommission,
        slippage: null,
        unrealized_pnl: result.unrealizedPnl,
        mark_price: result.markPrice,
        mark_candle_ts: result.lastProcessedCandleTs,
        reason: "open",
        engine_version: PAPER_FORWARD_EXEC_ENGINE_VERSION,
        position_state: pos,
      });
    } else {
      await execDb.deletePaperForwardPosition(session.id);
    }

    await execDb.updatePaperForwardExecution(session.id, {
      last_processed_candle_ts: result.lastProcessedCandleTs,
      execution_state: result.state,
      paper_metrics: metrics,
      realized_pnl: metrics.realizedPnl,
      unrealized_pnl: metrics.unrealizedPnl,
      fees_paid: metrics.feesPaid,
      max_drawdown: metrics.maxDrawdown,
      peak_equity: result.state.peakEquity,
      current_balance: metrics.currentEquity,
      total_pnl: metrics.realizedPnl + metrics.unrealizedPnl,
      total_trades: metrics.totalTrades,
      winning_trades: metrics.wins,
      losing_trades: metrics.losses,
      win_rate: metrics.winRate,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Phase4PersistenceError(
      `Paper execution persistence failed (fail closed, no fake success): ${message}`
    );
  }

  session = await getPaperSession(sessionDb, input.sessionId);

  return {
    session,
    metrics,
    candlesProcessed: bounded.length,
    lastProcessedCandleTs: result.lastProcessedCandleTs,
    eventsCreated: eventsCreated,
    tradesOpened: result.openedTrades.length,
    tradesClosed: result.closedTrades.length,
    skippedDuplicate: false,
    notice: PAPER_SIMULATED_NOTICE,
    safety: getTradingSafetyState(),
  };
}

async function failClosed(
  db: PaperForwardPersistence,
  sessionId: string,
  reason: string,
  actor: string
) {
  try {
    await failPaperSession(db, sessionId, reason, actor);
  } catch {
    // If we cannot persist FAILED, still throw the original snapshot error.
  }
}

export { PaperSnapshotError, PaperCandleError, PaperLifecycleError };
