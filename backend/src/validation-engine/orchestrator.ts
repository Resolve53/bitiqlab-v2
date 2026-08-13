/**
 * Phase 2 Validation orchestrator — Truth Engine only, no fake metrics.
 */

import {
  assertSupportedMarket,
  buildStrategyDefinition,
  fetchHistoricalOHLCV,
  runTruthBacktest,
  SUPPORTED_SYMBOLS,
  windowToDateRange,
  type BacktestRunResult,
  type OHLCVBar,
  type StrategyDefinition,
} from "@/truth-engine";
import { mergeValidationConfig, type ValidationConfig } from "./config";
import { DEFAULT_COST_STRESS_CASES } from "./cost-stress";
import { computeDegradation } from "./degradation";
import { evaluateGate } from "./gate";
import {
  classifyTrendRegimes,
  classifyVolRegimes,
  REGIME_DEFINITIONS,
} from "./regimes";
import { evaluateSampleIntegrity } from "./sample-integrity";
import {
  assertOriginalUnchanged,
  buildSensitivityVariants,
} from "./sensitivity";
import {
  assertNoSplitOverlap,
  chronologicalSplitIndices,
  sliceBars,
} from "./splits";
import {
  summarizeMetrics,
  type ChronologicalSplitResult,
  type CostStressResult,
  type CrossAssetResult,
  type MetricsSummary,
  type RegimeAnalysisResult,
  type RegimeBucketResult,
  type SensitivityResult,
  type SplitSegment,
  type ValidationReport,
  type ValidationRunRequest,
  type WalkForwardResult,
} from "./types";
import { buildWalkForwardWindows } from "./walk-forward";

export type StrategyRow = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  market_type?: string;
  entry_rules?: unknown;
  exit_rules?: unknown;
  version?: number;
  backtest_count?: number;
};

async function runSlice(params: {
  strategy: StrategyRow;
  bars: OHLCVBar[];
  symbol: string;
  timeframe: string;
  initialCapital: number;
  commissionPct: number;
  slippagePct: number;
}): Promise<BacktestRunResult> {
  return runTruthBacktest({
    strategy: params.strategy,
    request: {
      strategyId: params.strategy.id,
      symbol: params.symbol,
      timeframe: params.timeframe,
      bars: params.bars,
      initialCapital: params.initialCapital,
      commissionPct: params.commissionPct,
      slippagePct: params.slippagePct,
    },
  });
}

function segmentFromResult(
  name: SplitSegment["name"],
  bars: OHLCVBar[],
  result: BacktestRunResult
): SplitSegment {
  return {
    name,
    start: bars[0].timestamp.toISOString(),
    end: bars[bars.length - 1].timestamp.toISOString(),
    barCount: bars.length,
    tradeCount: result.metrics.totalTrades,
    metrics: summarizeMetrics(result.metrics),
    resultSource: "REAL_BACKTEST",
  };
}

function meanNullable(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function tradeStatsFromTrades(
  trades: BacktestRunResult["trades"]
): Pick<
  RegimeBucketResult,
  "trades" | "winRate" | "expectancy" | "profitFactor" | "totalReturn" | "maxDrawdown"
> {
  if (trades.length === 0) {
    return {
      trades: 0,
      winRate: null,
      expectancy: null,
      profitFactor: null,
      totalReturn: null,
      maxDrawdown: null,
    };
  }
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const net = trades.reduce((s, t) => s + t.netPnl, 0);
  const pf =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : null;
  // Approximate drawdown from trade equity path starting at 0 cumulative
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    equity += t.netPnl;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    maxDd = Math.max(maxDd, dd);
  }
  return {
    trades: trades.length,
    winRate: wins.length / trades.length,
    expectancy: net / trades.length,
    profitFactor: pf,
    totalReturn: net, // absolute net on this trade subset (not %)
    maxDrawdown: maxDd,
  };
}

