/**
 * Deterministic Truth Engine → Pine v5 translator.
 *
 * Fails closed on unsupported rules. No default RSI/SMA/close>open fallbacks.
 * Pine is generated ONLY from a frozen StrategyDefinition (immutable version).
 */

import type {
  CompareToIndicator,
  DirectionalEntrySetup,
  IndicatorKind,
  IndicatorRule,
  Rule,
  RuleOperator,
  StrategyDefinition,
} from "@/truth-engine/types";
import { UnsupportedRuleError } from "./errors";
import { BITIQ_ENGINE_ID, BITIQ_PINE_VERSION } from "./constants";
import type { FrozenVersionAuthority } from "./types";

const SUPPORTED_INDICATORS: readonly IndicatorKind[] = [
  "rsi",
  "sma",
  "ema",
  "macd",
  "bollinger",
  "volume",
  "price",
];

const SUPPORTED_OPERATORS: readonly RuleOperator[] = [
  "<",
  "<=",
  ">",
  ">=",
  "==",
  "cross_above",
  "cross_below",
];

const PRICE_FIELDS = new Set(["open", "high", "low", "close"]);
const MACD_FIELDS = new Set(["line", "signal", "histogram"]);
const BB_FIELDS = new Set(["upper", "middle", "lower"]);

function pineOp(op: RuleOperator): string {
  switch (op) {
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "==":
      return op;
    case "cross_above":
    case "cross_below":
      return op;
    default:
      throw new UnsupportedRuleError(`Unsupported operator: ${String(op)}`);
  }
}

function defaultPeriod(kind: IndicatorKind): number | undefined {
  switch (kind) {
    case "rsi":
      return 14;
    case "sma":
    case "ema":
    case "bollinger":
      return 20;
    default:
      return undefined;
  }
}

function assertIndicatorRef(
  ref: Pick<IndicatorRule, "indicator" | "period" | "field" | "timeframe">,
  entryTimeframe: string,
  path: string
): void {
  if (!SUPPORTED_INDICATORS.includes(ref.indicator)) {
    throw new UnsupportedRuleError(
      `Unsupported indicator "${ref.indicator}" at ${path}. No fallback rule will be invented.`
    );
  }
  if (ref.timeframe && ref.timeframe !== entryTimeframe) {
    throw new UnsupportedRuleError(
      `Multi-timeframe rule at ${path} (rule.timeframe=${ref.timeframe}, entry=${entryTimeframe}) cannot be represented faithfully in Stage 1 Pine.`
    );
  }
  if (ref.indicator === "macd" && ref.period != null && ref.period !== 12) {
    throw new UnsupportedRuleError(
      `MACD custom period ${ref.period} at ${path} is unsupported. Truth Engine MACD is fixed 12/26/9; omit period.`
    );
  }
  if ((ref.indicator === "volume" || ref.indicator === "price") && ref.period != null) {
    throw new UnsupportedRuleError(
      `${ref.indicator} must not specify period at ${path}`
    );
  }
  if (ref.indicator === "price") {
    const field = ref.field || "close";
    if (!PRICE_FIELDS.has(field)) {
      throw new UnsupportedRuleError(
        `Unsupported price field "${field}" at ${path}`
      );
    }
  }
  if (ref.indicator === "macd") {
    const field = ref.field || "histogram";
    if (!MACD_FIELDS.has(field)) {
      throw new UnsupportedRuleError(
        `Unsupported MACD field "${field}" at ${path}`
      );
    }
  }
  if (ref.indicator === "bollinger") {
    const field = ref.field || "middle";
    if (!BB_FIELDS.has(field)) {
      throw new UnsupportedRuleError(
        `Unsupported Bollinger field "${field}" at ${path}`
      );
    }
  }
}

