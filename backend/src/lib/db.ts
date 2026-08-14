/**
 * Supabase Database Service
 * Handles all database operations for Bitiq Lab
 * Aligned with 004_bitiqlab_complete_schema.sql
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Strategy, CreateStrategyRequest } from "../core";
import {
  Phase3PersistenceError,
  throwIfMissingPhase3Relation,
} from "@/research-engine/persistence-errors";
import {
  Phase4PersistenceError,
  throwIfMissingPhase4Schema,
} from "@/paper-forward/persistence-errors";

/**
 * Database Service
 * Provides typed access to Supabase
 */
export class DatabaseService {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Strategy Operations
   */
  async createStrategy(input: CreateStrategyRequest) {
    const strategy = {
      name: input.name,
      description: input.description || null,
      symbol: input.symbol,
      timeframe: input.timeframe,
      market_type: input.market_type || "spot",
      entry_rules: input.entry_rules ?? null,
      exit_rules: input.exit_rules ?? null,
      status: "draft",
      current_sharpe: 0,
      backtest_count: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_return: 0,
      max_drawdown: 0,
      win_rate: 0,
      confidence_score: 0,
      ai_enhancement: input.ai_enhancement ?? null,
      created_by: input.created_by || "system",
      deployed_to_bitiq: false,
    };

    const { data, error } = await this.client
      .from("strategies")
      .insert([strategy])
      .select()
      .single();

    if (error) throw new Error(`Failed to create strategy: ${error.message}`);
    return data as Strategy;
  }

  async getStrategy(id: string) {
    const { data, error } = await this.client
      .from("strategies")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(`Failed to get strategy: ${error.message}`);
    return data as Strategy;
  }

  async listStrategies(filters?: {
    status?: string;
    symbol?: string;
    created_by?: string;
    /** When false (default), hides soft-deleted strategies (status failed). */
    include_archived?: boolean;
  }) {
    let query = this.client.from("strategies").select("*");

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.symbol) query = query.eq("symbol", filters.symbol);
    if (filters?.created_by) query = query.eq("created_by", filters.created_by);
    if (!filters?.include_archived) {
      query = query.neq("status", "failed");
    }

    const { data, error } = await query.order("updated_at", { ascending: false });

