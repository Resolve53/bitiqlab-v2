import { toPersistedRules } from "@/lib/claude-strategy-schema";
import {
  validDualStrategy,
  validLongStrategy,
  validShortStrategy,
} from "@/lib/__tests__/strategy-gen-fixtures";
import { hashStrategyRules } from "@/research-engine/experiment-id";
import type { StrategySnapshot } from "@/research-engine/types";
import type { VersionRow } from "../authority";
import type { TradingViewCandidateRow } from "../types";
import type { CandidatePersistence } from "../candidate-ingest";
import type { AuthorityDeps } from "../authority";
import type { StrategyDefinition, Rule } from "@/truth-engine/types";
import { BITIQ_PINE_VERSION } from "../constants";

export const TOKEN = "test-webhook-token-stage1";

export function frozenFromGenerated(
  generated: ReturnType<typeof validLongStrategy>,
  ids: { strategyId: string; versionId: string; version?: number } = {
    strategyId: "11111111-1111-1111-1111-111111111111",
    versionId: "22222222-2222-2222-2222-222222222222",
    version: 3,
  }
): { row: VersionRow; snapshot: StrategySnapshot; hash: string } {
  const { entry_rules, exit_rules } = toPersistedRules(generated);
  const snapshot: StrategySnapshot = {
    id: ids.strategyId,
    name: generated.name,
    symbol: generated.symbol,
    timeframe: generated.timeframe,
    market_type: generated.market_type,
    entry_rules,
    exit_rules,
    version: ids.version ?? 3,
  };
  const hash = hashStrategyRules(snapshot);
  return {
    snapshot,
    hash,
    row: {
      id: ids.versionId,
      strategy_id: ids.strategyId,
      version: ids.version ?? 3,
      strategy_snapshot: snapshot,
      snapshot_hash: hash,
    },
  };
}

export const longFrozen = () => frozenFromGenerated(validLongStrategy());
export const shortFrozen = () =>
  frozenFromGenerated(validShortStrategy(), {
    strategyId: "33333333-3333-3333-3333-333333333333",
    versionId: "44444444-4444-4444-4444-444444444444",
    version: 1,
  });
export const dualFrozen = () =>
  frozenFromGenerated(validDualStrategy(), {
    strategyId: "55555555-5555-5555-5555-555555555555",
    versionId: "66666666-6666-6666-6666-666666666666",
    version: 2,
  });

export function authorityDeps(row: VersionRow, liveSpy?: () => Promise<unknown>): AuthorityDeps {
  return {
    getStrategyVersionById: async (id) => (id === row.id ? row : null),
    getStrategy: liveSpy,
  };
}

export function memoryCandidates(): CandidatePersistence & {
  rows: TradingViewCandidateRow[];
  getTradingViewCandidateById: (id: string) => Promise<TradingViewCandidateRow | null>;
} {
  const rows: TradingViewCandidateRow[] = [];
  return {
    rows,
    async insertTradingViewCandidate(row) {
      if (rows.some((r) => r.candidate_id === row.candidate_id)) {
        throw new Error("duplicate key value violates unique constraint");
      }
      if (
        rows.some(
          (r) =>
            r.strategy_version_id === row.strategy_version_id &&
            r.symbol === row.symbol &&
            r.timeframe === row.timeframe &&
            r.direction === row.direction &&
            r.signal_candle_ts === new Date(row.signal_candle_ts).toISOString()
        )
      ) {
        throw new Error("duplicate key value violates unique constraint");
      }
      const stored: TradingViewCandidateRow = {
        id: `db-${rows.length + 1}`,
        candidate_id: row.candidate_id,
        strategy_id: row.strategy_id,
        strategy_version_id: row.strategy_version_id,
        snapshot_hash: row.snapshot_hash,
        symbol: row.symbol,
        timeframe: row.timeframe,
        direction: row.direction as TradingViewCandidateRow["direction"],
        signal_candle_ts: new Date(row.signal_candle_ts).toISOString(),
        received_at: row.received_at,
        entry: row.entry,
        stop_loss: row.stop_loss,
        take_profits: row.take_profits,
        pine_version: row.pine_version,
        source: row.source,
        raw_payload: row.raw_payload,
        status: row.status as TradingViewCandidateRow["status"],
        created_at: row.received_at,
      };
      rows.push(stored);
      return stored;
    },
    async getTradingViewCandidateById(id) {
      return rows.find((r) => r.id === id) || null;
    },
    async getTradingViewCandidateByCandidateId(candidateId) {
      return rows.find((r) => r.candidate_id === candidateId) || null;
    },
    async getTradingViewCandidateByNaturalKey(key) {
      const ts = new Date(key.signal_candle_ts).toISOString();
      return (
        rows.find(
          (r) =>
            r.strategy_version_id === key.strategy_version_id &&
            r.symbol === key.symbol &&
            r.timeframe === key.timeframe &&
            r.direction === key.direction &&
            r.signal_candle_ts === ts
        ) || null
      );
    },
  };
}

export function validPayload(frozen: ReturnType<typeof longFrozen>, overrides: Record<string, unknown> = {}) {
  const candle = new Date("2026-08-14T12:00:00.000Z").toISOString();
  return {
    strategy_id: frozen.row.strategy_id,
    strategy_version_id: frozen.row.id,
    snapshot_hash: frozen.hash,
    symbol: frozen.snapshot.symbol,
    timeframe: frozen.snapshot.timeframe,
    direction: "LONG",
    signal_candle_ts: candle,
    entry: 64000,
    stop_loss: 62720,
    take_profits: [66560],
    pine_version: BITIQ_PINE_VERSION,
    source: "TRADINGVIEW",
    webhook_token: TOKEN,
    ...overrides,
  };
}

export function strategyFromAuthorityLike(rule: Rule, direction: "long" | "short" = "long"): StrategyDefinition {
  return {
    id: "s",
    name: "fixture",
    version: 1,
    marketType: "spot",
    symbol: "BTCUSDT",
    entryTimeframe: "15m",
    entries: [{ direction, condition: rule }],
    exitCondition: null,
    risk: { riskPerTradePct: 1, stopLossPct: 2, takeProfitPct: 4 },
    leverage: 1,
  };
}

export { validLongStrategy, validShortStrategy, validDualStrategy };
