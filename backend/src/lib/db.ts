/**
 * Supabase Database Service
 * Handles all database operations for Bitiq Lab
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Strategy, BacktestRun, Trade, PaperTradingSession } from "../../core";

export type Database = {
  public: {
    Tables: {
      strategies: {
        Row: Strategy;
        Insert: Omit<Strategy, "id" | "created_at" | "updated_at">;
        Update: Partial<Strategy>;
      };
      backtest_runs: {
        Row: BacktestRun;
        Insert: Omit<BacktestRun, "id" | "created_at">;
        Update: Partial<BacktestRun>;
      };
      trades: {
        Row: Trade;
        Insert: Omit<Trade, "id" | "created_at">;
        Update: Partial<Trade>;
      };
      paper_trading_sessions: {
        Row: PaperTradingSession;
        Insert: Omit<PaperTradingSession, "id" | "created_at" | "updated_at">;
        Update: Partial<PaperTradingSession>;
      };
    };
  };
};

/**
 * Database Service
 * Provides typed access to Supabase
 */
export class DatabaseService {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient<Database>(supabaseUrl, supabaseKey);
  }

  /**
   * Strategy Operations
   */
  async createStrategy(strategy: Omit<Strategy, "id" | "created_at" | "updated_at">) {
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
  }) {
    let query = this.client.from("strategies").select("*");

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.symbol) query = query.eq("symbol", filters.symbol);
    if (filters?.created_by) query = query.eq("created_by", filters.created_by);

    const { data, error } = await query.order("updated_at", { ascending: false });

    if (error) throw new Error(`Failed to list strategies: ${error.message}`);
    return data as Strategy[];
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
  async createBacktestRun(backtest: Omit<BacktestRun, "id" | "created_at">) {
    const { data, error } = await this.client
      .from("backtest_runs")
      .insert([
        {
          ...backtest,
          created_at: new Date(),
        },
      ])
      .select()
      .single();

    if (error) throw new Error(`Failed to create backtest run: ${error.message}`);
    return data as BacktestRun;
  }

  async getBacktestRun(id: string) {
    const { data, error } = await this.client
      .from("backtest_runs")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(`Failed to get backtest run: ${error.message}`);
    return data as BacktestRun;
  }

  async listBacktestRuns(strategyId: string) {
    const { data, error } = await this.client
      .from("backtest_runs")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list backtest runs: ${error.message}`);
    return data as BacktestRun[];
  }

  /**
   * Trade Operations
   */
  async createTrade(trade: Omit<Trade, "id" | "created_at">) {
    const { data, error } = await this.client
      .from("trades")
      .insert([
        {
          ...trade,
          created_at: new Date(),
        },
      ])
      .select()
      .single();

    if (error) throw new Error(`Failed to create trade: ${error.message}`);
    return data as Trade;
  }

  async listTrades(sessionId: string) {
    const { data, error } = await this.client
      .from("trades")
      .select("*")
      .eq("session_id", sessionId)
      .order("entry_time", { ascending: false });

    if (error) throw new Error(`Failed to list trades: ${error.message}`);
    return data as Trade[];
  }

  /**
   * Paper Trading Operations
   */
  async createPaperTradingSession(
    session: Omit<PaperTradingSession, "id" | "created_at" | "updated_at">
  ) {
    const { data, error } = await this.client
      .from("paper_trading_sessions")
      .insert([
        {
          ...session,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ])
      .select()
      .single();

    if (error)
      throw new Error(`Failed to create paper trading session: ${error.message}`);
    return data as PaperTradingSession;
  }

  async getPaperTradingSession(id: string) {
    const { data, error } = await this.client
      .from("paper_trading_sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (error)
      throw new Error(`Failed to get paper trading session: ${error.message}`);
    return data as PaperTradingSession;
  }

  async listPaperTradingSessions(filters?: {
    strategy_id?: string;
    status?: string;
  }) {
    let query = this.client.from("paper_trading_sessions").select("*");

    if (filters?.strategy_id) query = query.eq("strategy_id", filters.strategy_id);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query.order("start_date", { ascending: false });

    if (error)
      throw new Error(`Failed to list paper trading sessions: ${error.message}`);
    return data as PaperTradingSession[];
  }

  async updatePaperTradingSession(
    id: string,
    updates: Partial<PaperTradingSession>
  ) {
    const { data, error } = await this.client
      .from("paper_trading_sessions")
      .update({
        ...updates,
        updated_at: new Date(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to update paper trading session: ${error.message}`);
    return data as PaperTradingSession;
  }

  /**
   * Audit Log Operations
   */
  async createAuditLog(log: {
    action: string;
    entity_type: string;
    entity_id?: string;
    user_id?: string;
    old_values?: Record<string, any>;
    new_values?: Record<string, any>;
    description?: string;
  }) {
    const { data, error } = await this.client
      .from("audit_logs")
      .insert([
        {
          ...log,
          timestamp: new Date(),
        },
      ])
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

    // Get active paper trading sessions
    const { count: activePaperTradingCount } = await this.client
      .from("paper_trading_sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    // Get approved strategies
    const { count: approvedCount } = await this.client
      .from("strategies")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");

    return {
      total_strategies: strategyCount || 0,
      active_paper_trading: activePaperTradingCount || 0,
      approved_strategies: approvedCount || 0,
      timestamp: new Date(),
    };
  }

  /**
   * Strategy Performance Summary
   */
  async getStrategyPerformance(strategyId: string) {
    const { data, error } = await this.client
      .from("backtest_runs")
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
