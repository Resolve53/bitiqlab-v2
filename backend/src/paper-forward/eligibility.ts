/**
 * Paper session eligibility — server verifies Phase 2 validation provenance.
 * Never trusts client claims that validation passed.
 */

import type {
  PaperEligibilityRequest,
  PaperEligibilityResult,
  ResearchRunRow,
  StrategyValidationRow,
  StrategyVersionRow,
  ValidationGateStatus,
} from "./types";

export class PaperEligibilityError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(reasons.join("; "));
    this.name = "PaperEligibilityError";
    this.reasons = reasons;
  }
}

function asGateStatus(raw: string | null | undefined): ValidationGateStatus | null {
  if (raw === "pass" || raw === "conditional" || raw === "fail") return raw;
  return null;
}

function snapshotSymbol(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  return typeof s.symbol === "string" ? s.symbol : null;
}

function snapshotTimeframe(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  return typeof s.timeframe === "string" ? s.timeframe : null;
}

export interface EligibilityDeps {
  getStrategyVersionById: (
    id: string
  ) => Promise<StrategyVersionRow | null>;
  getStrategyValidationById: (
    id: string
  ) => Promise<StrategyValidationRow | null>;
  getResearchRunById?: (id: string) => Promise<ResearchRunRow | null>;
}

/**
 * Pure eligibility evaluation given loaded rows (testable without DB).
 */
export function evaluateEligibilityFromRows(params: {
  request: PaperEligibilityRequest;
  version: StrategyVersionRow | null;
  validation: StrategyValidationRow | null;
  researchRun?: ResearchRunRow | null;
}): PaperEligibilityResult {
  const { request, version, validation, researchRun } = params;
  const reasons: string[] = [];

  if (!version) {
    reasons.push("Strategy version not found");
  } else if (version.strategy_id !== request.strategyId) {
    reasons.push("strategyVersionId does not belong to strategyId");
  }

  if (!validation) {
    reasons.push("Validation record not found (missing validation)");
  } else {
    if (validation.strategy_id !== request.strategyId) {
      reasons.push("validationId does not belong to strategyId");
    }
    if (
      version &&
      validation.strategy_version != null &&
      Number(validation.strategy_version) !== Number(version.version)
    ) {
      reasons.push(
        `Validation/version mismatch: validation.strategy_version=${validation.strategy_version} vs version=${version.version}`
      );
    }
  }

  if (request.researchRunId) {
    if (!researchRun) {
      reasons.push("researchRunId not found");
    } else if (researchRun.strategy_id !== request.strategyId) {
      reasons.push("researchRunId does not belong to strategyId");
    } else if (
      researchRun.final_validation_id &&
      researchRun.final_validation_id !== request.validationId
    ) {
      reasons.push(
        "researchRunId final_validation_id does not match validationId"
      );
    } else if (
      version &&
      (researchRun.final_candidate_version != null ||
        researchRun.final_champion_version != null) &&
      Number(
        researchRun.final_candidate_version ??
          researchRun.final_champion_version
      ) !== Number(version.version)
    ) {
      reasons.push(
        "researchRunId final_candidate_version does not match strategy version"
      );
    }
  }

  const validationStatus = asGateStatus(validation?.status);
  let requiresConditionalAcknowledgement = false;

  if (!validationStatus) {
    if (validation) reasons.push(`Unknown validation status: ${validation.status}`);
  } else if (validationStatus === "fail") {
    reasons.push("FAIL validation cannot start paper trading");
  } else if (validationStatus === "conditional") {
    requiresConditionalAcknowledgement = true;
    if (!request.acknowledgeConditional) {
      reasons.push(
        "CONDITIONAL validation requires explicit human acknowledgement (acknowledgeConditional=true)"
      );
    }
  } else if (validationStatus === "pass") {
    // eligible if no other blockers
  }

  const eligible = reasons.length === 0;

  return {
    eligible,
    reasons,
    validationStatus,
    requiresConditionalAcknowledgement,
    evidence: {
      strategyId: request.strategyId,
      strategyVersionId: request.strategyVersionId,
      strategyVersion: version?.version ?? null,
      snapshotHash: version?.snapshot_hash ?? null,
      validationId: request.validationId,
      researchRunId: request.researchRunId ?? null,
      symbol:
        validation?.symbol ||
        snapshotSymbol(version?.strategy_snapshot) ||
        null,
      timeframe:
        validation?.timeframe ||
        snapshotTimeframe(version?.strategy_snapshot) ||
        null,
      validationStatus,
    },
  };
}

export async function checkPaperEligibility(
  deps: EligibilityDeps,
  request: PaperEligibilityRequest
): Promise<PaperEligibilityResult> {
  const version = await deps.getStrategyVersionById(request.strategyVersionId);
  const validation = await deps.getStrategyValidationById(
    request.validationId
  );
  let researchRun: ResearchRunRow | null | undefined = undefined;
  if (request.researchRunId && deps.getResearchRunById) {
    researchRun = await deps.getResearchRunById(request.researchRunId);
  }

  return evaluateEligibilityFromRows({
    request,
    version,
    validation,
    researchRun: researchRun ?? null,
  });
}

export function assertEligible(result: PaperEligibilityResult): void {
  if (!result.eligible) {
    throw new PaperEligibilityError(result.reasons);
  }
}
