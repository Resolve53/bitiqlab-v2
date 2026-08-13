/**
 * POST /api/backtest/validate
 * Phase 2 — real Validation & Anti-Overfitting Engine (Truth Engine only).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import { runValidation } from "@/validation-engine";
import {
  StrategyValidationError,
  MarketDataError,
} from "@/truth-engine";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  try {
    const body = req.body || {};
    const strategyId = body.strategyId || body.strategy_id;
    if (!strategyId || typeof strategyId !== "string") {
      return sendError(res, "Missing required field: strategyId", 400, req);
    }

    const db = getDB();
    const strategy = await db.getStrategy(strategyId);
    if (!strategy) {
      return sendError(res, "Strategy not found", 404, req);
    }

    const report = await runValidation({
      strategy,
      request: {
        strategyId,
        symbol: body.symbol,
        timeframe: body.timeframe,
        startDate: body.startDate || body.start_date,
        endDate: body.endDate || body.end_date,
        window: body.window,
        initialCapital: body.initialCapital ?? body.initial_capital,
        commissionPct: body.commissionPct ?? body.commission_pct,
        slippagePct: body.slippagePct ?? body.slippage_pct,
        config: body.config,
      },
    });

    const saved = await db.createStrategyValidation({
      strategy_id: strategy.id,
      strategy_version: report.strategyVersion,
      strategy_snapshot: report.strategyDefinitionSnapshot,
      status: report.gate.status,
      gate: report.gate,
      report,
      dataset_provenance: report.dataset,
      symbol: report.dataset.symbol,
      timeframe: report.dataset.timeframe,
    });

    await db.createStrategyAuditLog({
      strategy_id: strategy.id,
      action: "VALIDATE",
      new_values: {
        validation_id: saved?.id,
        status: report.gate.status,
        reasons: report.gate.reasons,
      },
      changed_by: "system",
    });

    return sendSuccess(
      res,
      {
        validation_id: saved?.id,
        label: "Phase 2 Strategy Validation",
        result_source: "REAL_VALIDATION",
        status: report.gate.status,
        reasons: report.gate.reasons,
        score: report.gate.score,
        checks: report.gate.checks,
        chronological: report.chronological,
        walkForward: report.walkForward,
        sensitivity: {
          positiveExpectancyPct: report.sensitivity.positiveExpectancyPct,
          variantCount: report.sensitivity.variants.length,
          variants: report.sensitivity.variants,
        },
        costStress: report.costStress,
        regimes: report.regimes,
        crossAsset: report.crossAsset,
        sampleIntegrity: report.sampleIntegrity,
        dataset: report.dataset,
        timestamp: report.timestamp,
        report,
      },
      200,
      req
    );
  } catch (error) {
    console.error("Validation error:", error);
    if (
      error instanceof StrategyValidationError ||
      error instanceof MarketDataError
    ) {
      return sendError(res, error.message, 400, req);
    }
    return sendError(
      res,
      error instanceof Error ? error.message : "Validation failed",
      500,
      req
    );
  }
});
