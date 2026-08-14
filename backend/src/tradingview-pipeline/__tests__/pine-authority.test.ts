import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  loadFrozenVersionAuthority,
  generatePineFromFrozen,
  PineAuthorityError,
  SnapshotHashMismatchError,
  UnsupportedRuleError,
} from "@/tradingview-pipeline";
import {
  TOKEN,
  authorityDeps,
  longFrozen,
  strategyFromAuthorityLike,
} from "./helpers";
import type { FrozenVersionAuthority } from "../types";

describe("A. Pine authority", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRADINGVIEW_WEBHOOK_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("uses the frozen strategy version, not a mutable live strategy", async () => {
    const frozen = longFrozen();
    const liveSpy = vi.fn(async () => {
      throw new Error("must not read live strategies.entry_rules");
    });
    const authority = await loadFrozenVersionAuthority(authorityDeps(frozen.row, liveSpy), {
      strategy_id: frozen.row.strategy_id,
      strategy_version_id: frozen.row.id,
      snapshot_hash: frozen.hash,
    });
    expect(liveSpy).not.toHaveBeenCalled();
    expect(authority.strategyVersionId).toBe(frozen.row.id);
    expect(authority.snapshotHash).toBe(frozen.hash);
    const pine = generatePineFromFrozen(authority, { webhookToken: TOKEN });
    expect(pine).toMatch(/rsi_14 < 30/);
    expect(pine).not.toMatch(/entry_signal = close > open/);
    expect(pine).not.toMatch(/SIGNAL_BUY/);
  });

  it("fails when version is missing", async () => {
    const frozen = longFrozen();
    await expect(
      loadFrozenVersionAuthority(authorityDeps(frozen.row), {
        strategy_id: frozen.row.strategy_id,
        strategy_version_id: "00000000-0000-0000-0000-000000000000",
        snapshot_hash: frozen.hash,
      })
    ).rejects.toBeInstanceOf(PineAuthorityError);
  });

  it("fails when snapshot hash mismatches", async () => {
    const frozen = longFrozen();
    await expect(
      loadFrozenVersionAuthority(authorityDeps(frozen.row), {
        strategy_id: frozen.row.strategy_id,
        strategy_version_id: frozen.row.id,
        snapshot_hash: "deadbeef".repeat(8),
      })
    ).rejects.toBeInstanceOf(SnapshotHashMismatchError);
  });

  it("fails when stored snapshot hash does not match recomputed hash", async () => {
    const frozen = longFrozen();
    const corrupt = {
      ...frozen.row,
      snapshot_hash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    };
    await expect(
      loadFrozenVersionAuthority(authorityDeps(corrupt), {
        strategy_id: corrupt.strategy_id,
        strategy_version_id: corrupt.id,
        snapshot_hash: corrupt.snapshot_hash,
      })
    ).rejects.toBeInstanceOf(SnapshotHashMismatchError);
  });

  it("fails closed on unsupported Truth Engine rules with no default fallback", () => {
    const frozen = longFrozen();
    const authority: FrozenVersionAuthority = {
      strategyId: frozen.row.strategy_id,
      strategyVersionId: frozen.row.id,
      versionNumber: 1,
      snapshotHash: frozen.hash,
      snapshot: frozen.snapshot as unknown as Record<string, unknown>,
      symbol: "BTCUSDT",
      timeframe: "15m",
      strategy: strategyFromAuthorityLike({
        type: "indicator",
        indicator: "rsi",
        period: 14,
        operator: "<",
        value: 30,
        timeframe: "1d",
      }),
    };
    expect(() => generatePineFromFrozen(authority, { webhookToken: TOKEN })).toThrow(
      UnsupportedRuleError
    );
    try {
      generatePineFromFrozen(authority, { webhookToken: TOKEN });
    } catch (err) {
      expect(String(err)).not.toMatch(/close > open/);
      expect(String(err)).toMatch(/cannot be represented faithfully|Multi-timeframe/i);
    }
  });

  it("does not invent a default RSI or SMA rule when translation is impossible", () => {
    const frozen = longFrozen();
    const authority: FrozenVersionAuthority = {
      strategyId: frozen.row.strategy_id,
      strategyVersionId: frozen.row.id,
      versionNumber: 1,
      snapshotHash: frozen.hash,
      snapshot: {},
      symbol: "ETHUSDT",
      timeframe: "1h",
      strategy: {
        ...strategyFromAuthorityLike({
          type: "indicator",
          indicator: "macd",
          period: 21,
          operator: ">",
          value: 0,
        }),
        symbol: "ETHUSDT",
        entryTimeframe: "1h",
      },
    };
    expect(() => generatePineFromFrozen(authority, { webhookToken: TOKEN })).toThrow(
      /MACD custom period/i
    );
  });
});