function walkRule(rule: Rule, entryTimeframe: string, path: string): void {
  if (rule.type === "group") {
    if (rule.op !== "and" && rule.op !== "or") {
      throw new UnsupportedRuleError(`Unsupported group op "${String(rule.op)}" at ${path}`);
    }
    if (!Array.isArray(rule.rules) || rule.rules.length === 0) {
      throw new UnsupportedRuleError(`Empty group at ${path}`);
    }
    rule.rules.forEach((child, i) =>
      walkRule(child, entryTimeframe, `${path}.rules[${i}]`)
    );
    return;
  }
  if (rule.type !== "indicator") {
    throw new UnsupportedRuleError(
      `Unsupported rule type at ${path}. No default close/open fallback.`
    );
  }
  if (!SUPPORTED_OPERATORS.includes(rule.operator)) {
    throw new UnsupportedRuleError(
      `Unsupported operator "${String(rule.operator)}" at ${path}`
    );
  }
  assertIndicatorRef(rule, entryTimeframe, path);
  if (typeof rule.value === "number") {
    if (!Number.isFinite(rule.value)) {
      throw new UnsupportedRuleError(`Non-finite compare value at ${path}`);
    }
    return;
  }
  if (!rule.value || typeof rule.value !== "object" || !("indicator" in rule.value)) {
    throw new UnsupportedRuleError(`Unsupported compare value at ${path}`);
  }
  assertIndicatorRef(rule.value as CompareToIndicator, entryTimeframe, `${path}.value`);
}

export function assertPineSupported(strategy: StrategyDefinition): void {
  if (strategy.biasTimeframe && strategy.biasTimeframe !== strategy.entryTimeframe) {
    throw new UnsupportedRuleError(
      `biasTimeframe ${strategy.biasTimeframe} != entryTimeframe ${strategy.entryTimeframe} cannot be represented faithfully in Stage 1 Pine.`
    );
  }
  if (
    strategy.confirmationTimeframe &&
    strategy.confirmationTimeframe !== strategy.entryTimeframe
  ) {
    throw new UnsupportedRuleError(
      `confirmationTimeframe ${strategy.confirmationTimeframe} != entryTimeframe ${strategy.entryTimeframe} cannot be represented faithfully in Stage 1 Pine.`
    );
  }
  if (!strategy.entries || strategy.entries.length === 0) {
    throw new UnsupportedRuleError("Strategy has no directional entries");
  }
  if (strategy.risk.maxConcurrentPositions != null && strategy.risk.maxConcurrentPositions > 1) {
    throw new UnsupportedRuleError(
      `maxConcurrentPositions=${strategy.risk.maxConcurrentPositions} is unsupported in Stage 1 Pine (single position only).`
    );
  }
  if (strategy.risk.stopLossPct == null || !(strategy.risk.stopLossPct > 0)) {
    throw new UnsupportedRuleError(
      "Frozen risk.stopLossPct is required for faithful Pine SL translation"
    );
  }
  strategy.entries.forEach((entry, i) => {
    if (entry.direction !== "long" && entry.direction !== "short") {
      throw new UnsupportedRuleError(`Unsupported direction at entries[${i}]`);
    }
    walkRule(entry.condition, strategy.entryTimeframe, `entries[${i}].condition`);
  });
  if (strategy.exitCondition) {
    walkRule(strategy.exitCondition, strategy.entryTimeframe, "exitCondition");
  }
}

interface SeriesKey {
  indicator: IndicatorKind;
  period?: number;
  field?: string;
}

function seriesKey(ref: SeriesKey): string {
  const period = ref.period ?? defaultPeriod(ref.indicator) ?? "";
  const field =
    ref.indicator === "macd"
      ? ref.field || "histogram"
      : ref.indicator === "bollinger"
        ? ref.field || "middle"
        : ref.indicator === "price"
          ? ref.field || "close"
          : ref.field || "";
  return `${ref.indicator}|${period}|${field}`;
}

function identFor(ref: SeriesKey): string {
  switch (ref.indicator) {
    case "rsi":
      return `rsi_${ref.period ?? 14}`;
    case "sma":
      return `sma_${ref.period ?? 20}`;
    case "ema":
      return `ema_${ref.period ?? 20}`;
    case "macd": {
      const field = ref.field || "histogram";
      return `macd_${field}`;
    }
    case "bollinger": {
      const period = ref.period ?? 20;
      const field = ref.field || "middle";
      return `bb_${period}_${field}`;
    }
    case "volume":
      return "volume";
    case "price": {
      const field = ref.field || "close";
      return field;
    }
    default:
      throw new UnsupportedRuleError(`Unsupported indicator ${ref.indicator}`);
  }
}

class IndicatorEmitter {
  private seen = new Map<string, string>();
  private decls: string[] = [];
  private needsBbHelper = false;
  private needsMacd = false;

