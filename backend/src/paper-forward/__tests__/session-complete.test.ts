import { describe, expect, it } from "vitest";
import {
  completePaperSession,
  startPaperSession,
  pausePaperSession,
  abortPaperSession,
} from "../session-service";
import { PaperLifecycleError, assertValidTransition } from "../lifecycle";
import { makeOpsHarness, makeRunningSession } from "./helpers";

describe("Phase 4C lifecycle complete + terminal protection", () => {
  it("RUNNING → COMPLETED and cannot restart", async () => {
    const h = makeOpsHarness(makeRunningSession());
    const done = await completePaperSession(h.sessionDb, "sess-1", "tester");
    expect(done.lifecycle_status).toBe("COMPLETED");
    expect(done.completed_at).toBeTruthy();
    expect(done.tick_lock_token).toBeNull();
    await expect(startPaperSession(h.sessionDb, "sess-1")).rejects.toThrow(
      PaperLifecycleError
    );
    expect(h.opsEvents.some((e) => e.event_type === "COMPLETED")).toBe(true);
  });

  it("PAUSED → COMPLETED", async () => {
    const h = makeOpsHarness(
      makeRunningSession(undefined, { lifecycle_status: "PAUSED" })
    );
    const done = await completePaperSession(h.sessionDb, "sess-1");
    expect(done.lifecycle_status).toBe("COMPLETED");
  });

  it("CREATED cannot complete; ABORTED cannot complete", async () => {
    expect(() => assertValidTransition("CREATED", "COMPLETED")).toThrow(
      PaperLifecycleError
    );
    const h = makeOpsHarness(makeRunningSession());
    await abortPaperSession(h.sessionDb, "sess-1", "stop");
    await expect(completePaperSession(h.sessionDb, "sess-1")).rejects.toThrow(
      PaperLifecycleError
    );
  });

  it("start/pause/complete audit ops events", async () => {
    const created = makeRunningSession(undefined, {
      lifecycle_status: "CREATED",
      started_at: null,
    });
    const h = makeOpsHarness(created);
    await startPaperSession(h.sessionDb, "sess-1", "alice");
    await pausePaperSession(h.sessionDb, "sess-1", "alice");
    await completePaperSession(h.sessionDb, "sess-1", "alice");
    const types = h.opsEvents.map((e) => e.event_type);
    expect(types).toContain("STARTED");
    expect(types).toContain("PAUSED");
    expect(types).toContain("COMPLETED");
  });
});
