/**
 * Phase 4A session service — create + lifecycle only.
 * No candles, fills, positions, or exchange orders.
 */

import {
  assertPaperForwardEnabled,
  getTradingSafetyState,
  PAPER_FORWARD_ENGINE_VERSION,
} from "@/lib/trading-safety";
import {
  assertEligible,
  checkPaperEligibility,
  PaperEligibilityError,
} from "./eligibility";
import {
  assertValidTransition,
  legacyStatusForLifecycle,
  PaperLifecycleError,
} from "./lifecycle";
import {
  Phase4PersistenceError,
  throwIfMissingPhase4Schema,
} from "./persistence-errors";
import type {
  CreatePaperSessionInput,
  PaperForwardSession,
  PaperLifecycleStatus,
  StrategyVersionRow,
} from "./types";

export interface PaperForwardPersistence {
  getStrategyVersionById: (id: string) => Promise<StrategyVersionRow | null>;
  getStrategyValidationById: (id: string) => Promise<any | null>;
  getResearchRunById?: (id: string) => Promise<any | null>;
  /** Must not mutate strategies.entry_rules / exit_rules / status for paper lifecycle. */
  getStrategy: (id: string) => Promise<any>;
  createPaperForwardSession: (row: Record<string, unknown>) => Promise<any>;
  getPaperForwardSession: (id: string) => Promise<any>;
  updatePaperForwardLifecycle: (
    id: string,
    updates: Record<string, unknown>
  ) => Promise<any>;
  createStrategyAuditLog: (log: {
    strategy_id: string;
    action: string;
    old_values?: unknown;
    new_values?: unknown;
    changed_by?: string;
  }) => Promise<unknown>;
}

const DEFAULT_CAPITAL = 10_000;

function asSession(row: any): PaperForwardSession {
  if (!row?.id) {
    throw new Phase4PersistenceError("Session row missing id");
  }
  if (!row.lifecycle_status) {
    throw new Phase4PersistenceError(
      "Session missing lifecycle_status — migration 012 required"
    );
  }
  return {
    id: row.id,
    strategy_id: row.strategy_id,
    strategy_version_id: row.strategy_version_id,
    strategy_version: Number(row.strategy_version),
    snapshot_hash: row.snapshot_hash,
    strategy_snapshot: row.strategy_snapshot,
    research_run_id: row.research_run_id ?? null,
    validation_id: row.validation_id,
    lifecycle_status: row.lifecycle_status as PaperLifecycleStatus,
    symbol: row.symbol,
    timeframe: row.timeframe,
    initial_balance: Number(row.initial_balance),
    current_balance: Number(row.current_balance ?? row.initial_balance),
    engine_version: row.engine_version,
    created_by: row.created_by ?? null,
    conditional_acknowledged: Boolean(row.conditional_acknowledged),
    eligibility_evidence: row.eligibility_evidence,
    started_at: row.started_at ?? null,
    paused_at: row.paused_at ?? null,
    completed_at: row.completed_at ?? null,
    failed_at: row.failed_at ?? null,
    aborted_at: row.aborted_at ?? null,
    failure_reason: row.failure_reason ?? null,
    abort_reason: row.abort_reason ?? null,
    created_at: row.created_at,
    start_time: row.start_time,
  };
}

function frozenProvenanceEqual(
  session: PaperForwardSession,
  version: StrategyVersionRow
): boolean {
  return (
    session.strategy_version_id === version.id &&
    Number(session.strategy_version) === Number(version.version) &&
    session.snapshot_hash === version.snapshot_hash &&
    JSON.stringify(session.strategy_snapshot) ===
      JSON.stringify(version.strategy_snapshot)
  );
}

async function audit(
  db: PaperForwardPersistence,
  action: string,
  strategyId: string,
  actor: string,
  payload: unknown
) {
  await db.createStrategyAuditLog({
    strategy_id: strategyId,
    action,
    new_values: payload,
    changed_by: actor,
  });
}

