/**
 * POST /api/tradingview/deploy
 *
 * Generate Pine from frozen strategy version, MCP-deploy, compile, verify.
 * Never returns monitoring_complete=true from compile alone.
 * Detector only — no exchange or live execution.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
} from "@/lib/utils";
import {
  CandidateValidationError,
  deployFrozenPine,
  McpDeployError,
  PineAuthorityError,
} from "@/tradingview-pipeline";
import { Phase3PersistenceError } from "@/research-engine/persistence-errors";
import { Phase4PersistenceError } from "@/paper-forward";

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  const body = req.body || {};
  try {
    const db = getDB();
    const result = await deployFrozenPine(
      {
        getStrategyVersionById: (id) => db.getStrategyVersionById(id),
        insertTradingViewDeployment: (row) => db.insertTradingViewDeployment(row),
      },
      {
        strategy_id: body.strategy_id || body.strategyId,
        strategy_version_id: body.strategy_version_id || body.strategyVersionId,
        snapshot_hash: body.snapshot_hash || body.snapshotHash,
        symbol: body.symbol,
        timeframe: body.timeframe,
      }
    );

    const httpStatus =
      result.deploy.compiled && result.deploy.verified ? 200 : 422;

    return sendSuccess(
      res,
      {
        pine: {
          strategy_id: result.pine.strategy_id,
          strategy_version_id: result.pine.strategy_version_id,
          snapshot_hash: result.pine.snapshot_hash,
          symbol: result.pine.symbol,
          timeframe: result.pine.timeframe,
          pine_version: result.pine.pine_version,
          engine: result.pine.engine,
          pine_script: result.pine.pine_script,
          webhook_url: result.pine.webhook_url,
        },
        deploy: result.deploy,
        deployment_id: result.deployment?.id ?? null,
        monitoring_complete: result.deploy.monitoring_complete,
        notice:
          "Compiled Pine is not TradingView monitoring. monitoring_complete requires a real candle-close alert plus one persisted candidate.",
      },
      httpStatus,
      req
    );
  } catch (error) {
    if (error instanceof PineAuthorityError || error instanceof CandidateValidationError) {
      return sendError(res, error.message, 400, req);
    }
    if (error instanceof McpDeployError) {
      return sendError(res, error.message, 422, req);
    }
    if (
      error instanceof Phase3PersistenceError ||
      error instanceof Phase4PersistenceError
    ) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
