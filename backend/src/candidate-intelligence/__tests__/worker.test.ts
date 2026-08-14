import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { runEnrichmentWorkerTick, summarizeHeartbeats } from "../worker";
import { isClaimEligible } from "../claim";
import { backoffMs, classifyEnrichmentOutcome, sanitizeErrorMessage } from "../retry-policy";
import { getFreshnessTtlMs, getEnrichmentWorkerConfig } from "../config";
import { EnrichmentError } from "../errors";
import {
  TOKEN,
  NOW_MS,
  fixtureProviders,
  okMarket,
  seedWorker,
} from "./helpers";

describe("Stage 2B enrichment worker", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
    process.env.ENRICHMENT_WORKER_ID = "test-worker";
    process.env.ENRICHMENT_WORKER_BATCH_SIZE = "5";
    process.env.ENRICHMENT_WORKER_CONCURRENCY = "1";
    process.env.ENRICHMENT_MAX_ATTEMPTS = "5";
    process.env.ENRICHMENT_RETRY_BASE_MS = "5000";
    process.env.ENRICHMENT_RETRY_MAX_MS = "60000";
    process.env.ENRICHMENT_STALE_LOCK_MS = "300000";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  describe("A. Worker discovery", () => {
    it("finds READY_FOR_ENRICHMENT and ignores READY_FOR_AI_REVIEW / INVALID", async () => {
      const ready = await seedWorker();
      const done = await seedWorker({ status: "READY_FOR_AI_REVIEW" });
      const invalid = await seedWorker({ status: "INVALID" });

      expect(
        isClaimEligible(ready.candidate, NOW_MS, 300_000, 5)
      ).toBe(true);
      expect(
        isClaimEligible(done.worker.rows[0], NOW_MS, 300_000, 5)
      ).toBe(false);
      expect(
        isClaimEligible(invalid.worker.rows[0], NOW_MS, 300_000, 5)
      ).toBe(false);

      const ignored = await runEnrichmentWorkerTick(done.deps, {
        nowMs: NOW_MS,
        workerId: "w-done",
        providers: fixtureProviders(),
      });
      expect(ignored.claimed).toBe(0);

      const found = await runEnrichmentWorkerTick(ready.deps, {
        nowMs: NOW_MS,
        workerId: "w-ready",
        providers: fixtureProviders(),
      });
      expect(found.claimed).toBe(1);
      expect(found.results[0]?.candidate_id).toBe(ready.candidate.candidate_id);
    });
  });

  describe("B. Claiming", () => {
    it("atomic claim: second worker cannot claim the same candidate", async () => {
      const { deps, worker } = await seedWorker();
      const [a, b] = await Promise.all([
        runEnrichmentWorkerTick(deps, {
          nowMs: NOW_MS,
          workerId: "w-a",
          providers: fixtureProviders(),
        }),
        runEnrichmentWorkerTick(deps, {
          nowMs: NOW_MS,
          workerId: "w-b",
          providers: fixtureProviders(),
        }),
      ]);
      expect(a.claimed + b.claimed).toBe(1);
      expect(worker.snapshots).toHaveLength(1);
    });
  });

  describe("C. Success", () => {
    it("candidate flows READY_FOR_ENRICHMENT → ENRICHING → READY_FOR_AI_REVIEW automatically", async () => {
      const { deps, candidate, worker } = await seedWorker();
      expect(candidate.status).toBe("READY_FOR_ENRICHMENT");
      const tick = await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-success",
        providers: fixtureProviders(),
      });
      expect(tick.claimed).toBe(1);
      expect(tick.succeeded).toBe(1);
      expect(worker.rows[0].status).toBe("READY_FOR_AI_REVIEW");
      expect(worker.snapshots).toHaveLength(1);
      expect(worker.snapshots[0].enrichment_version).toBe(1);
      expect(worker.rows[0].enrichment_completed_at).toBeTruthy();
      expect(worker.rows[0].next_retry_at).toBeNull();
    });
  });

  describe("D. Partial", () => {
    it("ENRICHMENT_PARTIAL from capability (futures liquidations) does not retry", async () => {
      const { deps, worker } = await seedWorker({ futures: true });
      const tick = await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-partial",
        providers: fixtureProviders(),
      });
      expect(worker.rows[0].status).toBe("ENRICHMENT_PARTIAL");
      expect(worker.rows[0].next_retry_at).toBeNull();
      expect(tick.failed).toBe(1);

      const again = await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS + 60_000,
        workerId: "w-partial",
        providers: fixtureProviders(),
      });
      expect(again.claimed).toBe(0);
      expect(worker.snapshots).toHaveLength(1);
    });

    it("stale critical data schedules a bounded retry", async () => {
      const { deps, worker } = await seedWorker();
      const tick = await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-stale",
        providers: fixtureProviders({ market: okMarket(NOW_MS, 45_000) }),
      });
      expect(worker.rows[0].status).toBe("ENRICHMENT_PARTIAL");
      expect(worker.rows[0].next_retry_at).toBeTruthy();
      expect(tick.failed).toBe(1);
    });
  });

  describe("E. Failure", () => {
    it("transient assemble failure schedules retry; max attempts enforced", async () => {
      process.env.ENRICHMENT_MAX_ATTEMPTS = "2";
      const { deps, worker } = await seedWorker();
      const boom = {
        ...fixtureProviders(),
        fetchBinanceMarket: async () => {
          throw new Error("timeout connecting to binance");
        },
      };

      await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-fail",
        providers: boom,
      });
      expect(worker.rows[0].status).toBe("ENRICHMENT_FAILED");
      expect(worker.rows[0].next_retry_at).toBeTruthy();
      expect(worker.rows[0].attempt_count).toBe(1);

      await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS + 10_000,
        workerId: "w-fail",
        providers: boom,
      });
      expect(worker.rows[0].attempt_count).toBe(2);
      expect(worker.rows[0].next_retry_at).toBeNull();

      const third = await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS + 120_000,
        workerId: "w-fail",
        providers: boom,
      });
      expect(third.claimed).toBe(0);
    });

    it("permanent provenance error does not retry", async () => {
      const { deps, worker } = await seedWorker();
      worker.rows[0].snapshot_hash = "ff".repeat(32);
      await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-perm",
        providers: fixtureProviders(),
      });
      expect(worker.rows[0].status).toBe("ENRICHMENT_FAILED");
      expect(worker.rows[0].last_error_code).toBe("PROVENANCE_INVALID");
      expect(worker.rows[0].next_retry_at).toBeNull();

      const again = await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS + 60_000,
        workerId: "w-perm",
        providers: fixtureProviders(),
      });
      expect(again.claimed).toBe(0);
    });

    it("backoff is exponential and capped", () => {
      expect(backoffMs(1, 5_000, 60_000)).toBe(5_000);
      expect(backoffMs(2, 5_000, 60_000)).toBe(10_000);
      expect(backoffMs(3, 5_000, 60_000)).toBe(20_000);
      expect(backoffMs(8, 5_000, 60_000)).toBe(60_000);
    });

    it("permanent classification for provenance codes", () => {
      const d = classifyEnrichmentOutcome({
        error: new EnrichmentError("bad hash", "PROVENANCE_INVALID", 400),
        attempt: 1,
        maxAttempts: 5,
        nowMs: NOW_MS,
        retryBaseMs: 5000,
        retryMaxMs: 60000,
      });
      expect(d.class).toBe("permanent");
      expect(d.nextRetryAt).toBeNull();
    });

    it("sanitizes secrets from error text", () => {
      expect(sanitizeErrorMessage("Bearer super-secret and webhook_token=abc")).not.toMatch(
        /super-secret|abc/
      );
    });
  });

  describe("F. Crash recovery", () => {
    it("stale ENRICHING is reclaimed and enriched without duplicate corruption", async () => {
      const { deps, worker, candidate } = await seedWorker({ status: "ENRICHING" });
      worker.rows[0].claimed_at = new Date(NOW_MS - 10 * 60_000).toISOString();
      worker.rows[0].claimed_by = "dead-worker";
      worker.rows[0].attempt_count = 1;

      const tick = await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-recover",
        providers: fixtureProviders(),
      });
      expect(tick.claimed).toBe(1);
      expect(worker.rows[0].status).toBe("READY_FOR_AI_REVIEW");
      expect(worker.rows[0].claimed_by).toBe("w-recover");
      expect(worker.snapshots).toHaveLength(1);
      expect(worker.snapshots[0].candidate_id).toBe(candidate.candidate_id);
    });

    it("reconciles when snapshot already READY_FOR_AI_REVIEW (status update lost)", async () => {
      const { deps, worker, candidate } = await seedWorker({ status: "ENRICHING" });
      worker.rows[0].claimed_at = new Date(NOW_MS - 10 * 60_000).toISOString();
      worker.rows[0].attempt_count = 1;
      worker.snapshots.push({
        id: "snap-pre",
        candidate_id: candidate.candidate_id,
        enrichment_version: 1,
        status: "READY_FOR_AI_REVIEW",
        intelligence: {},
        quality_score: "B",
        score_breakdown: {},
        freshness: {},
        provider_status: {},
        fetched_at: new Date(NOW_MS - 9 * 60_000).toISOString(),
      });

      const tick = await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-reconcile",
        providers: fixtureProviders(),
      });
      expect(tick.reconciled).toBe(1);
      expect(worker.rows[0].status).toBe("READY_FOR_AI_REVIEW");
      expect(worker.snapshots).toHaveLength(1);
    });
  });

  describe("G. Append-only", () => {
    it("retry creates enrichment_version 2 and leaves version 1 unchanged", async () => {
      const { deps, worker } = await seedWorker();
      await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-v1",
        providers: fixtureProviders({ market: okMarket(NOW_MS, 45_000) }),
      });
      expect(worker.snapshots).toHaveLength(1);
      const v1 = structuredClone(worker.snapshots[0]);
      expect(v1.enrichment_version).toBe(1);

      await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS + 30_000,
        workerId: "w-v2",
        providers: fixtureProviders(),
      });
      expect(worker.snapshots).toHaveLength(2);
      expect(worker.snapshots[0]).toEqual(v1);
      expect(worker.snapshots[1].enrichment_version).toBe(2);
      expect(worker.rows[0].status).toBe("READY_FOR_AI_REVIEW");
    });
  });

  describe("H. Worker health", () => {
    it("heartbeat, counters, last success/failure are persisted", async () => {
      const { deps, worker } = await seedWorker();
      await runEnrichmentWorkerTick(deps, {
        nowMs: NOW_MS,
        workerId: "w-health",
        providers: fixtureProviders(),
      });
      const rows = await worker.listEnrichmentWorkerHeartbeats();
      expect(rows).toHaveLength(1);
      expect(rows[0].worker_id).toBe("w-health");
      expect(rows[0].last_heartbeat).toBeTruthy();
      expect(rows[0].last_tick_at).toBeTruthy();
      expect(rows[0].last_success_at).toBeTruthy();
      expect(rows[0].processed_count).toBeGreaterThanOrEqual(1);
      expect(rows[0].currently_processing).toBeNull();

      const summary = summarizeHeartbeats(rows, NOW_MS + 1_000, 30_000);
      expect(summary.status).toBe("ok");
      expect(summary.processed_count).toBeGreaterThanOrEqual(1);
      expect(summary.worker_version).toBeTruthy();
    });

    it("stale heartbeat is reported when last_heartbeat is old", () => {
      const summary = summarizeHeartbeats(
        [
          {
            worker_id: "old",
            worker_version: "candidate_intelligence_worker_v1",
            status: "running",
            last_heartbeat: new Date(NOW_MS - 120_000).toISOString(),
            last_tick_at: new Date(NOW_MS - 120_000).toISOString(),
            last_success_at: null,
            last_failure_at: null,
            processed_count: 3,
            failed_count: 1,
            currently_processing: null,
          },
        ],
        NOW_MS,
        30_000
      );
      expect(summary.status).toBe("stale");
      expect(summary.last_failure_at).toBeNull();
      expect(summary.processed_count).toBe(3);
      expect(summary.failed_count).toBe(1);
    });
  });

  describe("I. TTL config", () => {
    it("env override and defaults use a single config source", () => {
      delete process.env.ENRICHMENT_TTL_MARKET_MS;
      expect(getFreshnessTtlMs().market).toBe(30_000);
      process.env.ENRICHMENT_TTL_MARKET_MS = "12000";
      expect(getFreshnessTtlMs().market).toBe(12_000);
      process.env.ENRICHMENT_TTL_TAKER_FLOW_MS = "90000";
      expect(getFreshnessTtlMs().takerFlow).toBe(90_000);
      delete process.env.ENRICHMENT_TTL_TAKER_FLOW_MS;
      process.env.ENRICHMENT_TTL_TAKER_MS = "45000";
      expect(getFreshnessTtlMs().takerFlow).toBe(45_000);
      expect(getEnrichmentWorkerConfig().pollMs).toBeGreaterThan(0);
    });
  });
});
