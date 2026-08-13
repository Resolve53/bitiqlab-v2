/**
 * Phase 3 Controlled Autoresearch orchestrator.
 *
 * Claude proposes → Truth Engine measures → code decides.
 * TEST is used exactly once after champion selection via Phase 2 validation.
 */

import { randomUUID } from "crypto";
import {
  assertSupportedMarket,
  buildStrategyDefinition,
  fetchHistoricalOHLCV,
  windowToDateRange,
  type OHLCVBar,
} from "@/truth-engine";
import {
  chronologicalSplitIndices,
  assertNoSplitOverlap,
  sliceBars,
  runValidation,
} from "@/validation-engine";
import {
  RESEARCH_ENGINE_VERSION,
  SPLIT_POLICY_VERSION,
  mergeResearchConfig,
  type ResearchConfig,
} from "./config";
import {
  evaluateCostStress15,
  evaluateSegment,
} from "./candidate-evaluator";
import {
  buildExperimentId,
  buildResearchRunId,
  hashBars,
  hashStrategyRules,
  sha256Hex,
  stableStringify,
} from "./experiment-id";
import {
  TestLeakageError,
  assertBarsAreSubset,
  assertNoTestPayload,
  assertSelectionMetricsHaveNoTest,
  assertTrainDiagnosticsOnly,
} from "./isolation";
import { applyMutation, assertParentUnchanged } from "./mutation-applier";
import { ALLOWED_MUTATION_TYPES } from "./mutation-schema";
import { createClaudeMutationProposer } from "./mutation-proposer";
import { evaluateSelection } from "./selection-gate";
import type {
  DatasetProvenance,
  ExperimentRecord,
  MutationProposer,
  ResearchBaseline,
  ResearchRunRequest,
  ResearchRunResult,
  StrategySnapshot,
  TrainDiagnostics,
} from "./types";

export type StrategyRow = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  market_type?: string;
  entry_rules?: unknown;
  exit_rules?: unknown;
  version?: number;
  status?: string;
};

export type ResearchPersistence = {
  ensureBaselineVersion: (params: {
    strategyId: string;
    version: number;
    snapshot: StrategySnapshot;
    snapshotHash: string;
  }) => Promise<void>;
  createResearchRun: (row: Record<string, unknown>) => Promise<{ id: string }>;
  updateResearchRun: (
    id: string,
    updates: Record<string, unknown>
  ) => Promise<void>;
  appendExperiment: (row: Record<string, unknown>) => Promise<void>;
  createStrategyVersion: (row: {
    strategy_id: string;
    version: number;
    parent_version: number | null;
    source: string;
    strategy_snapshot: unknown;
    snapshot_hash: string;
    notes?: string;
  }) => Promise<void>;
};

function toSnapshot(strategy: StrategyRow, version: number): StrategySnapshot {
  return {
    id: strategy.id,
    name: strategy.name,
    symbol: strategy.symbol,
    timeframe: strategy.timeframe,
    market_type: strategy.market_type || "spot",
    entry_rules: strategy.entry_rules ?? {},
    exit_rules: strategy.exit_rules ?? {},
    version,
  };
}

function freezeProvenance(
  bars: OHLCVBar[],
  idx: ReturnType<typeof chronologicalSplitIndices>,
  meta: { symbol: string; timeframe: string; provider: string }
): {
  provenance: DatasetProvenance;
  trainBars: OHLCVBar[];
  valBars: OHLCVBar[];
  testBars: OHLCVBar[];
} {
  const trainBars = sliceBars(bars, idx.trainStart, idx.trainEnd);
  const valBars = sliceBars(bars, idx.validationStart, idx.validationEnd);
  const testBars = sliceBars(bars, idx.testStart, idx.testEnd);

  assertBarsAreSubset(trainBars, bars, idx.trainStart, idx.trainEnd, "train");
  assertBarsAreSubset(
    valBars,
    bars,
    idx.validationStart,
    idx.validationEnd,
    "validation"
  );
  assertBarsAreSubset(testBars, bars, idx.testStart, idx.testEnd, "test");

  const provenance: DatasetProvenance = {
    symbol: meta.symbol,
    timeframe: meta.timeframe,
    provider: meta.provider,
    trainStart: trainBars[0].timestamp.toISOString(),
    trainEnd: trainBars[trainBars.length - 1].timestamp.toISOString(),
    validationStart: valBars[0].timestamp.toISOString(),
    validationEnd: valBars[valBars.length - 1].timestamp.toISOString(),
    testStart: testBars[0].timestamp.toISOString(),
    testEnd: testBars[testBars.length - 1].timestamp.toISOString(),
    trainBars: trainBars.length,
    validationBars: valBars.length,
    testBars: testBars.length,
    totalBars: bars.length,
    splitPolicyVersion: SPLIT_POLICY_VERSION,
    trainHash: hashBars(trainBars),
    validationHash: hashBars(valBars),
    testHash: hashBars(testBars),
    seriesHash: hashBars(bars),
  };

  return { provenance, trainBars, valBars, testBars };
}

