/**
 * Supabase Database Service
 * Handles all database operations for Bitiq Lab
 * Aligned with 004_bitiqlab_complete_schema.sql
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Strategy, CreateStrategyRequest } from "../core";

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
