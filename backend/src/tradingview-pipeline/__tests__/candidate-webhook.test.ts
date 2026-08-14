import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  ingestTradingViewCandidate,
  CandidateValidationError,
  buildCandidateId,
} from "@/tradingview-pipeline";
import {
  TOKEN,
  longFrozen,
  authorityDeps,
  memoryCandidates,
  validPayload,
} from "./helpers";

describe("E. Candidate webhook", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  function deps() {
    const frozen = longFrozen();
    const store = memoryCandidates();
    return {
      frozen,
      store,
      all: { ...authorityDeps(frozen.row), ...store },
    };
  }

  it("persists a valid candidate as READY_FOR_ENRICHMENT", async () => {
    const { frozen, store, all } = deps();
    const payload = validPayload(frozen);
    const result = await ingestTradingViewCandidate(all, {
      body: payload,
      query: { token: TOKEN },
      nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
    });
    expect(result.duplicate).toBe(false);
    expect(result.candidate.status).toBe("READY_FOR_ENRICHMENT");
    expect(result.candidate.symbol).toBe("BTCUSDT");
    expect(result.candidate.direction).toBe("LONG");
    expect(store.rows).toHaveLength(1);
    expect(result.candidate.candidate_id).toBe(
      buildCandidateId({
        strategy_version_id: payload.strategy_version_id as string,
        symbol: "BTCUSDT",
        timeframe: payload.timeframe as string,
        direction: "LONG",
        signal_candle_ts: payload.signal_candle_ts as string,
      })
    );
  });

  it("duplicate webhook retry returns success without inserting another row", async () => {
    const { frozen, store, all } = deps();
    const payload = validPayload(frozen);
    const req = {
      body: payload,
      query: { token: TOKEN },
      nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
    };
    const first = await ingestTradingViewCandidate(all, req);
    const second = await ingestTradingViewCandidate(all, req);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.candidate.id).toBe(first.candidate.id);
    expect(store.rows).toHaveLength(1);
  });

  it("rejects stale candidates", async () => {
    const { frozen, all } = deps();
    await expect(
      ingestTradingViewCandidate(all, {
        body: validPayload(frozen, {
          signal_candle_ts: "2020-01-01T00:00:00.000Z",
        }),
        query: { token: TOKEN },
        nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
      })
    ).rejects.toMatchObject({ code: "STALE_CANDIDATE" });
  });

  it("rejects wrong snapshot hash", async () => {
    const { frozen, all } = deps();
    await expect(
      ingestTradingViewCandidate(all, {
        body: validPayload(frozen, { snapshot_hash: "ab".repeat(32) }),
        query: { token: TOKEN },
        nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
      })
    ).rejects.toBeInstanceOf(CandidateValidationError);
  });

  it("rejects wrong strategy/version", async () => {
    const { frozen, all } = deps();
    await expect(
      ingestTradingViewCandidate(all, {
        body: validPayload(frozen, {
          strategy_version_id: "00000000-0000-0000-0000-000000000099",
        }),
        query: { token: TOKEN },
        nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
      })
    ).rejects.toMatchObject({ code: "STRATEGY_VERSION_MISMATCH" });
  });

  it("rejects invalid symbol", async () => {
    const { frozen, all } = deps();
    await expect(
      ingestTradingViewCandidate(all, {
        body: validPayload(frozen, { symbol: "DOGEUSDT" }),
        query: { token: TOKEN },
        nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
      })
    ).rejects.toMatchObject({ code: "INVALID_SYMBOL" });
  });

  it("rejects invalid timeframe", async () => {
    const { frozen, all } = deps();
    await expect(
      ingestTradingViewCandidate(all, {
        body: validPayload(frozen, { timeframe: "1d" }),
        query: { token: TOKEN },
        nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
      })
    ).rejects.toMatchObject({ code: "INVALID_TIMEFRAME" });
  });

  it("rejects invalid direction", async () => {
    const { frozen, all } = deps();
    await expect(
      ingestTradingViewCandidate(all, {
        body: validPayload(frozen, { direction: "BUY" }),
        query: { token: TOKEN },
        nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
      })
    ).rejects.toMatchObject({ code: "INVALID_DIRECTION" });
  });

  it("rejects missing/invalid webhook token", async () => {
    const { frozen, all } = deps();
    await expect(
      ingestTradingViewCandidate(all, {
        body: validPayload(frozen, { webhook_token: "nope" }),
        query: {},
        nowMs: new Date("2026-08-14T12:05:00.000Z").getTime(),
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });
  });
});