function buildRegimeReport(
  bars: OHLCVBar[],
  full: BacktestRunResult,
  config: ValidationConfig
): RegimeAnalysisResult {
  const trends = classifyTrendRegimes(bars, config);
  const vols = classifyVolRegimes(bars, config);

  const barIndexByIso = new Map<string, number>();
  bars.forEach((b, i) => barIndexByIso.set(b.timestamp.toISOString(), i));

  const trendBuckets: Record<string, typeof full.trades> = {
    trending_up: [],
    trending_down: [],
    sideways: [],
  };
  const volBuckets: Record<string, typeof full.trades> = {
    high_volatility: [],
    low_volatility: [],
  };

  for (const trade of full.trades) {
    const idx = barIndexByIso.get(trade.entryTime);
    // fallback: find nearest bar by time
    let i = idx;
    if (i == null) {
      const t = new Date(trade.entryTime).getTime();
      i = bars.findIndex((b) => b.timestamp.getTime() === t);
    }
    if (i == null || i < 0) continue;
    trendBuckets[trends[i]].push(trade);
    volBuckets[vols[i]].push(trade);
  }

  const countBars = (labels: string[], target: string) =>
    labels.filter((x) => x === target).length;

  const trend: RegimeBucketResult[] = (
    ["trending_up", "trending_down", "sideways"] as const
  ).map((regime) => ({
    regime,
    bars: countBars(trends, regime),
    ...tradeStatsFromTrades(trendBuckets[regime]),
  }));

  const volatility: RegimeBucketResult[] = (
    ["high_volatility", "low_volatility"] as const
  ).map((regime) => ({
    regime,
    bars: countBars(vols, regime),
    ...tradeStatsFromTrades(volBuckets[regime]),
  }));

  const worksIn: string[] = [];
  const failsIn: string[] = [];
  for (const b of [...trend, ...volatility]) {
    if (b.trades === 0) continue;
    if (b.expectancy != null && b.expectancy > 0) worksIn.push(b.regime);
    else failsIn.push(b.regime);
  }

  return {
    definitions: REGIME_DEFINITIONS,
    trend,
    volatility,
    worksIn,
    failsIn,
  };
}

