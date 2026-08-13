/**
 * Promote validated Lab strategies to the external Bitiq live pipeline.
 */

import axios from "axios";
import crypto from "crypto";
import { getDB } from "./db";
import type { Strategy } from "../core";
import {
  PROMOTION_AUTO_DISABLED,
  PROMOTION_FORCE_DISABLED,
} from "./trading-safety";

export type BitiqPromotionStatus =
  | "pending"
  | "sent"
  | "acknowledged"
  | "live"
  | "failed"
  | "stopped";

export interface PromotionCriteria {
  minTrades: number;
  minSharpe: number;
  maxDrawdown: number;
  minWinRate: number;
  minPaperDays: number;
  requireApprovedStatus: boolean;
}

export interface PromotionReadiness {
  ready: boolean;
  blockers: string[];
  criteria: PromotionCriteria;
  metrics: {
    totalTrades: number;
    winRate: number;
    sharpe: number;
    maxDrawdown: number;
    paperDays: number;
    status: string;
    deployedToBitiq: boolean;
  };
}

export interface PromoteToBitiqOptions {
  strategyId: string;
  sessionId?: string;
  promotedBy?: string;
  notes?: string;
  force?: boolean;
}

export interface PromoteToBitiqResult {
  success: boolean;
  strategyId: string;
  promotionId?: string;
  deployedToBitiq: boolean;
  webhookSent: boolean;
  bitiqStrategyId?: string;
  readiness: PromotionReadiness;
  message: string;
  error?: string;
}

function getCriteria(): PromotionCriteria {
  return {
    minTrades: parseInt(process.env.BITIQ_PROMOTION_MIN_TRADES || "30", 10),
    minSharpe: parseFloat(process.env.BITIQ_PROMOTION_MIN_SHARPE || "0.5"),
    maxDrawdown: parseFloat(process.env.BITIQ_PROMOTION_MAX_DRAWDOWN || "0.25"),
    minWinRate: parseFloat(process.env.BITIQ_PROMOTION_MIN_WIN_RATE || "0.5"),
    minPaperDays: parseInt(process.env.BITIQ_PROMOTION_MIN_PAPER_DAYS || "14", 10),
    requireApprovedStatus:
      process.env.BITIQ_PROMOTION_REQUIRE_APPROVED !== "false",
  };
}

function normalizeWinRate(value: number): number {
  if (value > 1) return value / 100;
  return value;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  );
}

