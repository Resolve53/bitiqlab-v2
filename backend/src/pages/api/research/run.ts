/**
 * POST /api/research/run
 * Phase 3 — Controlled Autoresearch.
 * Never starts paper/live trading. Never overwrites active strategy rules.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import { isExecutableStrategyRules } from "@/lib/claude-strategy-schema";
import {
  runControlledResearch,
  Phase3PersistenceError,
  type ResearchPersistence,
} from "@/research-engine";
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

    if (!isExecutableStrategyRules(strategy)) {
      return sendError(
        res,
        "Strategy is not Truth Engine executable. Regenerate before research.",
        400,
        req
      );
    }

    const limits = body.limits || {};
    const persistence: ResearchPersistence = {
      ensureBaselineVersion: async ({
        strategyId: sid,
        version,
        snapshot,
        snapshotHash,
      }) => {
        const existing = await db.getStrategyVersion(sid, version);
        if (!existing) {
          await db.createStrategyVersion({
            strategy_id: sid,
            version,
            parent_version: null,
            source: "research_baseline",
            strategy_snapshot: snapshot,
            snapshot_hash: snapshotHash,
            notes: "Baseline snapshot at research start",
          });
        }
      },
      createResearchRun: async (row) => {
        const created = await db.createResearchRun(row);
        if (!created?.id) {
          throw new Phase3PersistenceError(
            "createResearchRun returned no persisted id"
          );
        }
        return { id: String(created.id) };
      },
      updateResearchRun: async (id, updates) => {
        await db.updateResearchRun(id, updates);
      },
      appendExperiment: async (row) => {
        await db.appendResearchExperiment(row);
      },
      createStrategyVersion: async (row) => {
        await db.createStrategyVersion(row);
      },
    };

    // Capture active rules before research to prove no overwrite
    const entryBefore = JSON.stringify(strategy.entry_rules ?? null);
    const exitBefore = JSON.stringify(strategy.exit_rules ?? null);

    const result = await runControlledResearch({
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
        config: {
          maxGenerations: limits.maxGenerations,
          maxCandidates: limits.maxCandidates,
          maxClaudeCalls: limits.maxClaudeCalls ?? limits.maxCandidates,
          ...body.config,
        },
        runFinalValidation: async (champion, bars) => {
          const report = await runValidation({
            strategy: {
              id: champion.id,
              name: champion.name,
              symbol: champion.symbol,
              timeframe: champion.timeframe,
              market_type: champion.market_type,
              entry_rules: champion.entry_rules,
              exit_rules: champion.exit_rules,
              version: champion.version,
            },
            request: {
              strategyId: champion.id,
              bars,
              initialCapital: body.initialCapital ?? 10_000,
              commissionPct: body.commissionPct ?? 0.05,
              slippagePct: body.slippagePct ?? 0.02,
            },
          });
          const saved = await db.createStrategyValidation({
            strategy_id: strategy.id,
            strategy_version: champion.version,
            strategy_snapshot: champion,
            status: report.gate.status,
            gate: report.gate,
            report,
            dataset_provenance: report.dataset,
            symbol: report.dataset.symbol,
            timeframe: report.dataset.timeframe,
          });
          return {
            validationId: saved?.id ?? null,
            status: report.gate.status,
            reasons: report.gate.reasons,
            score: report.gate.score,
            chronologicalTestMetrics: report.chronological.test.metrics,
          };
        },
      },
      persistence,
    });

    // Hard boundary: active strategy rules unchanged
    const still = await db.getStrategy(strategyId);
    if (
      JSON.stringify(still?.entry_rules ?? null) !== entryBefore ||
      JSON.stringify(still?.exit_rules ?? null) !== exitBefore
    ) {
      console.error(
        "CRITICAL: research mutated active strategy rules — this is a bug"
      );
      return sendError(
        res,
        "Research aborted: active strategy was mutated (safety boundary)",
        500,
        req
      );
    }

    await db.createStrategyAuditLog({
      strategy_id: strategy.id,
      action: "RESEARCH_RUN",
      new_values: {
        research_run_id: result.researchRunId,
        outcome: result.outcome,
        status: result.status,
        champion_version: result.champion.version,
        final_validation: result.finalValidation?.status ?? null,
        auto_activated: false,
        auto_paper: false,
      },
      changed_by: "system",
    });

    return sendSuccess(
      res,
      {
        label: "Phase 3 Controlled Autoresearch",
        result_source: "REAL_RESEARCH",
        activation_note:
          "Research results do not automatically activate or paper-trade a strategy.",
        ...result,
      },
      200,
      req
    );
  } catch (error) {
    console.error("Research error:", error);
    if (error instanceof Phase3PersistenceError) {
      return sendError(res, error.message, 503, req);
    }
    if (
      error instanceof StrategyValidationError ||
      error instanceof MarketDataError
    ) {
      return sendError(res, error.message, 400, req);
    }
    return sendError(
      res,
      error instanceof Error ? error.message : "Research failed",
      500,
      req
    );
  }
});
