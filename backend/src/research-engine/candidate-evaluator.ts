/**
 * Truth Engine evaluation for research candidates (TRAIN + VALIDATION only).
 */

import {
  buildStrategyDefinition,
  runTruthBacktest,
  type OHLCVBar,
} from "@/truth-engine";
import { summarizeMetrics } from "@/validation-engine/types";
import type { MetricsSummary } from "@/validation-engine/types";
import type { ResearchConfig } from "./config";
import { assertNotTestSegment } from "./isolation";
import type {
  RobustnessMetrics,
  SegmentEvaluation,
  StrategySnapshot,
} from "./types";

export async function evaluateSegment(params: {
  strategy: StrategySnapshot;
  bars: OHLCVBar[];
  segment: "train" | "validation";
  initialCapital: number;
  commissionPct: number;
  slippagePct: number;
}): Promise<SegmentEvaluation> {
  assertNotTestSegment(params.segment);
  // Schema check
  buildStrategyDefinition({
    id: params.strategy.id,
    name: params.strategy.name,
    symbol: params.strategy.symbol,
    timeframe: params.strategy.timeframe,
    market_type: params.strategy.market_type,
    entry_rules: params.strategy.entry_rules,
    exit_rules: params.strategy.exit_rules,
    version: params.strategy.version,
  });

  const result = await runTruthBacktest({
    strategy: {
      id: params.strategy.id,
      name: params.strategy.name,
      symbol: params.strategy.symbol,
      timeframe: params.strategy.timeframe,
      market_type: params.strategy.market_type,
      entry_rules: params.strategy.entry_rules,
      exit_rules: params.strategy.exit_rules,
      version: params.strategy.version,
    },
    request: {
      strategyId: params.strategy.id,
      symbol: params.strategy.symbol,
      timeframe: params.strategy.timeframe,
      bars: params.bars,
      initialCapital: params.initialCapital,
      commissionPct: params.commissionPct,
      slippagePct: params.slippagePct,
    },
  });

  return {
    segment: params.segment,
    metrics: summarizeMetrics(result.metrics),
    tradeCount: result.metrics.totalTrades,
    barCount: params.bars.length,
    resultSource: "REAL_BACKTEST",
  };
}

export async function evaluateCostStress15(params: {
  strategy: StrategySnapshot;
  validationBars: OHLCVBar[];
  initialCapital: number;
  commissionPct: number;
  slippagePct: number;
  config: ResearchConfig;
}): Promise<RobustnessMetrics> {
  const commissionPct =
    params.commissionPct * params.config.costStressCommissionMultiplier;
  const slippagePct =
    params.slippagePct * params.config.costStressSlippageMultiplier;
  const result = await runTruthBacktest({
    strategy: {
      id: params.strategy.id,
      name: params.strategy.name,
      symbol: params.strategy.symbol,
      timeframe: params.strategy.timeframe,
      market_type: params.strategy.market_type,
      entry_rules: params.strategy.entry_rules,
      exit_rules: params.strategy.exit_rules,
      version: params.strategy.version,
    },
    request: {
      strategyId: params.strategy.id,
      bars: params.validationBars,
      initialCapital: params.initialCapital,
      commissionPct,
      slippagePct,
    },
  });
  const metrics = summarizeMetrics(result.metrics);
  return {
    costStress15: {
      commissionMultiplier: params.config.costStressCommissionMultiplier,
      slippageMultiplier: params.config.costStressSlippageMultiplier,
      metrics,
      positiveExpectancy: metrics.expectancy != null && metrics.expectancy > 0,
    },
  };
}

export type { MetricsSummary };
