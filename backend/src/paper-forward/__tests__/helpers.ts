import type { OHLCVBar, StrategyDefinition } from "@/truth-engine/types";
import { hashStrategyRules } from "@/research-engine/experiment-id";
import type { StrategySnapshot } from "@/research-engine/types";
import type { PaperForwardSession } from "../types";
import type { PaperForwardPersistence } from "../session-service";
import type { PaperExecutionPersistence } from "../execution-persistence";
import type { PaperOpsPersistence } from "../ops-persistence";
import type { PaperForwardEvaluation } from "../forward-evaluation";
import type { PaperReadinessDecision } from "../readiness-gate";


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
    last_tick_at: extras.last_tick_at ?? null,
    last_tick_error: extras.last_tick_error ?? null,
    tick_error_count: extras.tick_error_count ?? 0,
    candles_processed: extras.candles_processed ?? 0,
    stale_detected_at: extras.stale_detected_at ?? null,
    readiness_status: extras.readiness_status ?? null,
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

export function makeClosedTrade(
  overrides: Record<string, unknown> = {}
): any {
  return {
    id: "tr-1",
    session_id: "sess-1",
    strategy_version_id: "ver-1",
    snapshot_hash: "h",
    direction: "long",
    entry_candle_ts: "2024-01-01T00:00:00.000Z",
    exit_candle_ts: "2024-01-01T01:00:00.000Z",
    entry_price: 100,
    exit_price: 104,
    quantity: 1,
    fee: 0.1,
    realized_pnl: 3.9,
    status: "closed",
    engine_version: "paper_forward_exec_v1_phase4b",
    ...overrides,
  };
}