export async function evaluatePromotionReadiness(
  strategyId: string,
  sessionId?: string
): Promise<PromotionReadiness> {
  const db = getDB();
  const criteria = getCriteria();
  const strategy = await db.getStrategy(strategyId);
  const blockers: string[] = [];

  if (strategy.deployed_to_bitiq) {
    blockers.push("Strategy is already deployed to Bitiq");
  }

  if (criteria.requireApprovedStatus && strategy.status !== "approved") {
    blockers.push(`Strategy status must be approved (current: ${strategy.status})`);
  }

  const totalTrades =
    (strategy.winning_trades || 0) + (strategy.losing_trades || 0);
  const winRate =
    totalTrades > 0
      ? (strategy.winning_trades || 0) / totalTrades
      : normalizeWinRate(Number(strategy.win_rate || 0));

  let paperDays = 0;
  let sessionTrades = totalTrades;

  let targetSession: {
    id?: string;
    start_time?: string;
    created_at?: string;
    total_trades?: number;
    win_rate?: number;
    total_pnl?: number;
    is_testnet?: boolean;
  } | undefined;
  if (sessionId) {
    try {
      targetSession = await db.getTradingSession(sessionId);
    } catch {
      blockers.push("Paper trading session not found");
    }
  } else {
    const sessions = await db.listTradingSessions({ strategy_id: strategyId });
    targetSession = sessions[0];
  }

  if (targetSession) {
    const start = new Date(targetSession.start_time || targetSession.created_at || Date.now());
    paperDays = daysBetween(start, new Date());
    sessionTrades = targetSession.total_trades ?? sessionTrades;

    if (sessionTrades < criteria.minTrades) {
      blockers.push(
        `Need at least ${criteria.minTrades} paper trades (session has ${sessionTrades})`
      );
    }
    if (paperDays < criteria.minPaperDays) {
      blockers.push(
        `Need at least ${criteria.minPaperDays} days of paper trading (has ${paperDays})`
      );
    }
  } else if (totalTrades < criteria.minTrades) {
    blockers.push(
      `Need at least ${criteria.minTrades} trades on strategy record (has ${totalTrades})`
    );
  }

  const sharpe = Number(strategy.current_sharpe || 0);
  const maxDrawdown = Math.abs(Number(strategy.max_drawdown || 0));

  if (sharpe < criteria.minSharpe) {
    blockers.push(
      `Sharpe ${sharpe.toFixed(2)} below minimum ${criteria.minSharpe}`
    );
  }
  if (maxDrawdown > criteria.maxDrawdown) {
    blockers.push(
      `Max drawdown ${maxDrawdown.toFixed(2)} exceeds limit ${criteria.maxDrawdown}`
    );
  }
  if (winRate < criteria.minWinRate) {
    blockers.push(
      `Win rate ${(winRate * 100).toFixed(1)}% below minimum ${(criteria.minWinRate * 100).toFixed(0)}%`
    );
  }

  return {
    ready: blockers.length === 0,
    blockers,
    criteria,
    metrics: {
      totalTrades: sessionTrades || totalTrades,
      winRate,
      sharpe,
      maxDrawdown,
      paperDays,
      status: strategy.status,
      deployedToBitiq: Boolean(strategy.deployed_to_bitiq),
    },
  };
}