export async function runValidation(params: {
  strategy: StrategyRow;
  request: ValidationRunRequest;
}): Promise<ValidationReport> {
  const { strategy, request } = params;
  const config = mergeValidationConfig(request.config);

  const definition = buildStrategyDefinition(strategy);
  const symbol = (request.symbol || definition.symbol).toUpperCase();
  const timeframe = request.timeframe || definition.entryTimeframe;
  assertSupportedMarket(symbol, timeframe);

  const initialCapital = request.initialCapital ?? 10_000;
  const commissionPct = request.commissionPct ?? 0.05;
  const slippagePct = request.slippagePct ?? 0.02;

  let bars: OHLCVBar[];
  let provider = "fixture";

  if (request.bars && request.bars.length > 0) {
    bars = request.bars;
  } else {
    let start: Date;
    let end: Date;
    if (request.startDate && request.endDate) {
      start = new Date(request.startDate);
      end = new Date(request.endDate);
    } else if (request.window) {
      [start, end] = windowToDateRange(request.window);
    } else {
      [start, end] = windowToDateRange("12m");
    }
    const fetched = await fetchHistoricalOHLCV({
      symbol,
      timeframe,
      start,
      end,
    });
    bars = fetched.bars;
    provider = fetched.meta.provider;
  }

  if (bars.length < 30) {
    throw new Error(
      `Insufficient bars for validation (${bars.length}). Need at least 30.`
    );
  }

  // --- Chronological split ---
  const idx = chronologicalSplitIndices(bars.length, config);
  assertNoSplitOverlap(idx);
  const trainBars = sliceBars(bars, idx.trainStart, idx.trainEnd);
  const valBars = sliceBars(bars, idx.validationStart, idx.validationEnd);
  const testBars = sliceBars(bars, idx.testStart, idx.testEnd);

  const trainRes = await runSlice({
    strategy,
    bars: trainBars,
    symbol,
    timeframe,
    initialCapital,
    commissionPct,
    slippagePct,
  });
  const valRes = await runSlice({
    strategy,
    bars: valBars,
    symbol,
    timeframe,
    initialCapital,
    commissionPct,
    slippagePct,
  });
  const testRes = await runSlice({
    strategy,
    bars: testBars,
    symbol,
    timeframe,
    initialCapital,
    commissionPct,
    slippagePct,
  });

  const chronological: ChronologicalSplitResult = {
    train: segmentFromResult("train", trainBars, trainRes),
    validation: segmentFromResult("validation", valBars, valRes),
    test: segmentFromResult("test", testBars, testRes),
    degradation: computeDegradation(
      summarizeMetrics(trainRes.metrics),
      summarizeMetrics(valRes.metrics)
    ),
  };

  // --- Walk-forward (uses only bars before final test segment to avoid test leakage) ---
  // Windows are built on the full series EXCEPT we restrict to train+validation region
  // so the reserved TEST set is never used for walk-forward evaluation.
  const preTestBars = sliceBars(bars, 0, idx.testStart);
  const wfIdx = buildWalkForwardWindows(preTestBars.length, config);
  const wfWindows = [];
  for (const w of wfIdx) {
    const tBars = sliceBars(preTestBars, w.trainStart, w.trainEnd);
    const vBars = sliceBars(preTestBars, w.validationStart, w.validationEnd);
    const tRes = await runSlice({
      strategy,
      bars: tBars,
      symbol,
      timeframe,
      initialCapital,
      commissionPct,
      slippagePct,
    });
    const vRes = await runSlice({
      strategy,
      bars: vBars,
      symbol,
      timeframe,
      initialCapital,
      commissionPct,
      slippagePct,
    });
    const tSum = summarizeMetrics(tRes.metrics);
    const vSum = summarizeMetrics(vRes.metrics);
    const deg = computeDegradation(tSum, vSum);
    const pass =
      vSum.expectancy != null &&
      vSum.expectancy > 0 &&
      (vSum.profitFactor == null || vSum.profitFactor >= 1);
    wfWindows.push({
      windowIndex: w.windowIndex,
      trainStart: tBars[0].timestamp.toISOString(),
      trainEnd: tBars[tBars.length - 1].timestamp.toISOString(),
      validationStart: vBars[0].timestamp.toISOString(),
      validationEnd: vBars[vBars.length - 1].timestamp.toISOString(),
      trainBars: tBars.length,
      validationBars: vBars.length,
      trainMetrics: tSum,
      validationMetrics: vSum,
      degradation: deg,
      pass,
    });
  }
  const profitable = wfWindows.filter((w) => w.pass).length;
  const walkForward: WalkForwardResult = {
    windows: wfWindows,
    windowCount: wfWindows.length,
    profitableWindowPct:
      wfWindows.length > 0 ? profitable / wfWindows.length : 0,
    aggregate: {
      avgTrainExpectancy: meanNullable(
        wfWindows.map((w) => w.trainMetrics.expectancy)
      ),
      avgValidationExpectancy: meanNullable(
        wfWindows.map((w) => w.validationMetrics.expectancy)
      ),
      avgProfitFactorRetention: meanNullable(
        wfWindows.map((w) => w.degradation.profitFactorRetention)
      ),
    },
  };

  // --- Parameter sensitivity (evaluation on validation segment only; never test) ---
  const entrySnap = JSON.parse(JSON.stringify(strategy.entry_rules ?? null));
  const exitSnap = JSON.parse(JSON.stringify(strategy.exit_rules ?? null));
  const variants = buildSensitivityVariants(
    strategy.entry_rules,
    strategy.exit_rules,
    config
  );
  const sensResults = [];
  for (const v of variants) {
    const variantStrategy: StrategyRow = {
      ...strategy,
      entry_rules: v.strategy.entry_rules,
      exit_rules: v.strategy.exit_rules,
    };
    const r = await runSlice({
      strategy: variantStrategy,
      bars: valBars,
      symbol,
      timeframe,
      initialCapital,
      commissionPct,
      slippagePct,
    });
    const m = summarizeMetrics(r.metrics);
    const baseExp = chronological.validation.metrics.expectancy;
    sensResults.push({
      parameterPath: v.parameterPath,
      originalValue: v.originalValue,
      testedValue: v.testedValue,
      metrics: m,
      expectancyDelta:
        m.expectancy != null && baseExp != null ? m.expectancy - baseExp : null,
      positiveExpectancy: m.expectancy != null && m.expectancy > 0,
    });
  }
  assertOriginalUnchanged(
    strategy.entry_rules,
    strategy.exit_rules,
    entrySnap,
    exitSnap
  );
  const positivePct =
    sensResults.length > 0
      ? sensResults.filter((x) => x.positiveExpectancy).length /
        sensResults.length
      : 1;
  const sensitivity: SensitivityResult = {
    variants: sensResults,
    positiveExpectancyPct: positivePct,
    originalUnchanged: true,
  };

  // --- Cost stress on validation segment ---
  const costCases = [];
  for (const spec of DEFAULT_COST_STRESS_CASES) {
    const r = await runSlice({
      strategy,
      bars: valBars,
      symbol,
      timeframe,
      initialCapital,
      commissionPct: commissionPct * spec.commissionMultiplier,
      slippagePct: slippagePct * spec.slippageMultiplier,
    });
    const m = summarizeMetrics(r.metrics);
    costCases.push({
      name: spec.name,
      commissionMultiplier: spec.commissionMultiplier,
      slippageMultiplier: spec.slippageMultiplier,
      commissionPct: commissionPct * spec.commissionMultiplier,
      slippagePct: slippagePct * spec.slippageMultiplier,
      metrics: m,
      positiveExpectancy: m.expectancy != null && m.expectancy > 0,
    });
  }
  const costStress: CostStressResult = {
    base: { commissionPct, slippagePct },
    cases: costCases,
  };

  // --- Regimes on full pre-test+test series (full bars) using one Truth Engine run ---
  const fullRes = await runSlice({
    strategy,
    bars,
    symbol,
    timeframe,
    initialCapital,
    commissionPct,
    slippagePct,
  });
  const regimes = buildRegimeReport(bars, fullRes, config);

  // --- Cross-asset ---
  const crossAsset = await runCrossAsset({
    strategy,
    definition,
    timeframe,
    start: bars[0].timestamp,
    end: bars[bars.length - 1].timestamp,
    initialCapital,
    commissionPct,
    slippagePct,
    config,
    injected: request.crossAssetBars,
  });

  const sampleIntegrity = evaluateSampleIntegrity({
    totalTrades:
      chronological.train.tradeCount +
      chronological.validation.tradeCount +
      chronological.test.tradeCount,
    validationTrades: chronological.validation.tradeCount,
    testTrades: chronological.test.tradeCount,
    walkForwardWindows: walkForward.windowCount,
    config,
  });

  const gate = evaluateGate({
    chronological,
    walkForward,
    sensitivity,
    costStress,
    sampleIntegrity,
    crossAsset,
    config,
  });

  return {
    schemaVersion: "validation_engine_v1",
    strategyId: strategy.id,
    strategyVersion: definition.version,
    strategyDefinitionSnapshot: definition,
    config,
    dataset: {
      symbol,
      timeframe,
      start: bars[0].timestamp.toISOString(),
      end: bars[bars.length - 1].timestamp.toISOString(),
      bars: bars.length,
      provider,
    },
    chronological,
    walkForward,
    sensitivity,
    costStress,
    regimes,
    crossAsset,
    sampleIntegrity,
    gate,
    resultSource: "REAL_VALIDATION",
    timestamp: new Date().toISOString(),
  };
}