    if (error) throw new Error(`Failed to list strategies: ${error.message}`);
    return data as Strategy[];
  }

  /**
   * Permanently remove a strategy and its paper trading / backtest data.
   */
  async deleteStrategyCompletely(strategyId: string) {
    const sessions = await this.listTradingSessions({ strategy_id: strategyId });

    for (const session of sessions) {
      const sessionId = (session as { id: string }).id;
      await this.deletePaperTradesForSession(sessionId);
      await this.deleteMultiCoinConfigsForSession(sessionId);
      await this.deleteMonitoringJobsForSession(sessionId);
    }

    await this.deletePaperTradesForStrategy(strategyId);
    await this.deleteTradingSessionsForStrategy(strategyId);
    await this.deleteBacktestsForStrategy(strategyId);
    await this.deleteTradeSignalsForStrategy(strategyId);

    const tables = [
      "bitiq_promotions",
      "strategy_performance",
      "strategy_audit_log",
      "ai_research_logs",
    ];
    for (const table of tables) {
      const { error } = await this.client
        .from(table)
        .delete()
        .eq("strategy_id", strategyId);
      if (error && !error.message.includes("does not exist")) {
        console.warn(`[deleteStrategy] ${table}:`, error.message);
      }
    }

    const { error } = await this.client
      .from("strategies")
      .delete()
      .eq("id", strategyId);

    if (error) {
      throw new Error(`Failed to delete strategy: ${error.message}`);
    }
  }

  async deletePaperTradesForSession(sessionId: string) {
    const { error } = await this.client
      .from("paper_trades")
      .delete()
      .eq("session_id", sessionId);
    if (error) throw new Error(`Failed to delete session trades: ${error.message}`);
  }

  async deletePaperTradesForStrategy(strategyId: string) {
    const { error } = await this.client
      .from("paper_trades")
      .delete()
      .eq("strategy_id", strategyId);
    if (error) throw new Error(`Failed to delete strategy trades: ${error.message}`);
  }

  async deleteMultiCoinConfigsForSession(sessionId: string) {
    const { error } = await this.client
      .from("multi_coin_monitor_configs")
      .delete()
      .eq("session_id", sessionId);
    if (error && error.code !== "PGRST116") {
      console.warn(`Failed to delete multi-coin config: ${error.message}`);
    }
  }

  async deleteMonitoringJobsForSession(sessionId: string) {
    const { error } = await this.client
      .from("monitoring_jobs")
      .delete()
      .eq("session_id", sessionId);
    if (error && error.code !== "PGRST116") {
      console.warn(`Failed to delete monitoring jobs: ${error.message}`);
    }
  }

  async deleteTradingSessionsForStrategy(strategyId: string) {
    const { error } = await this.client
      .from("trading_sessions")
      .delete()
      .eq("strategy_id", strategyId);
    if (error) {
      throw new Error(`Failed to delete trading sessions: ${error.message}`);
    }
  }

  async deleteTradingSession(sessionId: string) {
    await this.deletePaperTradesForSession(sessionId);
    await this.deleteMultiCoinConfigsForSession(sessionId);
    await this.deleteMonitoringJobsForSession(sessionId);
    const { error } = await this.client
      .from("trading_sessions")
      .delete()
      .eq("id", sessionId);
    if (error) {
      throw new Error(`Failed to delete trading session: ${error.message}`);
    }
  }

  async deleteBacktestsForStrategy(strategyId: string) {
    const { error } = await this.client
      .from("backtests")
      .delete()
      .eq("strategy_id", strategyId);
    if (error) console.warn(`Failed to delete backtests: ${error.message}`);
  }

  async deleteTradeSignalsForStrategy(strategyId: string) {
    const { error } = await this.client
      .from("trade_signals")
      .delete()
      .eq("strategy_id", strategyId);
    if (error) console.warn(`Failed to delete trade signals: ${error.message}`);
  }

  async updateStrategy(id: string, updates: Partial<Strategy>) {
    const { data, error } = await this.client
      .from("strategies")
      .update({
        ...updates,
        updated_at: new Date(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update strategy: ${error.message}`);
    return data as Strategy;
  }

  /**
   * Backtest Operations
   */
  async createBacktest(backtest: {
    strategy_id: string;
    symbol: string;
    timeframe?: string;
    start_date?: Date;
    end_date?: Date;
    initial_balance?: number;
    final_balance?: number;
    total_trades?: number;
    winning_trades?: number;
    losing_trades?: number;
    win_rate?: number;
    profit_factor?: number;
    sharpe_ratio?: number;
    max_drawdown?: number;
    total_return?: number;
    monthly_returns?: any;
    trade_list?: any;
    /** REAL_BACKTEST | SIMULATED_LEGACY — also mirrored in monthly_returns */
    result_source?: string;
    provenance?: any;
  }) {
    const row: Record<string, unknown> = {
      ...backtest,
      status: "completed",
    };

    // Prefer dedicated columns when migration 008 is applied; fall back gracefully.
    const { data, error } = await this.client
      .from("backtests")
      .insert([row])
      .select()
      .single();

    if (error) {
      // Retry without optional provenance columns if schema not migrated yet
      if (
        /result_source|provenance/i.test(error.message) &&
        (backtest.result_source || backtest.provenance)
      ) {
        const {
          result_source: _rs,
          provenance: _p,
          ...rest
        } = backtest;
        const { data: retryData, error: retryError } = await this.client
          .from("backtests")
          .insert([{ ...rest, status: "completed" }])
          .select()
          .single();
        if (retryError) {
          throw new Error(`Failed to create backtest: ${retryError.message}`);
        }
        return retryData;
      }
      throw new Error(`Failed to create backtest: ${error.message}`);
    }
    return data;
  }

  async getBacktest(id: string) {
    const { data, error } = await this.client
      .from("backtests")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(`Failed to get backtest: ${error.message}`);
    return data;
  }

  async listBacktests(strategyId: string) {
    const { data, error } = await this.client
      .from("backtests")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list backtests: ${error.message}`);
    return data;
  }

  /**
   * Phase 2 validation reports (append-only; never overwrite).
   */
  async createStrategyValidation(row: {
    strategy_id: string;
    strategy_version?: number;
    strategy_snapshot: unknown;
    status: string;
    gate: unknown;
    report: unknown;
    dataset_provenance?: unknown;
    symbol?: string;
    timeframe?: string;
  }) {
    const { data, error } = await this.client
      .from("strategy_validations")
      .insert([row])
      .select()
      .single();

    if (error) {
      // Migration 009 may not be applied yet — still return report to client.
      if (/strategy_validations|relation|does not exist/i.test(error.message)) {
        console.warn(
          "strategy_validations table missing; validation report not persisted:",
          error.message
        );
        return { id: null, ...row, created_at: new Date().toISOString() };
      }
      throw new Error(
        `Failed to create strategy validation: ${error.message}`
      );
    }
    return data;
  }

  async listStrategyValidations(strategyId: string) {
    const { data, error } = await this.client
      .from("strategy_validations")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("created_at", { ascending: false });

    if (error) {
      if (/strategy_validations|relation|does not exist/i.test(error.message)) {
        return [];
      }
      throw new Error(
        `Failed to list strategy validations: ${error.message}`
      );
    }
    return data;
  }

  /**
   * Phase 3 — immutable strategy versions (append-only).
   * Fail closed if migrations 010/011 are not applied — never fabricate records.
   */
  async createStrategyVersion(row: {
    strategy_id: string;
    version: number;
    parent_version?: number | null;
    source: string;
    strategy_snapshot: unknown;
    snapshot_hash: string;
    notes?: string;
  }) {
    const { data, error } = await this.client
      .from("strategy_versions")
      .insert([row])
      .select()
      .single();

    if (error) {
      throwIfMissingPhase3Relation("strategy_versions", error.message);
      if (/duplicate|unique/i.test(error.message)) {
        // Already snapshotted this version — idempotent only when table exists
        const existing = await this.getStrategyVersion(
          row.strategy_id,
          row.version
        );
        if (existing?.id) return existing;
      }
      throw new Phase3PersistenceError(
        `Failed to create strategy version: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase3PersistenceError(
        "createStrategyVersion returned no persisted id"
      );
    }
    return data;
  }

  async getStrategyVersion(strategyId: string, version: number) {
    const { data, error } = await this.client
      .from("strategy_versions")
      .select("*")
      .eq("strategy_id", strategyId)
      .eq("version", version)
      .maybeSingle();
    if (error) {
      throwIfMissingPhase3Relation("strategy_versions", error.message);
      throw new Phase3PersistenceError(
        `Failed to get strategy version: ${error.message}`
      );
    }
    return data;
  }

  async getStrategyVersionById(id: string) {
    const { data, error } = await this.client
      .from("strategy_versions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throwIfMissingPhase3Relation("strategy_versions", error.message);
      throw new Phase3PersistenceError(
        `Failed to get strategy version by id: ${error.message}`
      );
    }
    return data;
  }

  async listStrategyVersions(strategyId: string) {
    const { data, error } = await this.client
      .from("strategy_versions")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("version", { ascending: false });
    if (error) {
      throwIfMissingPhase3Relation("strategy_versions", error.message);
      throw new Phase3PersistenceError(
        `Failed to list strategy versions: ${error.message}`
      );
    }
    return data ?? [];
  }

  async getStrategyValidationById(id: string) {
    const { data, error } = await this.client
      .from("strategy_validations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throwIfMissingPhase4Schema("strategy_validations", error.message);
      if (/strategy_validations|relation|does not exist/i.test(error.message)) {
        throw new Phase4PersistenceError(
          `Required table "strategy_validations" is missing (${error.message})`
        );
      }
      throw new Phase4PersistenceError(
        `Failed to get strategy validation: ${error.message}`
      );
    }
    return data;
  }

  async getResearchRunById(id: string) {
    const { data, error } = await this.client
      .from("strategy_research_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throwIfMissingPhase3Relation("strategy_research_runs", error.message);
      throw new Phase3PersistenceError(
        `Failed to get research run: ${error.message}`
      );
    }
    return data;
  }

  /**
   * Phase 4A — immutable paper-forward session. Fail closed if migration 012 missing.
   */
  async createPaperForwardSession(row: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("trading_sessions")
      .insert([row])
      .select()
      .single();
    if (error) {
      throwIfMissingPhase4Schema("trading_sessions Phase 4A columns", error.message);
      throw new Phase4PersistenceError(
        `Failed to create paper-forward session: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase4PersistenceError(
        "createPaperForwardSession returned no persisted id"
      );
    }
    if (!data.lifecycle_status || !data.strategy_version_id || !data.snapshot_hash) {
      throw new Phase4PersistenceError(
        "Persisted session missing Phase 4A provenance columns — apply migration 012"
      );
    }
    return data;
  }

  async getPaperForwardSession(id: string) {
    const { data, error } = await this.client
      .from("trading_sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      throwIfMissingPhase4Schema("trading_sessions", error.message);
      throw new Phase4PersistenceError(
        `Failed to get paper-forward session: ${error.message}`
      );
    }
    return data;
  }

  /**
   * Lifecycle updates only — never allow provenance field mutation via this method.
   */
  async updatePaperForwardLifecycle(
    id: string,
    updates: Record<string, unknown>
  ) {
    const forbidden = [
      "strategy_id",
      "strategy_version_id",
      "strategy_version",
      "snapshot_hash",
      "strategy_snapshot",
      "research_run_id",
      "validation_id",
      "symbol",
      "timeframe",
      "engine_version",
    ];
    for (const key of forbidden) {
      if (key in updates) {
        throw new Phase4PersistenceError(
          `Refusing to mutate immutable paper session field: ${key}`
        );
      }
    }

    const { data, error } = await this.client
      .from("trading_sessions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throwIfMissingPhase4Schema("trading_sessions lifecycle update", error.message);
      throw new Phase4PersistenceError(
        `Failed to update paper-forward lifecycle: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase4PersistenceError(
        "updatePaperForwardLifecycle returned no persisted id"
      );
    }
    return data;
  }

  /**
   * Phase 4B execution cursor/metrics — still forbids provenance mutation.
   */
  async updatePaperForwardExecution(
    id: string,
    updates: Record<string, unknown>
  ) {
    const forbidden = [
      "strategy_id",
      "strategy_version_id",
      "strategy_version",
      "snapshot_hash",
      "strategy_snapshot",
      "research_run_id",
      "validation_id",
      "symbol",
      "timeframe",
      "engine_version",
    ];
    for (const key of forbidden) {
      if (key in updates) {
        throw new Phase4PersistenceError(
          `Refusing to mutate immutable paper session field: ${key}`
        );
      }
    }

    const { data, error } = await this.client
      .from("trading_sessions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throwIfMissingPhase4Schema("trading_sessions execution update", error.message);
      throw new Phase4PersistenceError(
        `Failed to update paper-forward execution state: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase4PersistenceError(
        "updatePaperForwardExecution returned no persisted id"
      );
    }
    return data;
  }

  async insertPaperForwardEvent(row: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("paper_forward_events")
      .insert([row])
      .select("id")
      .single();
    if (error) {
      throwIfMissingPhase4Schema("paper_forward_events", error.message);
      if (/duplicate key|unique constraint|23505/i.test(error.message)) {
        return { id: String(row.idempotency_key || "duplicate"), duplicate: true };
      }
      throw new Phase4PersistenceError(
        `Failed to insert paper-forward event: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase4PersistenceError(
        "insertPaperForwardEvent returned no persisted id"
      );
    }
    return { id: String(data.id), duplicate: false };
  }

  async insertPaperForwardTrade(row: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("paper_forward_trades")
      .insert([row])
      .select("id")
      .single();
    if (error) {
      throwIfMissingPhase4Schema("paper_forward_trades", error.message);
      if (/duplicate key|unique constraint|23505/i.test(error.message)) {
        return { id: "duplicate", duplicate: true };
      }
      throw new Phase4PersistenceError(
        `Failed to insert paper-forward trade: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase4PersistenceError(
        "insertPaperForwardTrade returned no persisted id"
      );
    }
    return { id: String(data.id), duplicate: false };
  }

  async updatePaperForwardTrade(
    sessionId: string,
    entryCandleTs: string,
    updates: Record<string, unknown>
  ) {
    const { data, error } = await this.client
      .from("paper_forward_trades")
      .update(updates)
      .eq("session_id", sessionId)
      .eq("entry_candle_ts", entryCandleTs)
      .select("id")
      .maybeSingle();
    if (error) {
      throwIfMissingPhase4Schema("paper_forward_trades update", error.message);
      throw new Phase4PersistenceError(
        `Failed to update paper-forward trade: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase4PersistenceError(
        "updatePaperForwardTrade matched no persisted trade (fail closed)"
      );
    }
    return { id: String(data.id) };
  }

  async upsertPaperForwardPosition(row: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("paper_forward_positions")
      .upsert([row], { onConflict: "session_id" })
      .select("id")
      .single();
    if (error) {
      throwIfMissingPhase4Schema("paper_forward_positions", error.message);
      throw new Phase4PersistenceError(
        `Failed to upsert paper-forward position: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase4PersistenceError(
        "upsertPaperForwardPosition returned no persisted id"
      );
    }
    return { id: String(data.id) };
  }

  async deletePaperForwardPosition(sessionId: string) {
    const { error } = await this.client
      .from("paper_forward_positions")
      .delete()
      .eq("session_id", sessionId);
    if (error) {
      throwIfMissingPhase4Schema("paper_forward_positions delete", error.message);
      throw new Phase4PersistenceError(
        `Failed to clear paper-forward position: ${error.message}`
      );
    }
  }

  async listPaperForwardEvents(sessionId: string, limit = 100) {
    const { data, error } = await this.client
      .from("paper_forward_events")
      .select("*")
      .eq("session_id", sessionId)
      .order("candle_timestamp", { ascending: false })
      .limit(limit);
    if (error) {
      throwIfMissingPhase4Schema("paper_forward_events list", error.message);
      throw new Phase4PersistenceError(
        `Failed to list paper-forward events: ${error.message}`
      );
    }
    return data || [];
  }

  async listPaperForwardTrades(sessionId: string) {
    const { data, error } = await this.client
      .from("paper_forward_trades")
      .select("*")
      .eq("session_id", sessionId)
      .order("entry_candle_ts", { ascending: true });
    if (error) {
      throwIfMissingPhase4Schema("paper_forward_trades list", error.message);
      throw new Phase4PersistenceError(
        `Failed to list paper-forward trades: ${error.message}`
      );
    }
    return data || [];
  }

  async getPaperForwardPosition(sessionId: string) {
    const { data, error } = await this.client
      .from("paper_forward_positions")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) {
      throwIfMissingPhase4Schema("paper_forward_positions get", error.message);
      throw new Phase4PersistenceError(
        `Failed to get paper-forward position: ${error.message}`
      );
    }
    return data;
  }

  async listPaperForwardSessions(filters?: { strategy_id?: string }) {
    let query = this.client
      .from("trading_sessions")
      .select("*")
      .not("lifecycle_status", "is", null);
    if (filters?.strategy_id) {
      query = query.eq("strategy_id", filters.strategy_id);
    }
    const { data, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error) {
      throwIfMissingPhase4Schema("trading_sessions list", error.message);
      throw new Phase4PersistenceError(
        `Failed to list paper-forward sessions: ${error.message}`
      );
    }
    return data || [];
  }

  async createResearchRun(row: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("strategy_research_runs")
      .insert([row])
      .select()
      .single();
    if (error) {
      throwIfMissingPhase3Relation("strategy_research_runs", error.message);
      throw new Phase3PersistenceError(
        `Failed to create research run: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase3PersistenceError(
        "createResearchRun returned no persisted id"
      );
    }
    return data;
  }

  async updateResearchRun(id: string, updates: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("strategy_research_runs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throwIfMissingPhase3Relation("strategy_research_runs", error.message);
      throw new Phase3PersistenceError(
        `Failed to update research run: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase3PersistenceError(
        "updateResearchRun returned no persisted id"
      );
    }
    return data;
  }

  async appendResearchExperiment(row: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("strategy_research_experiments")
      .insert([row])
      .select()
      .single();
    if (error) {
      throwIfMissingPhase3Relation(
        "strategy_research_experiments",
        error.message
      );
      throw new Phase3PersistenceError(
        `Failed to append research experiment: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase3PersistenceError(
        "appendResearchExperiment returned no persisted id"
      );
    }
    return data;
  }

  /**
   * List research runs. Missing Phase 3 tables fail closed (clear error),
   * never silently pretend there are zero runs after a successful research UX.
   */
  async listResearchRuns(strategyId: string) {
    const { data, error } = await this.client
      .from("strategy_research_runs")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("started_at", { ascending: false });
    if (error) {
      throwIfMissingPhase3Relation("strategy_research_runs", error.message);
      throw new Phase3PersistenceError(
        `Failed to list research runs: ${error.message}`
      );
    }
    return data ?? [];
  }

  /**
   * Paper Trade Operations
   */
  async createPaperTrade(trade: {
    session_id: string;
    strategy_id: string;
    symbol: string;
    side: string;
    entry_price: number;
    quantity: number;
    exit_price?: number;
    exit_time?: Date;
    status?: string;
    pnl?: number;
    pnl_percent?: number;
    reason_entry?: string;
    reason_exit?: string;
    confidence_score?: number;
    chart_analysis?: any;
    on_chain_signal?: any;
    macro_event?: string;
  }) {
    const { data, error } = await this.client
      .from("paper_trades")
      .insert([{ ...trade, status: trade.status || "open" }])
      .select()
      .single();

    if (error) throw new Error(`Failed to create paper trade: ${error.message}`);
    return data;
  }

  async listPaperTrades(sessionId: string) {
    const { data, error } = await this.client
      .from("paper_trades")
      .select("*")
      .eq("session_id", sessionId)
      .order("entry_time", { ascending: false });

    if (error) throw new Error(`Failed to list paper trades: ${error.message}`);
    return data;
  }
  async listPaperTradesByStrategy(strategyId: string, limit = 200) {
    const { data, error } = await this.client
      .from("paper_trades")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("entry_time", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list strategy trades: ${error.message}`);
    }
    return data || [];
  }

  async listAllPaperTrades(options?: {
    strategy_id?: string;
    limit?: number;
  }) {
    let query = this.client.from("paper_trades").select("*");

    if (options?.strategy_id) {
      query = query.eq("strategy_id", options.strategy_id);
    }

    const limit = Math.min(options?.limit ?? 100, 500);
    const { data, error } = await query
      .order("entry_time", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to list trades: ${error.message}`);
    return data || [];
  }


  async updatePaperTrade(id: string, updates: any) {
    const { data, error } = await this.client
      .from("paper_trades")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update paper trade: ${error.message}`);
    return data;
  }

  /**
   * Trading Session Operations
   */
  async createTradingSession(session: {
    strategy_id: string;
    session_name?: string;
    initial_balance: number;
    exchange?: string;
    is_testnet?: boolean;
  }) {
    const { data, error } = await this.client
      .from("trading_sessions")
      .insert([
        {
          ...session,
          status: "active",
          current_balance: session.initial_balance,
          total_pnl: 0,
          total_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
        },
      ])
      .select()
      .single();

    if (error)
      throw new Error(`Failed to create trading session: ${error.message}`);
    return data;
  }

  async getTradingSession(id: string) {
    const { data, error } = await this.client
      .from("trading_sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (error)
      throw new Error(`Failed to get trading session: ${error.message}`);
    return data;
  }

  async listTradingSessions(filters?: {
    strategy_id?: string;
    status?: string;
  }) {
    let query = this.client.from("trading_sessions").select("*");

    if (filters?.strategy_id) query = query.eq("strategy_id", filters.strategy_id);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query.order("start_time", { ascending: false });

    if (error)
      throw new Error(`Failed to list trading sessions: ${error.message}`);
    return data;
  }

  async updateTradingSession(id: string, updates: any) {
    const { data, error } = await this.client
      .from("trading_sessions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to update trading session: ${error.message}`);
    return data;
  }

  /**
   * Strategy Audit Log Operations
   */
  async createStrategyAuditLog(log: {
    strategy_id: string;
    action: string;
    old_values?: any;
    new_values?: any;
    changed_by?: string;
  }) {
    const { data, error } = await this.client
      .from("strategy_audit_log")
      .insert([log])
      .select()
      .single();

    if (error) throw new Error(`Failed to create audit log: ${error.message}`);
    return data;
  }

  /**
   * Dashboard Metrics
   */
  async getDashboardMetrics() {
    // Get total strategies
    const { count: strategyCount } = await this.client
      .from("strategies")
      .select("*", { count: "exact", head: true });

    // Get active trading sessions
    const { count: activeTradingCount } = await this.client
      .from("trading_sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    // Get approved strategies
    const { count: approvedCount } = await this.client
      .from("strategies")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");

    return {
      total_strategies: strategyCount || 0,
      active_trading: activeTradingCount || 0,
      approved_strategies: approvedCount || 0,
      timestamp: new Date(),
    };
  }

  /**
   * Strategy Performance Summary
   */
  async getStrategyPerformance(strategyId: string) {
    const { data, error } = await this.client
      .from("backtests")
      .select("sharpe_ratio, max_drawdown, win_rate, total_trades")
      .eq("strategy_id", strategyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows
      throw new Error(`Failed to get strategy performance: ${error.message}`);
    }

    return data || null;
  }

  /**
   * Multi-Coin Monitor Configuration Operations
   */
  async saveMultiCoinConfig(
    sessionId: string,
    strategyId: string,
    config: {
      coin_count: number;
      custom_coins: string[];
      scan_frequency: number;
      position_size_per_coin: number;
      max_concurrent_positions: number;
      stop_loss_percent: number;
      take_profit_percent: number;
      trading_type: "spot" | "futures";
    }
  ) {
    const { data, error } = await this.client
      .from("multi_coin_monitor_configs")
      .insert([
        {
          session_id: sessionId,
          strategy_id: strategyId,
          coin_count: config.coin_count,
          custom_coins: config.custom_coins,
          scan_frequency: config.scan_frequency,
          position_size_per_coin: config.position_size_per_coin,
          max_concurrent_positions: config.max_concurrent_positions,
          stop_loss_percent: config.stop_loss_percent,
          take_profit_percent: config.take_profit_percent,
          trading_type: config.trading_type,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save multi-coin config: ${error.message}`);
    }

    return data;
  }

  async getMultiCoinConfig(sessionId: string) {
    const { data, error } = await this.client
      .from("multi_coin_monitor_configs")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows
      throw new Error(`Failed to get multi-coin config: ${error.message}`);
    }

    return data || null;
  }

  /**
   * Monitoring Job Status Operations
   */
  async createMonitoringJobStatus(jobStatus: {
    job_id: string;
    session_id: string | any;
    strategy_id: string | any;
    coins: string[];
    status: "running" | "stopped" | "error";
    last_evaluation?: Date;
    signals_generated?: number;
    trades_executed?: number;
  }) {
    const { data, error } = await this.client
      .from("monitoring_jobs")
      .insert([jobStatus])
      .select()
      .single();

    if (error) throw new Error(`Failed to create monitoring job: ${error.message}`);
    return data;
  }

  async getMonitoringJobStatus(jobId: string) {
    const { data, error } = await this.client
      .from("monitoring_jobs")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to get monitoring job: ${error.message}`);
    }

    return data || null;
  }

  async updateMonitoringJobStatus(jobId: string, updates: any) {
    const { data, error } = await this.client
      .from("monitoring_jobs")
      .update({
        ...updates,
        updated_at: new Date(),
      })
      .eq("job_id", jobId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update monitoring job: ${error.message}`);
    return data;
  }

  async listActiveMonitoringJobs() {
    const { data, error } = await this.client
      .from("monitoring_jobs")
      .select("*")
      .eq("status", "running")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list monitoring jobs: ${error.message}`);
    return data || [];
  }

  /**
   * Trade Scoring Operations
   */
  async saveTradeScore(tradeScore: {
    tradeId: string;
    tradeQualityScore: number;
    calendarImpactScore: number;
    onChainImpactScore: number;
    combinedScore: number;
    analysisNotes: string;
  }) {
    const { data, error } = await this.client
      .from("trade_scores")
      .insert([{
        trade_id: tradeScore.tradeId,
        trade_score: tradeScore.tradeQualityScore,
        calendar_impact: tradeScore.calendarImpactScore,
        onchain_impact: tradeScore.onChainImpactScore,
        combined_score: tradeScore.combinedScore,
        analysis_notes: tradeScore.analysisNotes,
        created_at: new Date(),
      }])
      .select()
      .single();

    if (error && !error.message.includes("duplicate")) {
      console.warn(`Trade score insert note: ${error.message}`);
    }
    return data || null;
  }

  async getTradeScore(tradeId: string) {
    const { data, error } = await this.client
      .from("trade_scores")
      .select("*")
      .eq("trade_id", tradeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.warn(`Failed to get trade score: ${error.message}`);
    }
    return data || null;
  }
  /**
   * Bitiq promotion pipeline
   */

  async createTradeSignal(signal: {
    strategy_id: string;
    symbol: string;
    signal_type: string;
    signal_strength?: number;
    confidence_score?: number;
    reasoning?: string;
    chart_pattern?: unknown;
    technical_indicators?: unknown;
    on_chain_data?: unknown;
    macro_context?: string;
  }) {
    const { data, error } = await this.client
      .from("trade_signals")
      .insert([signal])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create trade signal: ${error.message}`);
    }
    return data;
  }

  async createBitiqPromotion(record: {
    strategy_id: string;
    trading_session_id?: string;
    status: string;
    readiness?: unknown;
    promotion_notes?: string;
    promoted_by?: string;
    bitiq_strategy_id?: string;
    webhook_response?: unknown;
  }) {
    const { data, error } = await this.client
      .from("bitiq_promotions")
      .insert([
        {
          ...record,
          readiness: record.readiness ?? null,
          webhook_response: record.webhook_response ?? null,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create Bitiq promotion: ${error.message}`);
    }
    return data;
  }

  async updateBitiqPromotion(
    id: string,
    updates: {
      status?: string;
      bitiq_strategy_id?: string;
      webhook_response?: unknown;
      promotion_notes?: string;
    }
  ) {
    const { data, error } = await this.client
      .from("bitiq_promotions")
      .update({
        ...updates,
        updated_at: new Date(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update Bitiq promotion: ${error.message}`);
    }
    return data;
  }

  async listBitiqPromotions(strategyId: string) {
    const { data, error } = await this.client
      .from("bitiq_promotions")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list Bitiq promotions: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Stage 1 TradingView candidates — persist-only. Fail closed if migration 014 is missing.
   */
  async insertTradingViewCandidate(row: {
    candidate_id: string;
    strategy_id: string;
    strategy_version_id: string;
    snapshot_hash: string;
    symbol: string;
    timeframe: string;
    direction: string;
    signal_candle_ts: string;
    received_at: string;
    entry: number;
    stop_loss: number;
    take_profits: number[];
    pine_version: string;
    source: string;
    raw_payload: unknown;
    status: string;
  }) {
    const { data, error } = await this.client
      .from("tradingview_candidates")
      .insert([row])
      .select()
      .single();
    if (error) {
      throwIfMissingPhase4Schema("tradingview_candidates", error.message);
      throw new Phase4PersistenceError(
        `Failed to insert tradingview candidate: ${error.message}`
      );
    }
    if (!data?.id) {
      throw new Phase4PersistenceError(
        "insertTradingViewCandidate returned no persisted id"
      );
    }
    return data;
  }

  async getTradingViewCandidateByCandidateId(candidateId: string) {
    const { data, error } = await this.client
      .from("tradingview_candidates")
      .select("*")
      .eq("candidate_id", candidateId)
      .maybeSingle();
    if (error) {
      throwIfMissingPhase4Schema("tradingview_candidates", error.message);
      throw new Phase4PersistenceError(
        `Failed to get tradingview candidate: ${error.message}`
      );
    }
    return data;
  }

  async getTradingViewCandidateById(id: string) {
    const { data, error } = await this.client
      .from("tradingview_candidates")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throwIfMissingPhase4Schema("tradingview_candidates", error.message);
      throw new Phase4PersistenceError(
        `Failed to get tradingview candidate by id: ${error.message}`
      );
    }
    return data;
  }

  async getTradingViewCandidateByNaturalKey(key: {
    strategy_version_id: string;
    symbol: string;
    timeframe: string;
    direction: string;
    signal_candle_ts: string;
  }) {
    const { data, error } = await this.client
      .from("tradingview_candidates")
      .select("*")
      .eq("strategy_version_id", key.strategy_version_id)
      .eq("symbol", key.symbol)
      .eq("timeframe", key.timeframe)
      .eq("direction", key.direction)
      .eq("signal_candle_ts", key.signal_candle_ts)
      .maybeSingle();
    if (error) {
      throwIfMissingPhase4Schema("tradingview_candidates", error.message);
      throw new Phase4PersistenceError(
        `Failed to get tradingview candidate by natural key: ${error.message}`
      );
    }
    return data;
  }

  async listTradingViewCandidates(filters?: {
    strategy_id?: string;
    strategy_version_id?: string;
    symbol?: string;
    status?: string;
    limit?: number;
  }) {
    let query = this.client.from("tradingview_candidates").select("*");
    if (filters?.strategy_id) query = query.eq("strategy_id", filters.strategy_id);
    if (filters?.strategy_version_id) {
      query = query.eq("strategy_version_id", filters.strategy_version_id);
    }
    if (filters?.symbol) query = query.eq("symbol", filters.symbol);
    if (filters?.status) query = query.eq("status", filters.status);
    query = query.order("received_at", { ascending: false });
    if (filters?.limit) query = query.limit(filters.limit);
    const { data, error } = await query;
    if (error) {
      throwIfMissingPhase4Schema("tradingview_candidates", error.message);
      throw new Phase4PersistenceError(
        `Failed to list tradingview candidates: ${error.message}`
      );
    }
    return data || [];
  }

  async insertTradingViewDeployment(row: {
    strategy_id: string;
    strategy_version_id: string;
    snapshot_hash: string;
    symbol: string;
    timeframe: string;
    pine_script: string;
    pine_version: string;
    compile_status: string;
    alert_status: string;
    alert_instructions: string | null;
    webhook_url: string | null;
    verification: unknown;
  }) {
    const { data, error } = await this.client
      .from("tradingview_deployments")
      .insert([row])
      .select()
      .single();
    if (error) {
      throwIfMissingPhase4Schema("tradingview_deployments", error.message);
      throw new Phase4PersistenceError(
        `Failed to insert tradingview deployment: ${error.message}`
      );
    }
    return data;
  }

}

/**
 * Get database service instance
 * Uses environment variables for Supabase credentials
 */
export function getDB(): DatabaseService {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  return new DatabaseService(url, key);
}