function signPayload(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function buildWebhookPayload(
  strategy: Strategy,
  readiness: PromotionReadiness,
  options: PromoteToBitiqOptions,
  session?: Record<string, unknown>
) {
  const callbackBase =
    process.env.BITIQ_CALLBACK_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

  return {
    event: "strategy.promote",
    source: "bitiqlab",
    timestamp: new Date().toISOString(),
    strategy: {
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      market_type: strategy.market_type,
      entry_rules: strategy.entry_rules,
      exit_rules: strategy.exit_rules,
      status: strategy.status,
      metrics: {
        sharpe: strategy.current_sharpe,
        win_rate: strategy.win_rate,
        max_drawdown: strategy.max_drawdown,
        total_return: strategy.total_return,
        winning_trades: strategy.winning_trades,
        losing_trades: strategy.losing_trades,
      },
    },
    paper_trading: session
      ? {
          session_id: session.id,
          total_trades: session.total_trades,
          win_rate: session.win_rate,
          total_pnl: session.total_pnl,
          is_testnet: session.is_testnet,
        }
      : null,
    readiness: {
      ready: readiness.ready,
      blockers: readiness.blockers,
      metrics: readiness.metrics,
    },
    promotion: {
      promoted_by: options.promotedBy || "system",
      notes: options.notes || null,
      force: Boolean(options.force),
    },
    callback_url: `${callbackBase.replace(/\/$/, "")}/api/bitiq/webhook`,
  };
}

async function sendBitiqWebhook(payload: object): Promise<{
  sent: boolean;
  response?: unknown;
  bitiqStrategyId?: string;
  error?: string;
}> {
  const url = process.env.BITIQ_WEBHOOK_URL;
  if (!url) {
    return { sent: false, error: "BITIQ_WEBHOOK_URL not configured" };
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Bitiq-Event": "strategy.promote",
    "X-Bitiq-Source": "bitiqlab",
  };

  const secret = process.env.BITIQ_WEBHOOK_SECRET;
  if (secret) {
    headers["X-Bitiq-Signature"] = signPayload(body, secret);
    headers.Authorization = `Bearer ${secret}`;
  }

  try {
    const response = await axios.post(url, payload, {
      headers,
      timeout: 20000,
    });

    const data = response.data as Record<string, unknown>;
    const bitiqStrategyId =
      (data.bitiq_strategy_id as string) ||
      (data.strategy_id as string) ||
      (data.id as string);

    return {
      sent: true,
      response: data,
      bitiqStrategyId,
    };
  } catch (error) {
    const message =
      axios.isAxiosError(error)
        ? `${error.response?.status || ""} ${error.response?.data?.message || error.message}`
        : error instanceof Error
          ? error.message
          : "Webhook request failed";
    return { sent: false, error: message.trim() };
  }
}

/**
 * Phase 4A: Bitiq promotion is fail-closed.
 * Force bypass and automatic deployment are disabled.
 * Readiness is still evaluated for status endpoints.
 */
export async function promoteStrategyToBitiq(
  options: PromoteToBitiqOptions
): Promise<PromoteToBitiqResult> {
  const readiness = await evaluatePromotionReadiness(
    options.strategyId,
    options.sessionId
  );

  if (options.force) {
    return {
      success: false,
      strategyId: options.strategyId,
      deployedToBitiq: false,
      webhookSent: false,
      readiness,
      message: PROMOTION_FORCE_DISABLED,
      error: PROMOTION_FORCE_DISABLED,
    };
  }

  if (!readiness.ready) {
    return {
      success: false,
      strategyId: options.strategyId,
      deployedToBitiq: false,
      webhookSent: false,
      readiness,
      message: "Promotion blocked: readiness criteria not met",
      error: readiness.blockers.join("; "),
    };
  }

  // Even when readiness passes, Phase 4A does not auto-promote to Bitiq.
  // Fail-open webhook behavior is intentionally unreachable.
  return {
    success: false,
    strategyId: options.strategyId,
    deployedToBitiq: false,
    webhookSent: false,
    readiness,
    message: PROMOTION_AUTO_DISABLED,
    error: PROMOTION_AUTO_DISABLED,
  };
}

export async function handleBitiqWebhookEvent(body: {
  event?: string;
  strategy_id?: string;
  bitiq_strategy_id?: string;
  status?: string;
  message?: string;
}): Promise<{ ok: boolean; message: string }> {
  const strategyId = body.strategy_id;
  if (!strategyId) {
    return { ok: false, message: "Missing strategy_id" };
  }

  const db = getDB();
  const promotions = await db.listBitiqPromotions(strategyId);
  const latest = promotions[0];

  const event = (body.event || body.status || "").toLowerCase();
  let promotionStatus: BitiqPromotionStatus = "acknowledged";

  if (event.includes("fail") || event.includes("error")) {
    promotionStatus = "failed";
  } else if (event.includes("live") || event.includes("active")) {
    promotionStatus = "live";
  } else if (event.includes("stop")) {
    promotionStatus = "stopped";
  } else if (event.includes("ack")) {
    promotionStatus = "acknowledged";
  }

  if (latest) {
    await db.updateBitiqPromotion(latest.id, {
      status: promotionStatus,
      bitiq_strategy_id: body.bitiq_strategy_id || latest.bitiq_strategy_id,
      webhook_response: body,
    });
  }

  if (promotionStatus === "live") {
    await db.updateStrategy(strategyId, {
      deployed_to_bitiq: true,
      deployed_at: new Date(),
    });
  }

  if (promotionStatus === "stopped" || promotionStatus === "failed") {
    await db.updateStrategy(strategyId, {
      deployed_to_bitiq: false,
    });
  }

  await db.createStrategyAuditLog({
    strategy_id: strategyId,
    action: "BITIQ_WEBHOOK",
    new_values: body,
    changed_by: "bitiq",
  });

  return {
    ok: true,
    message: body.message || `Processed Bitiq event: ${event || "update"}`,
  };
}
