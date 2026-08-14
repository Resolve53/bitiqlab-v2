import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { enrichCandidate } from "../enrich";
import { EnrichmentError, EnrichmentPersistenceError } from "../errors";
import * as scoreMod from "../score";
import { vi } from "vitest";
import {
  TOKEN,
  NOW_MS,
  fixtureProviders,
  seedCandidate,
} from "./helpers";

describe("E. Persistence / retries", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  it("snapshots are append-only (retry creates a new enrichment_version)", async () => {
    const { deps, candidate, intel } = await seedCandidate();
    const first = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders(),
    });
    expect(first.enrichment_version).toBe(1);
    const second = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders(),
    });
    expect(second.enrichment_version).toBe(2);
    expect(intel.snapshots).toHaveLength(2);
    expect(intel.snapshots[0].enrichment_version).toBe(1);
    expect(intel.snapshots[1].enrichment_version).toBe(2);
    expect(intel.snapshots[0].intelligence).toEqual(first.snapshot);
    expect(intel.rows[0].status).toBe("READY_FOR_AI_REVIEW");
  });

  it("successful snapshot is not silently overwritten", async () => {
    const { deps, candidate, intel } = await seedCandidate();
    await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders(),
    });
    const v1 = structuredClone(intel.snapshots[0]);
    await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders({ coinapiHealth: "PARTIAL" }),
    });
    expect(intel.snapshots[0]).toEqual(v1);
    expect(intel.snapshots[1].enrichment_version).toBe(2);
  });

  it("persistence failure fails closed (no success, status ENRICHMENT_FAILED)", async () => {
    const { deps, candidate, intel } = await seedCandidate();
    intel.failInsert = true;
    await expect(
      enrichCandidate(deps, candidate.id, {
        nowMs: NOW_MS,
        providers: fixtureProviders(),
      })
    ).rejects.toBeInstanceOf(EnrichmentPersistenceError);
    expect(intel.snapshots).toHaveLength(0);
    expect(intel.rows[0].status).toBe("ENRICHMENT_FAILED");
  });

  it("score engine failure does not fake a score and marks ENRICHMENT_FAILED", async () => {
    const { deps, candidate, intel } = await seedCandidate();
    vi.spyOn(scoreMod, "scoreIntelligence").mockImplementation(() => {
      throw new Error("score boom");
    });
    await expect(
      enrichCandidate(deps, candidate.id, {
        nowMs: NOW_MS,
        providers: fixtureProviders(),
      })
    ).rejects.toBeInstanceOf(EnrichmentError);
    expect(intel.snapshots).toHaveLength(0);
    expect(intel.rows[0].status).toBe("ENRICHMENT_FAILED");
  });

  it("observability records latency, retries, and provider outcomes", async () => {
    const { deps, candidate } = await seedCandidate();
    const result = await enrichCandidate(deps, candidate.id, {
      nowMs: NOW_MS,
      providers: fixtureProviders(),
    });
    expect(result.observability.engine).toBe("candidate_intelligence_v1");
    expect(result.observability.total_latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.observability.calls.length).toBeGreaterThan(0);
    expect(result.observability.calls.every((c) => typeof c.retries === "number")).toBe(
      true
    );
  });
});
