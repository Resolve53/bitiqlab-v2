import type { OHLCVBar, StrategyDefinition } from "@/truth-engine/types";
import { hashStrategyRules } from "@/research-engine/experiment-id";
import type { StrategySnapshot } from "@/research-engine/types";
import type { PaperForwardSession } from "../types";
import type { PaperForwardPersistence } from "../session-service";
import type { PaperExecutionPersistence } from "../execution-persistence";

export function makeBars(
  rows: Array<Partial<OHLCVBar> & { close: number; open?: number }>
): OHLCVBar[] {
  return rows.map((r, i) => {
    const close = r.close;
    const open = r.open ?? close;
    return {
      timestamp:
        r.timestamp ??
        new Date(Date.UTC(2024, 0, 1 + Math.floor(i / 4), (i % 4) * 6)),
      open,
      high: r.high ?? Math.max(open, close),
      low: r.low ?? Math.min(open, close),
      close,
      volume: r.volume ?? 1000,
    };
  });
}

export const longEntryCondition = {
  type: "indicator" as const,
  indicator: "price" as const,
  field: "close",
  operator: ">" as const,
  value: 100,
};

export function frozenSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "strat-1",
    name: "paper fixture",
    symbol: "BTCUSDT",
    timeframe: "15m",
    market_type: "spot",
    version: 1,
    leverage: 1,
    entry_rules: {
      entries: [
        {
          direction: "long",
          condition: longEntryCondition,
        },
      ],
    },
    exit_rules: {
      stop_loss_percent: 2,
      take_profit_percent: 4,
      risk_per_trade_pct: 1,
    },
    ...overrides,
  };
}

export function snapshotHash(snapshot: ReturnType<typeof frozenSnapshot>): string {
  return hashStrategyRules(snapshot as StrategySnapshot);
}

export function truthStrategy(
  overrides: Partial<StrategyDefinition> = {}
): StrategyDefinition {
  return {
    id: "strat-1",
    name: "paper fixture",
    version: 1,
    marketType: "spot",
    symbol: "BTCUSDT",
    entryTimeframe: "15m",
    entries: [
      {
        direction: "long",
        condition: longEntryCondition,
      },
    ],
    exitCondition: null,
    risk: {
      riskPerTradePct: 1,
      stopLossPct: 2,
      takeProfitPct: 4,
    },
    leverage: 1,
    ...overrides,
  };
}

export function makeRunningSession(
  snapshot = frozenSnapshot(),
  extras: Partial<PaperForwardSession> = {}
): PaperForwardSession {
  return {
    id: "sess-1",
    strategy_id: "strat-1",
    strategy_version_id: "ver-1",
    strategy_version: 1,
    snapshot_hash: snapshotHash(snapshot),
    strategy_snapshot: snapshot,
    research_run_id: null,
    validation_id: "val-1",
    lifecycle_status: "RUNNING",
    symbol: "BTCUSDT",
    timeframe: "15m",
    initial_balance: 10_000,
    current_balance: 10_000,
    engine_version: "paper_forward_v1_phase4b",
    created_by: "tester",
    conditional_acknowledged: false,
    eligibility_evidence: {},
    started_at: "2024-01-01T00:00:00.000Z",
    paused_at: null,
    completed_at: null,
    failed_at: null,
    aborted_at: null,
    failure_reason: null,
    abort_reason: null,
    last_processed_candle_ts: null,
    execution_state: null,
    paper_metrics: null,
    ...extras,
  };
}