async function defaultFinalValidation(
  champion: StrategySnapshot,
  bars: OHLCVBar[],
  request: ResearchRunRequest
): Promise<{
  validationId: string | null;
  status: "pass" | "conditional" | "fail";
  reasons: string[];
  score: number | null;
  chronologicalTestMetrics: import("@/validation-engine").MetricsSummary | null;
}> {
  const report = await runValidation({
    strategy: {
      id: champion.id,
      name: champion.name,
      symbol: champion.symbol,
      timeframe: champion.timeframe,
      market_type: champion.market_type,
      entry_rules: champion.entry_rules,
      exit_rules: champion.exit_rules,
      version: champion.version,
    },
    request: {
      strategyId: champion.id,
      bars,
      initialCapital: request.initialCapital ?? 10_000,
      commissionPct: request.commissionPct ?? 0.05,
      slippagePct: request.slippagePct ?? 0.02,
    },
  });
  return {
    validationId: null,
    status: report.gate.status,
    reasons: report.gate.reasons,
    score: report.gate.score,
    chronologicalTestMetrics: report.chronological.test.metrics,
  };
}

export async function runControlledResearch(params: {
  strategy: StrategyRow;
  request: ResearchRunRequest;
  persistence?: ResearchPersistence | null;
}): Promise<ResearchRunResult> {
  const { strategy, request } = params;
  const config = mergeResearchConfig(request.config);
  const startedAt = new Date().toISOString();
  const initialCapital = request.initialCapital ?? 10_000;
  const commissionPct = request.commissionPct ?? 0.05;
  const slippagePct = request.slippagePct ?? 0.02;

  // Executable check
  const definition = buildStrategyDefinition({
    id: strategy.id,
    name: strategy.name,
    symbol: strategy.symbol,
    timeframe: strategy.timeframe,
    market_type: strategy.market_type || "spot",
    entry_rules: strategy.entry_rules,
    exit_rules: strategy.exit_rules,
    version: strategy.version ?? 1,
  });

  const symbol = (request.symbol || definition.symbol).toUpperCase();
  const timeframe = request.timeframe || definition.entryTimeframe;
  assertSupportedMarket(symbol, timeframe);

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
    throw new Error(`Insufficient bars for research (${bars.length})`);
  }

  const splitIdx = chronologicalSplitIndices(bars.length, config);
  assertNoSplitOverlap(splitIdx);
  const frozen = freezeProvenance(bars, splitIdx, {
    symbol,
    timeframe,
    provider,
  });

  // Freeze parent snapshot — never overwrite
  const startingVersion = strategy.version ?? 1;
  const parentSnapshot = toSnapshot(
    { ...strategy, symbol, timeframe },
    startingVersion
  );
  const parentHash = hashStrategyRules(parentSnapshot);
  const parentFrozen = JSON.parse(
    JSON.stringify(parentSnapshot)
  ) as StrategySnapshot;

  // Baseline TRAIN + VALIDATION only
  const baselineTrain = await evaluateSegment({
    strategy: parentSnapshot,
    bars: frozen.trainBars,
    segment: "train",
    initialCapital,
    commissionPct,
    slippagePct,
  });
  const baselineVal = await evaluateSegment({
    strategy: parentSnapshot,
    bars: frozen.valBars,
    segment: "validation",
    initialCapital,
    commissionPct,
    slippagePct,
  });

  const baseline: ResearchBaseline = {
    version: startingVersion,
    snapshot: parentSnapshot,
    snapshotHash: parentHash,
    train: baselineTrain,
    validation: baselineVal,
  };

  const configHash = sha256Hex(stableStringify(config));
  const researchRunId =
    request.skipPersistence && !params.persistence
      ? buildResearchRunId({
          strategyId: strategy.id,
          seriesHash: frozen.provenance.seriesHash,
          startingVersion,
          configHash,
          startedAtIso: startedAt,
        })
      : randomUUID();

  const persistence = request.skipPersistence
    ? null
    : params.persistence ?? null;

  if (persistence) {
    await persistence.ensureBaselineVersion({
      strategyId: strategy.id,
      version: startingVersion,
      snapshot: parentSnapshot,
      snapshotHash: parentHash,
    });
    await persistence.createResearchRun({
      id: researchRunId,
      strategy_id: strategy.id,
      starting_version: startingVersion,
      status: "running",
      config,
      dataset_provenance: frozen.provenance,
      model_id: null,
      evaluator_version: RESEARCH_ENGINE_VERSION,
      started_at: startedAt,
    });
  }

  const propose: MutationProposer =
    request.proposeMutation ||
    createClaudeMutationProposer({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

  const experiments: ExperimentRecord[] = [];
  const seenHashes = new Set<string>([parentHash]);
  let currentBaseline = baseline;
  let consecutiveNoImprovement = 0;
  let claudeCalls = 0;
  let candidates = 0;
  let nextVersion = startingVersion + 1;
  let stopReason: string | null = null;
  const deadline = Date.now() + config.timeoutMs;

  for (let generation = 1; generation <= config.maxGenerations; generation++) {
    if (candidates >= config.maxCandidates) {
      stopReason = "max_candidates";
      break;
    }
    if (claudeCalls >= config.maxClaudeCalls) {
      stopReason = "max_claude_calls";
      break;
    }
    if (Date.now() > deadline) {
      stopReason = "timeout";
      break;
    }
    if (consecutiveNoImprovement >= config.maxConsecutiveNoImprovement) {
      stopReason = "no_improvement";
      break;
    }

    const trainDiagnostics: TrainDiagnostics = {
      metrics: currentBaseline.train.metrics,
      tradeCount: currentBaseline.train.tradeCount,
      barCount: currentBaseline.train.barCount,
      segment: "train",
    };
    assertTrainDiagnosticsOnly(trainDiagnostics);

    const previousForClaude = experiments.map((e) => ({
      mutation: e.mutation,
      decision: e.decision,
      rejectionReasons: e.rejectionReasons,
      hypothesis: e.hypothesis,
    }));
    assertNoTestPayload({
      parent: currentBaseline.snapshot,
      trainDiagnostics,
      previousExperiments: previousForClaude,
    });

    let mutationRaw: unknown = null;
    let mutation = null as ReturnType<typeof applyMutation> extends never
      ? never
      : import("./types").StructuredMutation | null;
    let modelId: string | null = null;
    let proposalError: string | null = null;

    try {
      claudeCalls += 1;
      const proposal = await propose({
        parent: currentBaseline.snapshot,
        trainDiagnostics,
        previousExperiments: previousForClaude,
        allowedMutationTypes: ALLOWED_MUTATION_TYPES,
      });
      // Guard: proposer must not have been given TEST
      assertNoTestPayload(trainDiagnostics);
      mutation = proposal.mutation;
      mutationRaw = proposal.raw;
      modelId = proposal.modelId;
    } catch (err) {
      proposalError = err instanceof Error ? err.message : String(err);
    }

    candidates += 1;

    if (!mutation) {
      const experimentId = buildExperimentId({
        researchRunId,
        generation,
        parentSnapshotHash: currentBaseline.snapshotHash,
        candidateSnapshotHash: "invalid",
        mutation: null,
      });
      const exp: ExperimentRecord = {
        experimentId,
        researchRunId,
        generation,
        parentStrategyId: strategy.id,
        parentVersion: currentBaseline.version,
        parentSnapshotHash: currentBaseline.snapshotHash,
        candidateSnapshot: currentBaseline.snapshot,
        candidateSnapshotHash: currentBaseline.snapshotHash,
        mutation: null,
        hypothesis: null,
        claudeProposalRaw: mutationRaw,
        trainMetrics: null,
        validationMetrics: null,
        robustnessMetrics: null,
        decision: "REJECT",
        rejectionReasons: [
          `invalid_mutation: ${proposalError ?? "no mutation"}`,
        ],
        selectionChecks: {},
        duplicateOf: null,
        modelId,
        evaluatorVersion: RESEARCH_ENGINE_VERSION,
        provenance: { resultSource: "REAL_RESEARCH", testUsed: false },
        createdAt: new Date().toISOString(),
      };
      experiments.push(exp);
      consecutiveNoImprovement += 1;
      if (persistence) {
        await persistence.appendExperiment(experimentToRow(exp));
      }
      assertParentUnchanged(parentFrozen, {
        ...parentFrozen,
        entry_rules: strategy.entry_rules,
        exit_rules: strategy.exit_rules,
      });
      continue;
    }

    let candidate: StrategySnapshot;
    try {
      candidate = applyMutation(currentBaseline.snapshot, mutation);
      // Re-validate schema
      buildStrategyDefinition({
        id: candidate.id,
        name: candidate.name,
        symbol: candidate.symbol,
        timeframe: candidate.timeframe,
        market_type: candidate.market_type,
        entry_rules: candidate.entry_rules,
        exit_rules: candidate.exit_rules,
        version: nextVersion,
      });
      candidate = { ...candidate, version: nextVersion };
    } catch (err) {
      const experimentId = buildExperimentId({
        researchRunId,
        generation,
        parentSnapshotHash: currentBaseline.snapshotHash,
        candidateSnapshotHash: "apply_failed",
        mutation,
      });
      const exp: ExperimentRecord = {
        experimentId,
        researchRunId,
        generation,
        parentStrategyId: strategy.id,
        parentVersion: currentBaseline.version,
        parentSnapshotHash: currentBaseline.snapshotHash,
        candidateSnapshot: currentBaseline.snapshot,
        candidateSnapshotHash: currentBaseline.snapshotHash,
        mutation,
        hypothesis: mutation.hypothesis,
        claudeProposalRaw: mutationRaw,
        trainMetrics: null,
        validationMetrics: null,
        robustnessMetrics: null,
        decision: "REJECT",
        rejectionReasons: [
          `mutation_apply_failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ],
        selectionChecks: {},
        duplicateOf: null,
        modelId,
        evaluatorVersion: RESEARCH_ENGINE_VERSION,
        provenance: { resultSource: "REAL_RESEARCH", testUsed: false },
        createdAt: new Date().toISOString(),
      };
      experiments.push(exp);
      consecutiveNoImprovement += 1;
      if (persistence) {
        await persistence.appendExperiment(experimentToRow(exp));
      }
      continue;
    }

    // Parent must remain unchanged
    assertParentUnchanged(parentFrozen, {
      ...toSnapshot(strategy, startingVersion),
      entry_rules: strategy.entry_rules,
      exit_rules: strategy.exit_rules,
    });

    const candidateHash = hashStrategyRules(candidate);
    const isDuplicate = seenHashes.has(candidateHash);
    const duplicateOf = isDuplicate
      ? experiments.find((e) => e.candidateSnapshotHash === candidateHash)
          ?.experimentId ?? "prior"
      : null;

    let trainEval = null;
    let valEval = null;
    let robustness = null;
    let selection;

    if (isDuplicate) {
      selection = evaluateSelection({
        baselineValidation: currentBaseline.validation.metrics,
        candidateTrain: currentBaseline.train.metrics,
        candidateValidation: currentBaseline.validation.metrics,
        baselineTrain: currentBaseline.train.metrics,
        robustness: null,
        config,
        isDuplicate: true,
        duplicateOf,
      });
      // Force reject reasons for duplicate even if other checks weirdly pass
      if (selection.decision === "KEEP") {
        selection = {
          decision: "REJECT" as const,
          reasons: [`not_duplicate: Duplicate of ${duplicateOf}`],
          checks: selection.checks,
        };
      }
      consecutiveNoImprovement += 1;
      if (duplicateOf) {
        // duplicate stop can be configured — count toward no improvement
      }
    } else {
      // TRAIN + VALIDATION only — never TEST
      trainEval = await evaluateSegment({
        strategy: candidate,
        bars: frozen.trainBars,
        segment: "train",
        initialCapital,
        commissionPct,
        slippagePct,
      });
      valEval = await evaluateSegment({
        strategy: candidate,
        bars: frozen.valBars,
        segment: "validation",
        initialCapital,
        commissionPct,
        slippagePct,
      });
      assertSelectionMetricsHaveNoTest({
        train: trainEval.metrics,
        validation: valEval.metrics,
      });

      robustness = await evaluateCostStress15({
        strategy: candidate,
        validationBars: frozen.valBars,
        initialCapital,
        commissionPct,
        slippagePct,
        config,
      });

      selection = evaluateSelection({
        baselineValidation: currentBaseline.validation.metrics,
        candidateTrain: trainEval.metrics,
        candidateValidation: valEval.metrics,
        baselineTrain: currentBaseline.train.metrics,
        robustness,
        config,
        isDuplicate: false,
      });
      seenHashes.add(candidateHash);
    }

    const experimentId = buildExperimentId({
      researchRunId,
      generation,
      parentSnapshotHash: currentBaseline.snapshotHash,
      candidateSnapshotHash: candidateHash,
      mutation,
    });

    const exp: ExperimentRecord = {
      experimentId,
      researchRunId,
      generation,
      parentStrategyId: strategy.id,
      parentVersion: currentBaseline.version,
      parentSnapshotHash: currentBaseline.snapshotHash,
      candidateSnapshot: candidate,
      candidateSnapshotHash: candidateHash,
      mutation,
      hypothesis: mutation.hypothesis,
      claudeProposalRaw: mutationRaw,
      trainMetrics: trainEval?.metrics ?? null,
      validationMetrics: valEval?.metrics ?? null,
      robustnessMetrics: robustness,
      decision: selection.decision,
      rejectionReasons: selection.reasons,
      selectionChecks: selection.checks,
      duplicateOf,
      modelId,
      evaluatorVersion: RESEARCH_ENGINE_VERSION,
      provenance: {
        resultSource: "REAL_RESEARCH",
        segmentsUsed: ["train", "validation"],
        testUsed: false,
      },
      createdAt: new Date().toISOString(),
    };
    experiments.push(exp);

    if (persistence) {
      await persistence.appendExperiment(experimentToRow(exp));
      if (selection.decision === "KEEP") {
        await persistence.createStrategyVersion({
          strategy_id: strategy.id,
          version: nextVersion,
          parent_version: currentBaseline.version,
          source: "phase3_keep",
          strategy_snapshot: candidate,
          snapshot_hash: candidateHash,
          notes: `Research KEEP ${experimentId}`,
        });
      } else {
        await persistence.createStrategyVersion({
          strategy_id: strategy.id,
          version: nextVersion,
          parent_version: currentBaseline.version,
          source: "phase3_reject_audit",
          strategy_snapshot: candidate,
          snapshot_hash: candidateHash,
          notes: `Research REJECT ${experimentId}`,
        });
      }
    }

    if (selection.decision === "KEEP" && trainEval && valEval) {
      currentBaseline = {
        version: nextVersion,
        snapshot: candidate,
        snapshotHash: candidateHash,
        train: trainEval,
        validation: valEval,
      };
      consecutiveNoImprovement = 0;
      nextVersion += 1;
    } else {
      consecutiveNoImprovement += 1;
      nextVersion += 1;
    }

    if (isDuplicate) {
      stopReason = "duplicate_proposal";
      break;
    }
  }

  if (!stopReason) {
    if (candidates >= config.maxCandidates) stopReason = "max_candidates";
    else if (claudeCalls >= config.maxClaudeCalls) stopReason = "max_claude_calls";
    else stopReason = "max_generations";
  }

  // Champion = last KEEP baseline if advanced, else starting baseline
  const keepExps = experiments.filter((e) => e.decision === "KEEP");
  const lastKeep = keepExps.length > 0 ? keepExps[keepExps.length - 1] : null;
  const championSnapshot = lastKeep
    ? lastKeep.candidateSnapshot
    : baseline.snapshot;
  const championHash = lastKeep
    ? lastKeep.candidateSnapshotHash
    : baseline.snapshotHash;
  const championVersion = lastKeep
    ? lastKeep.candidateSnapshot.version
    : baseline.version;

  // FINAL Phase 2 validation — TEST used exactly once here
  let finalValidation: ResearchRunResult["finalValidation"] = null;
  let status = "completed";
  let outcome = "completed_no_champion_validation";
  const outcomeReasons: string[] = [`stop: ${stopReason}`];

  if (lastKeep) {
    const runFinal =
      request.runFinalValidation ||
      ((champ: StrategySnapshot, allBars: OHLCVBar[]) =>
        defaultFinalValidation(champ, allBars, request));

    const fv = await runFinal(championSnapshot, bars);
    finalValidation = {
      validationId: fv.validationId,
      status: fv.status,
      reasons: fv.reasons,
      score: fv.score,
      chronologicalTestMetrics: fv.chronologicalTestMetrics,
    };

    if (fv.status === "pass") {
      status = "validated_pass";
      outcome = "validated_champion";
    } else if (fv.status === "conditional") {
      status = "validated_conditional";
      outcome = "conditional_human_review";
    } else {
      status = "validated_fail";
      outcome = "failed_final_confirmation";
      // DO NOT restart research with TEST info
      outcomeReasons.push(
        "Final Phase 2 validation failed — research ends without further mutation"
      );
    }
    outcomeReasons.push(...fv.reasons);
  } else {
    outcome = "no_keep_candidate";
    outcomeReasons.push("No KEEP candidate — skipping final TEST validation");
  }

  const completedAt = new Date().toISOString();

  // Active strategy must still be the original rules
  assertParentUnchanged(parentFrozen, {
    ...toSnapshot(strategy, startingVersion),
    entry_rules: strategy.entry_rules,
    exit_rules: strategy.exit_rules,
  });

  if (persistence) {
    await persistence.updateResearchRun(researchRunId, {
      status,
      final_candidate_version: lastKeep ? championVersion : null,
      final_candidate_snapshot: lastKeep ? championSnapshot : null,
      final_candidate_snapshot_hash: lastKeep ? championHash : null,
      final_validation_id: finalValidation?.validationId ?? null,
      outcome,
      outcome_reasons: outcomeReasons,
      completed_at: completedAt,
    });
  }

  return {
    schemaVersion: "research_engine_v1",
    researchRunId,
    strategyId: strategy.id,
    startingVersion,
    status,
    config,
    dataset: frozen.provenance,
    baseline,
    experiments,
    champion: {
      version: lastKeep ? championVersion : null,
      snapshot: lastKeep ? championSnapshot : null,
      snapshotHash: lastKeep ? championHash : null,
      fromExperimentId: lastKeep?.experimentId ?? null,
    },
    finalValidation,
    outcome,
    outcomeReasons,
    modelId: experiments.map((e) => e.modelId).find(Boolean) ?? null,
    evaluatorVersion: RESEARCH_ENGINE_VERSION,
    startedAt,
    completedAt,
    resultSource: "REAL_RESEARCH",
    activation: {
      autoActivated: false,
      autoPaperTrading: false,
      note: "Research results do not automatically activate or paper-trade a strategy.",
    },
  };
}

function experimentToRow(exp: ExperimentRecord): Record<string, unknown> {
  return {
    experiment_id: exp.experimentId,
    research_run_id: exp.researchRunId,
    generation: exp.generation,
    parent_strategy_id: exp.parentStrategyId,
    parent_version: exp.parentVersion,
    parent_snapshot_hash: exp.parentSnapshotHash,
    candidate_snapshot: exp.candidateSnapshot,
    candidate_snapshot_hash: exp.candidateSnapshotHash,
    mutation_type: exp.mutation?.mutation_type ?? null,
    changed_field: exp.mutation?.path ?? null,
    old_value: exp.mutation ? exp.mutation.old_value : null,
    new_value: exp.mutation ? exp.mutation.new_value : null,
    hypothesis: exp.hypothesis,
    claude_proposal_raw: exp.claudeProposalRaw,
    train_metrics: exp.trainMetrics,
    validation_metrics: exp.validationMetrics,
    robustness_metrics: exp.robustnessMetrics,
    decision: exp.decision,
    rejection_reasons: exp.rejectionReasons,
    selection_checks: exp.selectionChecks,
    duplicate_of: exp.duplicateOf,
    model_id: exp.modelId,
    evaluator_version: exp.evaluatorVersion,
    provenance: exp.provenance,
    created_at: exp.createdAt,
  };
}

export { TestLeakageError };