async function runCrossAsset(params: {
  strategy: StrategyRow;
  definition: StrategyDefinition;
  timeframe: string;
  start: Date;
  end: Date;
  initialCapital: number;
  commissionPct: number;
  slippagePct: number;
  config: ValidationConfig;
  injected?: Record<string, OHLCVBar[]>;
}): Promise<CrossAssetResult> {
  const assets = [];
  const primarySymbol = params.strategy.symbol?.toUpperCase();
  for (const sym of params.config.crossAssetSymbols) {
    if (!(SUPPORTED_SYMBOLS as readonly string[]).includes(sym)) continue;
    // Skip duplicate of the primary asset (already covered by chronological/WF)
    if (primarySymbol && sym === primarySymbol && !params.injected?.[sym]) {
      continue;
    }
    try {
      let assetBars: OHLCVBar[];
      if (params.injected?.[sym]) {
        assetBars = params.injected[sym];
      } else {
        const fetched = await fetchHistoricalOHLCV({
          symbol: sym,
          timeframe: params.timeframe,
          start: params.start,
          end: params.end,
        });
        assetBars = fetched.bars;
      }
      if (assetBars.length < 30) {
        assets.push({
          symbol: sym,
          metrics: null,
          tradeCount: 0,
          pass: false,
          error: `Insufficient bars (${assetBars.length})`,
        });
        continue;
      }
      const row: StrategyRow = {
        ...params.strategy,
        symbol: sym,
      };
      const r = await runSlice({
        strategy: row,
        bars: assetBars,
        symbol: sym,
        timeframe: params.timeframe,
        initialCapital: params.initialCapital,
        commissionPct: params.commissionPct,
        slippagePct: params.slippagePct,
      });
      const m = summarizeMetrics(r.metrics);
      assets.push({
        symbol: sym,
        metrics: m,
        tradeCount: m.totalTrades,
        pass: m.expectancy != null && m.expectancy > 0,
      });
    } catch (err) {
      assets.push({
        symbol: sym,
        metrics: null,
        tradeCount: 0,
        pass: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = assets.filter((a) => a.pass).length;
  return {
    mandatory: params.config.crossAssetMandatory,
    assets,
    summary: `${passed}/${assets.length} assets with positive expectancy`,
  };
}
