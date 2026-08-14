import { describe, expect, it } from "vitest";
import {
  assertChronologicalClosedBars,
  candlesAfterCursor,
  isCandleClosed,
  PaperCandleError,
  splitWarmupAndExecute,
} from "../closed-candles";
import { makeBars } from "./helpers";

describe("closed candles only", () => {
  const tf = "1h";
  const now = new Date(Date.UTC(2024, 0, 1, 10, 30, 0));

  it("treats a candle as closed only when open+interval <= now", () => {
    const closed = {
      timestamp: new Date(Date.UTC(2024, 0, 1, 8, 0, 0)),
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    };
    const forming = {
      timestamp: new Date(Date.UTC(2024, 0, 1, 10, 0, 0)),
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    };
    expect(isCandleClosed(closed, tf, now)).toBe(true);
    expect(isCandleClosed(forming, tf, now)).toBe(false);
  });

  it("drops the currently forming candle and keeps chronological closed bars", () => {
    const bars = makeBars([
      {
        timestamp: new Date(Date.UTC(2024, 0, 1, 8, 0, 0)),
        close: 1,
        open: 1,
      },
      {
        timestamp: new Date(Date.UTC(2024, 0, 1, 9, 0, 0)),
        close: 2,
        open: 2,
      },
      {
        timestamp: new Date(Date.UTC(2024, 0, 1, 10, 0, 0)),
        close: 3,
        open: 3,
      },
    ]);
    const closed = assertChronologicalClosedBars(bars, tf, now);
    expect(closed).toHaveLength(2);
    expect(closed[1].close).toBe(2);
  });

  it("rejects future candles", () => {
    const bars = makeBars([
      {
        timestamp: new Date(Date.UTC(2024, 0, 2, 0, 0, 0)),
        close: 1,
        open: 1,
      },
    ]);
    expect(() => assertChronologicalClosedBars(bars, tf, now)).toThrow(
      PaperCandleError
    );
  });

  it("dedupes duplicate timestamps", () => {
    const ts = new Date(Date.UTC(2024, 0, 1, 8, 0, 0));
    const bars = [
      { timestamp: ts, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { timestamp: ts, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      {
        timestamp: new Date(Date.UTC(2024, 0, 1, 9, 0, 0)),
        open: 2,
        high: 2,
        low: 2,
        close: 2,
        volume: 1,
      },
    ];
    const closed = assertChronologicalClosedBars(bars, tf, now);
    expect(closed).toHaveLength(2);
  });

  it("skips bars at or before the resume cursor", () => {
    const bars = makeBars([
      {
        timestamp: new Date(Date.UTC(2024, 0, 1, 8, 0, 0)),
        close: 1,
      },
      {
        timestamp: new Date(Date.UTC(2024, 0, 1, 9, 0, 0)),
        close: 2,
      },
    ]);
    const next = candlesAfterCursor(bars, "2024-01-01T08:00:00.000Z");
    expect(next).toHaveLength(1);
    expect(next[0].close).toBe(2);
  });

  it("warmup vs execute split is chronological", () => {
    const bars = makeBars([
      { timestamp: new Date(Date.UTC(2024, 0, 1, 6, 0, 0)), close: 1 },
      { timestamp: new Date(Date.UTC(2024, 0, 1, 7, 0, 0)), close: 2 },
      { timestamp: new Date(Date.UTC(2024, 0, 1, 8, 0, 0)), close: 3 },
    ]);
    const split = splitWarmupAndExecute({
      bars,
      executeFromTs: "2024-01-01T07:00:00.000Z",
      lastProcessedCandleTs: null,
    });
    expect(split.executeFromIndex).toBe(1);
    expect(split.execute.map((b) => b.close)).toEqual([2, 3]);
  });
});
