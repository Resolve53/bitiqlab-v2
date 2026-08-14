/**
 * Persistence ports for Phase 4B paper execution.
 * Fail closed — never fabricate IDs.
 */

import type {
  PaperExecutionState,
  PaperForwardEventRow,
  PaperForwardPositionRow,
  PaperForwardTradeRow,
  PaperSessionMetrics,
} from "./types";

export interface PaperEventInsert {
  session_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  event_type: string;
  candle_timestamp: string;
  signal?: unknown;
  fill_price?: number | null;
  fee?: number | null;
  slippage?: number | null;
  quantity?: number | null;
  realized_pnl?: number | null;
  reason?: string | null;
  engine_version: string;
  idempotency_key: string;
}

export interface PaperTradeInsert {
  session_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  direction: "long" | "short";
  entry_candle_ts: string;
  exit_candle_ts?: string | null;
  entry_price: number;
  exit_price?: number | null;
  quantity: number;
  fee: number;
  slippage_entry?: number | null;
  slippage_exit?: number | null;
  realized_pnl?: number | null;
  unrealized_pnl?: number | null;
  reason?: string | null;
  signal?: unknown;
  engine_version: string;
  status: "open" | "closed";
}

export interface PaperPositionUpsert {
  session_id: string;
  strategy_version_id: string;
  snapshot_hash: string;
  direction: "long" | "short";
  entry_candle_ts: string;
  entry_price: number;
  quantity: number;
  stop_loss: number;
  take_profit?: number | null;
  leverage: number;
  fee: number;
  slippage?: number | null;
  unrealized_pnl: number;
  mark_price?: number | null;
  mark_candle_ts?: string | null;
  reason?: string | null;
  engine_version: string;
  position_state?: unknown;
}

export interface PaperExecutionUpdates {
  last_processed_candle_ts?: string | null;
  execution_state?: PaperExecutionState | null;
  paper_metrics?: PaperSessionMetrics | null;
  realized_pnl?: number;
  unrealized_pnl?: number;
  fees_paid?: number;
  max_drawdown?: number;
  peak_equity?: number;
  current_balance?: number;
  total_pnl?: number;
  total_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
}

export interface PaperExecutionPersistence {
  insertPaperForwardEvent: (
    row: PaperEventInsert
  ) => Promise<{ id: string; duplicate?: boolean }>;
  insertPaperForwardTrade: (
    row: PaperTradeInsert
  ) => Promise<{ id: string; duplicate?: boolean }>;
  updatePaperForwardTrade: (
    sessionId: string,
    entryCandleTs: string,
    updates: Record<string, unknown>
  ) => Promise<{ id: string }>;
  upsertPaperForwardPosition: (
    row: PaperPositionUpsert
  ) => Promise<{ id: string }>;
  deletePaperForwardPosition: (sessionId: string) => Promise<void>;
  updatePaperForwardExecution: (
    sessionId: string,
    updates: PaperExecutionUpdates
  ) => Promise<unknown>;
  listPaperForwardEvents: (
    sessionId: string,
    limit?: number
  ) => Promise<PaperForwardEventRow[]>;
  listPaperForwardTrades: (
    sessionId: string
  ) => Promise<PaperForwardTradeRow[]>;
  getPaperForwardPosition: (
    sessionId: string
  ) => Promise<PaperForwardPositionRow | null>;
}

export function isUniqueViolation(message: string): boolean {
  return /duplicate key|unique constraint|already exists|23505/i.test(message);
}