  ident(ref: SeriesKey): string {
    const key = seriesKey(ref);
    const existing = this.seen.get(key);
    if (existing) return existing;
    const ident = identFor(ref);
    this.seen.set(key, ident);
    this.emitDecl(ref, ident);
    return ident;
  }

  private emitDecl(ref: SeriesKey, ident: string): void {
    switch (ref.indicator) {
      case "rsi": {
        const p = ref.period ?? 14;
        this.decls.push(`${ident} = ta.rsi(close, ${p})`);
        break;
      }
      case "sma": {
        const p = ref.period ?? 20;
        this.decls.push(`${ident} = ta.sma(close, ${p})`);
        break;
      }
      case "ema": {
        const p = ref.period ?? 20;
        this.decls.push(`${ident} = ta.ema(close, ${p})`);
        break;
      }
      case "macd": {
        this.needsMacd = true;
        break;
      }
      case "bollinger": {
        this.needsBbHelper = true;
        const p = ref.period ?? 20;
        const middle = `bb_${p}_middle`;
        if (![...this.seen.values()].includes(middle) || ident === middle) {
          if (!this.decls.some((d) => d.startsWith(`${middle} =`))) {
            this.decls.push(`${middle} = ta.sma(close, ${p})`);
          }
        }
        const stdev = `bb_${p}_stdev`;
        if (!this.decls.some((d) => d.startsWith(`${stdev} =`))) {
          this.decls.push(`${stdev} = bitiqlab_bb_stdev(close, ${p}, ${middle})`);
        }
        if (ident.endsWith("_upper") && !this.decls.some((d) => d.startsWith(`${ident} =`))) {
          this.decls.push(`${ident} = ${middle} + 2.0 * ${stdev}`);
        }
        if (ident.endsWith("_lower") && !this.decls.some((d) => d.startsWith(`${ident} =`))) {
          this.decls.push(`${ident} = ${middle} - 2.0 * ${stdev}`);
        }
        break;
      }
      case "volume":
      case "price":
        break;
      default:
        throw new UnsupportedRuleError(`Unsupported indicator ${ref.indicator}`);
    }
  }

  collect(rule: Rule): void {
    if (rule.type === "group") {
      for (const child of rule.rules) this.collect(child);
      return;
    }
    this.ident(rule);
    if (typeof rule.value !== "number") {
      this.ident(rule.value);
    }
  }

  prelude(): string {
    const lines: string[] = [];
    if (this.needsBbHelper) {
      lines.push(
        "bitiqlab_bb_stdev(src, len, basis) =>",
        "    sum = 0.0",
        "    for i = 0 to len - 1",
        "        sum += math.pow(src[i] - basis, 2)",
        "    math.sqrt(sum / len)"
      );
    }
    if (this.needsMacd) {
      lines.push("[macd_line, macd_signal, macd_histogram] = ta.macd(close, 12, 26, 9)");
    }
    lines.push(...this.decls);
    return lines.join("\n");
  }
}

function exprForRef(emitter: IndicatorEmitter, ref: SeriesKey): string {
  return emitter.ident(ref);
}

function exprForValue(
  emitter: IndicatorEmitter,
  value: number | CompareToIndicator
): string {
  if (typeof value === "number") return String(value);
  return exprForRef(emitter, value);
}

function ruleToPine(rule: Rule, emitter: IndicatorEmitter): string {
  if (rule.type === "group") {
    const inner = rule.rules.map((r) => ruleToPine(r, emitter));
    const join = rule.op === "or" ? " or " : " and ";
    return `(${inner.join(join)})`;
  }
  const left = exprForRef(emitter, rule);
  const right = exprForValue(emitter, rule.value);
  const op = pineOp(rule.operator);
  if (op === "cross_above") {
    return `ta.crossover(${left}, ${right})`;
  }
  if (op === "cross_below") {
    return `ta.crossunder(${left}, ${right})`;
  }
  return `${left} ${op} ${right}`;
}

function combineEntries(
  entries: DirectionalEntrySetup[],
  direction: "long" | "short",
  emitter: IndicatorEmitter
): string | null {
  const matching = entries.filter((e) => e.direction === direction);
  if (matching.length === 0) return null;
  const parts = matching.map((e) => ruleToPine(e.condition, emitter));
  if (parts.length === 1) return parts[0];
  return `(${parts.join(" or ")})`;
}