export function makeOpsHarness(session: PaperForwardSession) {
  const { db: sessionDb, store } = makeSessionDb(session);
  const exec = makeExecDb();
  exec.updatePaperForwardExecution = async (_id, updates) => {
    store.sess = { ...store.sess, ...updates } as PaperForwardSession;
    return { ...store.sess };
  };
  sessionDb.updatePaperForwardLifecycle = async (_id, updates) => {
    store.sess = { ...store.sess, ...updates } as PaperForwardSession;
    return { ...store.sess };
  };

  const opsEvents: any[] = [];
  const evaluations: any[] = [];
  const readiness: any[] = [];
  const reviews: any[] = [];
  const audit: any[] = [];
  const lock = { token: null as string | null, until: 0 };
  let liveEligible = false;
  let validation: any = {
    id: session.validation_id,
    strategy_id: session.strategy_id,
    strategy_version: session.strategy_version,
    strategy_snapshot: session.strategy_snapshot,
    status: "pass",
    gate: { status: "pass" },
    report: {
      chronological: {
        validation: {
          tradeCount: 40,
          barCount: 500,
          metrics: {
            totalTrades: 40,
            winRate: 0.55,
            expectancy: 12,
            profitFactor: 1.8,
            totalReturn: 0.2,
            maxDrawdown: 0.08,
            sharpeRatio: 1.1,
            netProfit: 480,
          },
        },
        test: {
          tradeCount: 20,
          barCount: 200,
          metrics: {
            totalTrades: 20,
            winRate: 0.5,
            expectancy: 8,
            profitFactor: 1.4,
            totalReturn: 0.1,
            maxDrawdown: 0.1,
            sharpeRatio: 0.9,
            netProfit: 160,
          },
        },
      },
    },
    symbol: session.symbol,
    timeframe: session.timeframe,
  };

  const ops: PaperOpsPersistence = {
    getPaperForwardSession: async () => ({ ...store.sess }),
    updatePaperForwardLifecycle: async (_id, updates) => {
      store.sess = { ...store.sess, ...updates } as PaperForwardSession;
      return { ...store.sess };
    },
    updatePaperForwardExecution: async (_id, updates) => {
      store.sess = { ...store.sess, ...updates } as PaperForwardSession;
      return { ...store.sess };
    },
    listPaperForwardTrades: async () => exec.trades,
    listPaperForwardEvents: async () => exec.events,
    countPaperForwardCandleEvents: async () =>
      exec.events.filter((e) => e.event_type === "candle_processed").length,
    listRunningPaperForwardSessions: async (limit) => {
      if (store.sess.lifecycle_status !== "RUNNING") return [];
      return [{ ...store.sess }].slice(0, limit);
    },
    acquirePaperForwardTickLock: async (_id, token, leaseMs) => {
      const now = Date.now();
      if (store.sess.lifecycle_status !== "RUNNING") return false;
      if (lock.until > now && lock.token && lock.token !== token) return false;
      lock.token = token;
      lock.until = now + leaseMs;
      store.sess.tick_lock_token = token;
      store.sess.tick_lock_until = new Date(lock.until).toISOString();
      return true;
    },
    releasePaperForwardTickLock: async (_id, token) => {
      if (lock.token === token) {
        lock.token = null;
        lock.until = 0;
        store.sess.tick_lock_token = null;
        store.sess.tick_lock_until = null;
      }
    },
    insertPaperForwardOpsEvent: async (row) => {
      const rec = { id: `ops-${opsEvents.length + 1}`, ...row };
      opsEvents.push(rec);
      return { id: rec.id };
    },
    insertPaperForwardEvaluation: async (row) => {
      const rec = { id: `evl-${evaluations.length + 1}`, ...row };
      evaluations.push(rec);
      return { id: rec.id };
    },
    getLatestPaperForwardEvaluation: async () => {
      const last = evaluations[evaluations.length - 1];
      return last
        ? { id: last.id, evaluation: last.evaluation as PaperForwardEvaluation }
        : null;
    },
    insertPaperForwardReadiness: async (row) => {
      const rec = { id: `rd-${readiness.length + 1}`, ...row };
      readiness.push(rec);
      return { id: rec.id };
    },
    getLatestPaperForwardReadiness: async () => {
      const last = readiness[readiness.length - 1];
      if (!last) return null;
      return {
        id: last.id,
        decision: {
          status: last.status,
          reasons: last.reasons,
          checks: last.checks,
          config: last.config,
          evaluationSource: "paper_forward_simulated" as const,
          historicalSourceExcluded: true as const,
        } as PaperReadinessDecision,
      };
    },
    insertPaperForwardReview: async (row) => {
      const rec = { id: `rv-${reviews.length + 1}`, ...row };
      reviews.push(rec);
      return { id: rec.id };
    },
    listPaperForwardReviews: async () => reviews,
    listPaperForwardOpsEvents: async () => opsEvents,
    getStrategyValidationById: async () => validation,
    getStrategyVersionById: async () => ({
      id: session.strategy_version_id,
      strategy_id: session.strategy_id,
      version: session.strategy_version,
      snapshot_hash: session.snapshot_hash,
      strategy_snapshot: session.strategy_snapshot,
      live_phase_eligible: liveEligible,
    }),
    markStrategyVersionLivePhaseEligible: async (_id, actor, notes) => {
      liveEligible = true;
      return {
        id: session.strategy_version_id,
        live_phase_eligible: true,
        live_phase_eligible_by: actor,
        live_phase_review_notes: notes,
        snapshot_hash: session.snapshot_hash,
      };
    },
    createStrategyAuditLog: async (log) => {
      audit.push(log);
      return log;
    },
  };

  sessionDb.getStrategyValidationById = async () => validation;
  sessionDb.insertPaperForwardOpsEvent = async (row) =>
    ops.insertPaperForwardOpsEvent({
      ...row,
      engine_version: row.engine_version,
    });

  return {
    sessionDb,
    store,
    exec,
    ops,
    opsEvents,
    evaluations,
    readiness,
    reviews,
    audit,
    lock,
    get liveEligible() {
      return liveEligible;
    },
    setValidation(next: any) {
      validation = next;
    },
  };
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
