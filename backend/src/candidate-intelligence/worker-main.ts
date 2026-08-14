/**
 * Production enrichment worker loop.
 * Polls the DB, claims READY_FOR_ENRICHMENT candidates, runs enrichCandidate.
 * No AI decision. No trade execution.
 *
 *   cd backend && npm run worker:enrichment
 */

import "./register-paths";
import http from "http";
import { config as loadEnv } from "dotenv";
import { getDB } from "@/lib/db";
import {
  getEnrichmentWorkerConfig,
  ENRICHMENT_WORKER_VERSION,
} from "./config";
import { runEnrichmentWorkerTick, summarizeHeartbeats } from "./worker";
import { workerDepsFromDb } from "./worker-db";
import { workerLog } from "./log";

loadEnv();

const cfg = getEnrichmentWorkerConfig();
let stopping = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function deps() {
  return workerDepsFromDb(getDB());
}

async function loop() {
  workerLog("enrichment_worker_start", {
    worker_id: cfg.workerId,
    poll_ms: cfg.pollMs,
    batch_size: cfg.batchSize,
    concurrency: cfg.concurrency,
    worker_version: cfg.workerVersion,
  });

  while (!stopping) {
    try {
      await runEnrichmentWorkerTick(deps(), { workerId: cfg.workerId });
    } catch (err) {
      workerLog("enrichment_worker_tick_failed", {
        worker_id: cfg.workerId,
        error: err instanceof Error ? err.message : "tick failed",
      });
    }
    if (stopping) break;
    await sleep(cfg.pollMs);
  }

  workerLog("enrichment_worker_stop", { worker_id: cfg.workerId });
}

function startHttp() {
  const port = parseInt(process.env.PORT || "3011", 10);
  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";
    if (req.method === "GET" && (url === "/health" || url.startsWith("/api/health"))) {
      try {
        const rows = await deps().listEnrichmentWorkerHeartbeats();
        const body = {
          ...summarizeHeartbeats(rows),
          worker_id: cfg.workerId,
          worker_version: ENRICHMENT_WORKER_VERSION,
          process: "enrichment-worker",
        };
        res.writeHead(body.status === "ok" ? 200 : 503, {
          "content-type": "application/json",
        });
        res.end(JSON.stringify(body));
      } catch (err) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            status: "error",
            error: err instanceof Error ? err.message : "health failed",
          })
        );
      }
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  server.listen(port, "0.0.0.0", () => {
    workerLog("enrichment_worker_http", {
      worker_id: cfg.workerId,
      port,
    });
  });
  return server;
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
  });
}

if (cfg.listenHttp) startHttp();
loop().catch((err) => {
  console.error(err);
  process.exit(1);
});