export function generatePineFromFrozen(
  authority: FrozenVersionAuthority,
  opts: {
    webhookToken: string;
    pineVersion?: string;
  }
): string {
  const strategy = authority.strategy;
  assertPineSupported(strategy);

  const emitter = new IndicatorEmitter();
  for (const entry of strategy.entries) emitter.collect(entry.condition);
  if (strategy.exitCondition) emitter.collect(strategy.exitCondition);

  const longExpr = combineEntries(strategy.entries, "long", emitter);
  const shortExpr = combineEntries(strategy.entries, "short", emitter);
  if (!longExpr && !shortExpr) {
    throw new UnsupportedRuleError("No LONG or SHORT entry could be translated");
  }

  const slPct = strategy.risk.stopLossPct as number;
  const tpPct = strategy.risk.takeProfitPct;
  const riskPct = strategy.risk.riskPerTradePct;
  const maxHold = strategy.risk.maxHoldBars;
  const exitExpr = strategy.exitCondition
    ? ruleToPine(strategy.exitCondition, emitter)
    : null;

  const safeName = strategy.name.replace(/[^A-Za-z0-9_ ]+/g, "").slice(0, 40) || "Bitiq";
  const prelude = emitter.prelude();

  const longCond = longExpr
    ? `long_entry = ${longExpr} and barstate.isconfirmed`
    : "long_entry = false";
  const shortCond = shortExpr
    ? `short_entry = ${shortExpr} and barstate.isconfirmed`
    : "short_entry = false";

  const exitCond = exitExpr
    ? `strategy_exit_hit = ${exitExpr} and barstate.isconfirmed`
    : "strategy_exit_hit = false";

  const tpLong =
    tpPct != null
      ? `long_tp = close * (1 + take_profit_pct / 100)`
      : "long_tp = na";
  const tpShort =
    tpPct != null
      ? `short_tp = close * (1 - take_profit_pct / 100)`
      : "short_tp = na";

  const tpArrayLong =
    tpPct != null
      ? `"[" + str.tostring(long_tp, "#.########") + "]"`
      : `"[]"`;
  const tpArrayShort =
    tpPct != null
      ? `"[" + str.tostring(short_tp, "#.########") + "]"`
      : `"[]"`;

  const holdBlock =
    maxHold != null
      ? `
if strategy.position_size != 0 and (bar_index - strategy.opentrades.entry_bar_index(0)) >= ${maxHold}
    strategy.close_all("timeout")`
      : "";

  const buildAlertFn = `
build_candidate_json(direction, entry_px, sl_px, tp_json) =>
    candle_iso = str.format_time(time, "yyyy-MM-dd'T'HH:mm:ss'Z'", "UTC")
    cand_id = STRATEGY_VERSION_ID + "|" + SYMBOL + "|" + TIMEFRAME + "|" + direction + "|" + candle_iso
    "{" +
     "\\"candidate_id\\":\\"" + cand_id + "\\"," +
     "\\"strategy_id\\":\\"" + STRATEGY_ID + "\\"," +
     "\\"strategy_version_id\\":\\"" + STRATEGY_VERSION_ID + "\\"," +
     "\\"snapshot_hash\\":\\"" + SNAPSHOT_HASH + "\\"," +
     "\\"symbol\\":\\"" + SYMBOL + "\\"," +
     "\\"timeframe\\":\\"" + TIMEFRAME + "\\"," +
     "\\"direction\\":\\"" + direction + "\\"," +
     "\\"signal_candle_ts\\":\\"" + candle_iso + "\\"," +
     "\\"entry\\":" + str.tostring(entry_px, "#.########") + "," +
     "\\"stop_loss\\":" + str.tostring(sl_px, "#.########") + "," +
     "\\"take_profits\\":" + tp_json + "," +
     "\\"pine_version\\":\\"" + PINE_VERSION + "\\"," +
     "\\"source\\":\\"TRADINGVIEW\\"," +
     "\\"webhook_token\\":\\"" + WEBHOOK_TOKEN + "\\"" +
     "}"
`;

  return `//@version=5
strategy(${JSON.stringify(`Bitiq ${safeName}`)}, overlay=true, pyramiding=0,
     process_orders_on_close=true, calc_on_every_tick=false,
     default_qty_type=strategy.percent_of_equity, default_qty_value=${riskPct})

// BITIQ_STRATEGY_ID: ${authority.strategyId}
// BITIQ_STRATEGY_VERSION_ID: ${authority.strategyVersionId}
// BITIQ_SNAPSHOT_HASH: ${authority.snapshotHash}
// BITIQ_PINE_VERSION: ${opts.pineVersion || BITIQ_PINE_VERSION}
// BITIQ_ENGINE: ${BITIQ_ENGINE_ID}

STRATEGY_ID = ${JSON.stringify(authority.strategyId)}
STRATEGY_VERSION_ID = ${JSON.stringify(authority.strategyVersionId)}
SNAPSHOT_HASH = ${JSON.stringify(authority.snapshotHash)}
SYMBOL = ${JSON.stringify(authority.symbol)}
TIMEFRAME = ${JSON.stringify(authority.timeframe)}
PINE_VERSION = ${JSON.stringify(opts.pineVersion || BITIQ_PINE_VERSION)}
WEBHOOK_TOKEN = ${JSON.stringify(opts.webhookToken)}

stop_loss_pct = ${slPct}
take_profit_pct = ${tpPct != null ? tpPct : "na"}

${prelude}

${longCond}
${shortCond}
${exitCond}

${tpLong}
${tpShort}
long_sl = close * (1 - stop_loss_pct / 100)
short_sl = close * (1 + stop_loss_pct / 100)
long_tp_json = ${tpArrayLong}
short_tp_json = ${tpArrayShort}

${buildAlertFn}

if long_entry and strategy.position_size == 0
    strategy.entry("LONG", strategy.long)
    alert(build_candidate_json("LONG", close, long_sl, long_tp_json), alert.freq_once_per_bar_close)

if short_entry and strategy.position_size == 0
    strategy.entry("SHORT", strategy.short)
    alert(build_candidate_json("SHORT", close, short_sl, short_tp_json), alert.freq_once_per_bar_close)

if strategy.position_size > 0
    strategy.exit("XL", from_entry="LONG", stop=strategy.position_avg_price * (1 - stop_loss_pct / 100)${
      tpPct != null
        ? ", limit=strategy.position_avg_price * (1 + take_profit_pct / 100)"
        : ""
    })

if strategy.position_size < 0
    strategy.exit("XS", from_entry="SHORT", stop=strategy.position_avg_price * (1 + stop_loss_pct / 100)${
      tpPct != null
        ? ", limit=strategy.position_avg_price * (1 - take_profit_pct / 100)"
        : ""
    })

if strategy_exit_hit and strategy.position_size != 0
    strategy.close_all("strategy_exit")
${holdBlock}

plotshape(long_entry, title="LONG", style=shape.triangleup, location=location.belowbar, color=color.green, size=size.tiny)
plotshape(short_entry, title="SHORT", style=shape.triangledown, location=location.abovebar, color=color.red, size=size.tiny)
`;
}

