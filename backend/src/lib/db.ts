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
      entry_rules: input.entry_rules || null,
      exit_rules: input.exit_rules || null,
      status: "draft",
      current_sharpe: 0,
      backtest_count: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_return: 0,
      max_drawdown: 0,
      win_rate: 0,
      confidence_score: 0,
      ai_enhancement: null,
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
  }) {
    const { data, error } = await this.client
      .from("backtests")
      .insert([{ ...backtest, status: "completed" }])
      .select()
      .single();

    if (error) throw new Error(`Failed to create backtest: ${error.message}`);
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
