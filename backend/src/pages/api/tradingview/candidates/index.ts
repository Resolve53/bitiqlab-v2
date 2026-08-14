/**
 * POST /api/tradingview/candidates — TradingView detector webhook (no execution)
 * GET  /api/tradingview/candidates — list stored candidates
 *
 * TradingView typically POSTs text/plain JSON. Raw body is parsed manually.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getDB } from "@/lib/db";
import {
  sendSuccess,
  sendError,
  asyncHandler,
  handleCORSPreflight,
  RateLimiter,
} from "@/lib/utils";
import {
  CandidateValidationError,
  ingestTradingViewCandidate,
  TradingViewPipelinePersistenceError,
  MAX_WEBHOOK_BYTES,
  WEBHOOK_RATE_MAX,
  WEBHOOK_RATE_WINDOW_MS,
} from "@/tradingview-pipeline";
import { Phase4PersistenceError } from "@/paper-forward";

export const config = {
  api: {
    bodyParser: false,
  },
};

const limiter = new RateLimiter(WEBHOOK_RATE_WINDOW_MS, WEBHOOK_RATE_MAX);

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_WEBHOOK_BYTES) {
      throw new CandidateValidationError(
        `Payload exceeds ${MAX_WEBHOOK_BYTES} bytes`,
        "PAYLOAD_TOO_LARGE",
        413
      );
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function clientKey(req: NextApiRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function asDeps(db: ReturnType<typeof getDB>) {
  return {
    getStrategyVersionById: (id: string) => db.getStrategyVersionById(id),
    insertTradingViewCandidate: (row: Parameters<typeof db.insertTradingViewCandidate>[0]) =>
      db.insertTradingViewCandidate(row),
    getTradingViewCandidateByNaturalKey: (
      key: Parameters<typeof db.getTradingViewCandidateByNaturalKey>[0]
    ) => db.getTradingViewCandidateByNaturalKey(key),
    getTradingViewCandidateByCandidateId: (id: string) =>
      db.getTradingViewCandidateByCandidateId(id),
  };
}

function publicCandidate(row: Record<string, unknown>) {
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    strategy_id: row.strategy_id,
    strategy_version_id: row.strategy_version_id,
    snapshot_hash: row.snapshot_hash,
    symbol: row.symbol,
    timeframe: row.timeframe,
    direction: row.direction,
    signal_candle_ts: row.signal_candle_ts,
    entry: row.entry,
    stop_loss: row.stop_loss,
    take_profits: row.take_profits,
    pine_version: row.pine_version,
    source: row.source,
    status: row.status,
    received_at: row.received_at,
    created_at: row.created_at,
  };
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (handleCORSPreflight(req, res)) return;

  if (req.method === "GET") {
    try {
      const db = getDB();
      const rows = await db.listTradingViewCandidates({
        strategy_id: req.query.strategy_id ? String(req.query.strategy_id) : undefined,
        strategy_version_id: req.query.strategy_version_id
          ? String(req.query.strategy_version_id)
          : undefined,
        symbol: req.query.symbol ? String(req.query.symbol) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
      });
      return sendSuccess(
        res,
        { candidates: rows.map((r) => publicCandidate(r as Record<string, unknown>)) },
        200,
        req
      );
    } catch (error) {
      if (error instanceof Phase4PersistenceError) {
        return sendError(res, error.message, 503, req);
      }
      throw error;
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return sendError(res, "Method not allowed", 405, req);
  }

  if (!limiter.isAllowed(clientKey(req))) {
    return sendError(res, "Rate limit exceeded", 429, req);
  }

  try {
    const rawBody = await (async () => {
      if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
        return JSON.stringify(req.body);
      }
      return readRawBody(req);
    })();
    let body: unknown = req.body;
    if (body == null || typeof body === "string" || Buffer.isBuffer(body)) {
      const trimmed = rawBody.trim();
      if (trimmed) {
        try {
          body = JSON.parse(trimmed);
        } catch {
          body = rawBody;
        }
      }
    }

    const db = getDB();
    const result = await ingestTradingViewCandidate(asDeps(db), {
      body,
      rawBody,
      query: req.query as Record<string, unknown>,
      headers: req.headers as Record<string, unknown>,
    });

    return sendSuccess(
      res,
      {
        duplicate: result.duplicate,
        executed: false,
        candidate: publicCandidate(result.candidate as unknown as Record<string, unknown>),
      },
      result.duplicate ? 200 : 201,
      req
    );
  } catch (error) {
    if (error instanceof CandidateValidationError) {
      return sendError(res, error.message, error.statusCode, req);
    }
    if (
      error instanceof TradingViewPipelinePersistenceError ||
      error instanceof Phase4PersistenceError
    ) {
      return sendError(res, error.message, 503, req);
    }
    throw error;
  }
});
