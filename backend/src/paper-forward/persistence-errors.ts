/**
 * Phase 4A persistence must fail closed when migration 012 (or deps) are missing.
 */

export const PHASE4_PERSISTENCE_UNAVAILABLE =
  "Phase 4 paper-forward persistence is unavailable. Apply migrations 012 and 013 (and Phase 2/3 migrations) before creating or ticking paper sessions.";

export class Phase4PersistenceError extends Error {
  readonly causeMessage?: string;

  constructor(detail?: string) {
    const message = detail
      ? `${PHASE4_PERSISTENCE_UNAVAILABLE} Detail: ${detail}`
      : PHASE4_PERSISTENCE_UNAVAILABLE;
    super(message);
    this.name = "Phase4PersistenceError";
    this.causeMessage = detail;
  }
}

export function isMissingPhase4RelationError(message: string): boolean {
  return /relation|does not exist|could not find the table|schema cache|undefined table|column .* does not exist|Could not find the .* column/i.test(
    message
  );
}

export function throwIfMissingPhase4Schema(
  context: string,
  errorMessage: string
): void {
  if (isMissingPhase4RelationError(errorMessage)) {
    throw new Phase4PersistenceError(
      `Required schema for "${context}" is missing or unreachable (${errorMessage})`
    );
  }
}
