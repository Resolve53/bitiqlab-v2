import { describe, expect, it } from "vitest";
import { verifyImmutableSnapshot, PaperSnapshotError } from "../snapshot";
import { frozenSnapshot, makeRunningSession, snapshotHash } from "./helpers";

describe("immutable snapshot execution authority", () => {
  it("accepts a frozen snapshot whose hash matches", () => {
    const snapshot = frozenSnapshot();
    const session = makeRunningSession(snapshot);
    const verified = verifyImmutableSnapshot(session);
    expect(verified.computedHash).toBe(snapshotHash(snapshot));
    expect(verified.strategy.entries[0].direction).toBe("long");
    expect(verified.strategy.symbol).toBe("BTCUSDT");
  });

  it("FAIL CLOSED on hash mismatch / corrupt snapshot", () => {
    const session = makeRunningSession(frozenSnapshot(), {
      snapshot_hash: "definitely-not-the-hash",
    });
    expect(() => verifyImmutableSnapshot(session)).toThrow(PaperSnapshotError);
    expect(() => verifyImmutableSnapshot(session)).toThrow(/hash mismatch/i);
  });

  it("FAIL CLOSED when snapshot is missing", () => {
    const session = makeRunningSession(frozenSnapshot(), {
      strategy_snapshot: null,
    });
    expect(() => verifyImmutableSnapshot(session)).toThrow(/missing strategy_snapshot/i);
  });

  it("does not use live strategies.entry_rules — only frozen snapshot", () => {
    const snapshot = frozenSnapshot({
      entry_rules: {
        entries: [
          {
            direction: "short",
            condition: {
              type: "indicator",
              indicator: "price",
              field: "close",
              operator: "<",
              value: 1,
            },
          },
        ],
      },
    });
    const session = makeRunningSession(snapshot);
    const verified = verifyImmutableSnapshot(session);
    expect(verified.strategy.entries[0].direction).toBe("short");
  });
});
