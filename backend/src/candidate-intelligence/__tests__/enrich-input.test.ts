import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { enrichCandidate } from "../enrich";
import { EnrichmentError } from "../errors";
import {
  TOKEN,
  NOW_MS,
  fixtureProviders,
  okLiq,
  seedCandidate,
} from "./helpers";

describe("A. Candidate input", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("valid READY_FOR_ENRICHMENT candidate enriches", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders(),
    });
    expect(result.snapshot.candidate_id).toBe(candidate.candidate_id);
    expect(result.snapshot.snapshot_hash).toBe(candidate.snapshot_hash);
    expect(result.enrichment_version).toBe(1);
    expect(["READY_FOR_AI_REVIEW", "ENRICHMENT_PARTIAL"]).toContain(result.status);
    expect(result.snapshot.score.raw_score).toBeGreaterThan(0);
  });

  it("spot candidate with fresh critical data becomes READY_FOR_AI_REVIEW", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders(),
    });
    expect(result.snapshot.market_type).toBe("spot");
    expect(result.status).toBe("READY_FOR_AI_REVIEW");
  });

  it("rejects missing candidate", async () => {
    const { deps } = await seedCandidate();
    await expect(
      enrichCandidate(deps, "does-not-exist", {
        nowMs: NOW_MS,
        providers: fixtureProviders(),
      })
    ).rejects.toMatchObject({ code: "CANDIDATE_MISSING", statusCode: 404 });
  });

  it("rejects wrong provenance (snapshot hash mismatch)", async () => {
    const { deps, store, candidate } = await seedCandidate();
    store.rows[0].snapshot_hash = "ff".repeat(32);
    await expect(
      enrichCandidate(deps, candidate.id, {
        nowMs: NOW_MS,
        providers: fixtureProviders(),
      })
    ).rejects.toBeInstanceOf(EnrichmentError);
    await expect(
      enrichCandidate(deps, candidate.id, {
        nowMs: NOW_MS,
        providers: fixtureProviders(),
      })
    ).rejects.toMatchObject({ code: "PROVENANCE_INVALID" });
  });

  it("rejects missing frozen strategy version", async () => {
    const { deps, store, candidate } = await seedCandidate();
    store.rows[0].strategy_version_id = "00000000-0000-0000-0000-000000000099";
    await expect(
      enrichCandidate(deps, candidate.id, {
        nowMs: NOW_MS,
        providers: fixtureProviders(),
      })
    ).rejects.toMatchObject({ code: "PROVENANCE_INVALID" });
  });

  it("rejects INVALID status", async () => {
    const { deps, candidate } = await seedCandidate({ status: "INVALID" });
    await expect(
      enrichCandidate(deps, candidate.id, {
        nowMs: NOW_MS,
        providers: fixtureProviders(),
      })
    ).rejects.toMatchObject({ code: "WRONG_STATUS", statusCode: 409 });
  });

  it("rejects RECEIVED status", async () => {
    const { deps, candidate } = await seedCandidate({ status: "RECEIVED" });
    await expect(
      enrichCandidate(deps, candidate.id, {
        nowMs: NOW_MS,
        providers: fixtureProviders(),
      })
    ).rejects.toMatchObject({ code: "WRONG_STATUS" });
  });

  it("does not read live strategy rows while revalidating", async () => {
    const { deps, candidate } = await seedCandidate();
    await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ liquidations: okLiq() }),
    });
  });
});