export function makeSessionDb(session: PaperForwardSession): {
  db: PaperForwardPersistence;
  store: { sess: PaperForwardSession };
} {
  const store = { sess: { ...session } };
  const db: PaperForwardPersistence = {
    getStrategyVersionById: async () => ({
      id: session.strategy_version_id,
      strategy_id: session.strategy_id,
      version: session.strategy_version,
      snapshot_hash: session.snapshot_hash,
      strategy_snapshot: session.strategy_snapshot,
    }),
    getStrategyValidationById: async () => ({
      id: session.validation_id,
      strategy_id: session.strategy_id,
      strategy_version: session.strategy_version,
      strategy_snapshot: session.strategy_snapshot,
      status: "pass",
      gate: {},
      report: {},
      symbol: session.symbol,
      timeframe: session.timeframe,
    }),
    getStrategy: async () => ({
      id: session.strategy_id,
      entry_rules: { live: "MUTATED_SHOULD_NOT_BE_USED" },
      exit_rules: { live: "MUTATED_SHOULD_NOT_BE_USED" },
    }),
    createPaperForwardSession: async (row) => {
      store.sess = { id: session.id, ...row } as PaperForwardSession;
      return store.sess;
    },
    getPaperForwardSession: async () => ({ ...store.sess }),
    updatePaperForwardLifecycle: async (_id, updates) => {
      store.sess = { ...store.sess, ...updates } as PaperForwardSession;
      return { ...store.sess };
    },
    createStrategyAuditLog: async () => ({}),
  };
  return { db, store };
}

export function makeExecDb(): PaperExecutionPersistence & {
  events: any[];
  trades: any[];
  position: any;
  failNextInsert?: boolean;
} {
  const bag: PaperExecutionPersistence & {
    events: any[];
    trades: any[];
    position: any;
    failNextInsert?: boolean;
  } = {
    events: [],
    trades: [],
    position: null,
    insertPaperForwardEvent: async (row) => {
      if (bag.failNextInsert) {
        throw new Error("simulated persistence failure");
      }
      const key = row.idempotency_key;
      if (bag.events.some((e) => e.idempotency_key === key)) {
        return { id: "dup", duplicate: true };
      }
      const rec = { id: `evt-${bag.events.length + 1}`, ...row };
      bag.events.push(rec);
      return { id: rec.id, duplicate: false };
    },
    insertPaperForwardTrade: async (row) => {
      const existing = bag.trades.find(
        (t) =>
          t.session_id === row.session_id &&
          t.entry_candle_ts === row.entry_candle_ts
      );
      if (existing) return { id: existing.id, duplicate: true };
      const rec = { id: `tr-${bag.trades.length + 1}`, ...row };
      bag.trades.push(rec);
      return { id: rec.id, duplicate: false };
    },
    updatePaperForwardTrade: async (sessionId, entryCandleTs, updates) => {
      const t = bag.trades.find(
        (x) => x.session_id === sessionId && x.entry_candle_ts === entryCandleTs
      );
      if (!t) {
        throw new Error("updatePaperForwardTrade matched no persisted trade (fail closed)");
      }
      Object.assign(t, updates);
      return { id: t.id };
    },
    upsertPaperForwardPosition: async (row) => {
      bag.position = { id: "pos-1", ...row };
      return { id: "pos-1" };
    },
    deletePaperForwardPosition: async () => {
      bag.position = null;
    },
    updatePaperForwardExecution: async (sessionId, updates) => {
      void sessionId;
      return updates;
    },
    listPaperForwardEvents: async () => bag.events,
    listPaperForwardTrades: async () => bag.trades,
    getPaperForwardPosition: async () => bag.position,
  };
  return bag;
}

export function tpLongBars(): OHLCVBar[] {
  return makeBars([
    ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
    { close: 101, open: 100, high: 102, low: 99 },
    { close: 102, open: 101, high: 101 * 1.05, low: 100.5 },
    { close: 103, open: 102, high: 104, low: 101 },
  ]);
}

export function slLongBars(): OHLCVBar[] {
  return makeBars([
    ...Array.from({ length: 5 }, () => ({ close: 90, high: 91, low: 89 })),
    { close: 101, open: 100, high: 102, low: 99 },
    { close: 98, open: 101, high: 101.5, low: 101 * 0.97 },
    { close: 97, open: 98, high: 99, low: 96 },
  ]);
}