export async function createPaperForwardSession(
  db: PaperForwardPersistence,
  input: CreatePaperSessionInput
): Promise<{
  session: PaperForwardSession;
  eligibility: Awaited<ReturnType<typeof checkPaperEligibility>>;
  safety: ReturnType<typeof getTradingSafetyState>;
}> {
  assertPaperForwardEnabled();

  if (!input.strategyId || !input.strategyVersionId || !input.validationId) {
    throw new PaperEligibilityError([
      "strategyId, strategyVersionId, and validationId are required",
    ]);
  }

  const capital = input.initialCapital ?? DEFAULT_CAPITAL;
  if (!(capital > 0)) {
    throw new PaperEligibilityError(["initialCapital must be positive"]);
  }

  // Touch strategy only to confirm it exists — do not update it.
  await db.getStrategy(input.strategyId);

  const eligibility = await checkPaperEligibility(
    {
      getStrategyVersionById: db.getStrategyVersionById,
      getStrategyValidationById: db.getStrategyValidationById,
      getResearchRunById: db.getResearchRunById,
    },
    {
      strategyId: input.strategyId,
      strategyVersionId: input.strategyVersionId,
      validationId: input.validationId,
      researchRunId: input.researchRunId,
      acknowledgeConditional: input.acknowledgeConditional,
    }
  );
  assertEligible(eligibility);

  const version = await db.getStrategyVersionById(input.strategyVersionId);
  if (!version) {
    throw new PaperEligibilityError(["Strategy version not found"]);
  }

  const symbol = eligibility.evidence.symbol;
  const timeframe = eligibility.evidence.timeframe;
  if (!symbol || !timeframe) {
    throw new PaperEligibilityError([
      "Eligible version must include symbol and timeframe in snapshot or validation",
    ]);
  }

  const actor = input.createdBy || "explicit_api_caller";
  const now = new Date().toISOString();

  let created: any;
  try {
    created = await db.createPaperForwardSession({
      strategy_id: input.strategyId,
      session_name: `Paper Forward v${version.version} — ${symbol} ${timeframe}`,
      initial_balance: capital,
      current_balance: capital,
      exchange: "internal_sim",
      is_testnet: true,
      status: legacyStatusForLifecycle("CREATED"),
      strategy_version_id: version.id,
      strategy_version: version.version,
      snapshot_hash: version.snapshot_hash,
      strategy_snapshot: version.strategy_snapshot,
      research_run_id: input.researchRunId || null,
      validation_id: input.validationId,
      lifecycle_status: "CREATED",
      symbol,
      timeframe,
      engine_version: PAPER_FORWARD_ENGINE_VERSION,
      created_by: actor,
      conditional_acknowledged: Boolean(input.acknowledgeConditional),
      eligibility_evidence: eligibility,
      total_pnl: 0,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      start_time: now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throwIfMissingPhase4Schema("createPaperForwardSession", message);
    if (err instanceof Phase4PersistenceError) throw err;
    throw new Phase4PersistenceError(message);
  }

  const session = asSession(created);
  if (!frozenProvenanceEqual(session, version)) {
    throw new Phase4PersistenceError(
      "Persisted session snapshot does not match selected strategy version"
    );
  }

  await audit(db, "PAPER_SESSION_CREATED", input.strategyId, actor, {
    sessionId: session.id,
    strategyVersionId: session.strategy_version_id,
    strategyVersion: session.strategy_version,
    snapshotHash: session.snapshot_hash,
    validationId: session.validation_id,
    researchRunId: session.research_run_id,
    lifecycle: session.lifecycle_status,
    timestamp: now,
  });

  return {
    session,
    eligibility,
    safety: getTradingSafetyState(),
  };
}

async function transition(
  db: PaperForwardPersistence,
  sessionId: string,
  to: PaperLifecycleStatus,
  actor: string,
  auditAction: string,
  extra: Record<string, unknown> = {}
): Promise<PaperForwardSession> {
  assertPaperForwardEnabled();

  const row = await db.getPaperForwardSession(sessionId);
  const session = asSession(row);
  assertValidTransition(session.lifecycle_status, to);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    lifecycle_status: to,
    status: legacyStatusForLifecycle(to),
    ...extra,
  };
  // Resume RUNNING keeps original started_at; first start sets it.
  if (to === "RUNNING" && !session.started_at) {
    updates.started_at = now;
  } else if (to === "PAUSED") {
    updates.paused_at = now;
  } else if (to === "COMPLETED") {
    updates.completed_at = now;
  } else if (to === "FAILED") {
    updates.failed_at = now;
  } else if (to === "ABORTED") {
    updates.aborted_at = now;
  }

  let updated: any;
  try {
    updated = await db.updatePaperForwardLifecycle(sessionId, updates);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throwIfMissingPhase4Schema("updatePaperForwardLifecycle", message);
    if (err instanceof Phase4PersistenceError) throw err;
    throw new Phase4PersistenceError(message);
  }

  const next = asSession(updated);
  if (next.lifecycle_status !== to) {
    throw new Phase4PersistenceError(
      `Lifecycle update did not persist (expected ${to}, got ${next.lifecycle_status})`
    );
  }

  // Immutability: provenance fields must be unchanged
  if (
    next.strategy_version_id !== session.strategy_version_id ||
    next.snapshot_hash !== session.snapshot_hash ||
    next.validation_id !== session.validation_id ||
    JSON.stringify(next.strategy_snapshot) !==
      JSON.stringify(session.strategy_snapshot)
  ) {
    throw new Phase4PersistenceError(
      "Session provenance fields changed unexpectedly during lifecycle update"
    );
  }

  await audit(db, auditAction, session.strategy_id, actor, {
    sessionId,
    from: session.lifecycle_status,
    to,
    strategyVersionId: session.strategy_version_id,
    strategyVersion: session.strategy_version,
    snapshotHash: session.snapshot_hash,
    validationId: session.validation_id,
    timestamp: now,
    ...extra,
  });

  return next;
}

export async function startPaperSession(
  db: PaperForwardPersistence,
  sessionId: string,
  actor = "explicit_api_caller"
) {
  return transition(db, sessionId, "RUNNING", actor, "PAPER_SESSION_STARTED");
}

export async function pausePaperSession(
  db: PaperForwardPersistence,
  sessionId: string,
  actor = "explicit_api_caller"
) {
  return transition(db, sessionId, "PAUSED", actor, "PAPER_SESSION_PAUSED");
}

export async function resumePaperSession(
  db: PaperForwardPersistence,
  sessionId: string,
  actor = "explicit_api_caller"
) {
  return transition(db, sessionId, "RUNNING", actor, "PAPER_SESSION_RESUMED");
}

export async function abortPaperSession(
  db: PaperForwardPersistence,
  sessionId: string,
  reason: string,
  actor = "explicit_api_caller"
) {
  if (!reason?.trim()) {
    throw new PaperLifecycleError("abort_reason is required");
  }
  return transition(db, sessionId, "ABORTED", actor, "PAPER_SESSION_ABORTED", {
    abort_reason: reason.trim(),
  });
}

export async function getPaperSession(
  db: PaperForwardPersistence,
  sessionId: string
) {
  const row = await db.getPaperForwardSession(sessionId);
  return asSession(row);
}

export { PaperEligibilityError, PaperLifecycleError, Phase4PersistenceError };