export function pineContainsProvenance(
  pine: string,
  expected: {
    strategyId: string;
    strategyVersionId: string;
    snapshotHash: string;
  }
): {
  strategy_id: boolean;
  strategy_version_id: boolean;
  snapshot_hash: boolean;
  pine_version: boolean;
  engine: boolean;
} {
  return {
    strategy_id:
      pine.includes(`BITIQ_STRATEGY_ID: ${expected.strategyId}`) &&
      pine.includes(`STRATEGY_ID = ${JSON.stringify(expected.strategyId)}`),
    strategy_version_id:
      pine.includes(`BITIQ_STRATEGY_VERSION_ID: ${expected.strategyVersionId}`) &&
      pine.includes(
        `STRATEGY_VERSION_ID = ${JSON.stringify(expected.strategyVersionId)}`
      ),
    snapshot_hash:
      pine.includes(`BITIQ_SNAPSHOT_HASH: ${expected.snapshotHash}`) &&
      pine.includes(`SNAPSHOT_HASH = ${JSON.stringify(expected.snapshotHash)}`),
    pine_version: pine.includes(`BITIQ_PINE_VERSION: ${BITIQ_PINE_VERSION}`),
    engine: pine.includes(`BITIQ_ENGINE: ${BITIQ_ENGINE_ID}`),
  };
}
