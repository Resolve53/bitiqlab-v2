/**
 * Phase 4C persistence ports — operations, evaluation, readiness, review.
 * Fail closed. Never fabricate IDs. Never mutate frozen session snapshots.
 */

import type { PaperForwardSession } from "./types";
import type { PaperForwardEvaluation } from "./forward-evaluation";
import type { PaperReadinessDecision } from "./readiness-gate";

export interface PaperOpsEventInsert {
  session_id: string;
  strategy_id?: string | null;
  strategy_version_id?: string | null;
  snapshot_hash?: string | null;
  event_type: string;
  payload?: Record<string, unknown> | null;
  actor?: string | null;
  engine_version: string;
}

export interface PaperOpsPersistence {
  getPaperForwardSession: (id: string) => Promise<PaperForwardSession | any>;
  updatePaperForwardLifecycle: (
    id: string,
    updates: Record<string, unknown>
  ) => Promise<any>;
  updatePaperForwardExecution: (
    id: string,
    updates: Record<string, unknown>
  ) => Promise<any>;
  listPaperForwardTrades: (sessionId: string) => Promise<any[]>;
  listPaperForwardEvents: (sessionId: string, limit?: number) => Promise<any[]>;
  countPaperForwardCandleEvents: (sessionId: string) => Promise<number>;
  listRunningPaperForwardSessions: (limit: number) => Promise<any[]>;
  acquirePaperForwardTickLock: (
    sessionId: string,
    token: string,
    leaseMs: number
  ) => Promise<boolean>;
  releasePaperForwardTickLock: (
    sessionId: string,
    token: string
  ) => Promise<void>;
  insertPaperForwardOpsEvent: (row: PaperOpsEventInsert) => Promise<{ id: string }>;
  insertPaperForwardEvaluation: (row: {
    session_id: string;
    strategy_version_id: string;
    snapshot_hash: string;
    evaluation: PaperForwardEvaluation;
    engine_version: string;
  }) => Promise<{ id: string }>;
  getLatestPaperForwardEvaluation: (
    sessionId: string
  ) => Promise<{ id: string; evaluation: PaperForwardEvaluation } | null>;
  insertPaperForwardReadiness: (row: {
    session_id: string;
    strategy_id: string;
    strategy_version_id: string;
    snapshot_hash: string;
    validation_id?: string | null;
    status: string;
    reasons: unknown;
    checks: unknown;
    config: unknown;
    engine_version: string;
  }) => Promise<{ id: string }>;
  getLatestPaperForwardReadiness: (
    sessionId: string
  ) => Promise<{ id: string; decision: PaperReadinessDecision } | null>;
  insertPaperForwardReview: (row: {
    session_id: string;
    strategy_id: string;
    strategy_version_id: string;
    snapshot_hash: string;
    decision: string;
    notes?: string | null;
    actor: string;
    readiness_status: string;
    engine_version: string;
  }) => Promise<{ id: string }>;
  listPaperForwardReviews: (sessionId: string) => Promise<any[]>;
  listPaperForwardOpsEvents: (sessionId: string, limit?: number) => Promise<any[]>;
  getStrategyValidationById: (id: string) => Promise<any | null>;
  getStrategyVersionById: (id: string) => Promise<any | null>;
  markStrategyVersionLivePhaseEligible: (
    versionId: string,
    actor: string,
    notes: string | null
  ) => Promise<any>;
  createStrategyAuditLog: (log: {
    strategy_id: string;
    action: string;
    old_values?: unknown;
    new_values?: unknown;
    changed_by?: string;
  }) => Promise<unknown>;
}
