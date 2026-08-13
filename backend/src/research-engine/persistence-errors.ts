/**
 * Phase 3 persistence must fail closed when migrations 010/011 are missing.
 */

export const PHASE3_PERSISTENCE_UNAVAILABLE =
  "Phase 3 persistence is unavailable. Apply migrations 010 and 011 before running research.";

export class Phase3PersistenceError extends Error {
  readonly causeMessage?: string;

  constructor(detail?: string) {
    const message = detail
      ? `${PHASE3_PERSISTENCE_UNAVAILABLE} Detail: ${detail}`
      : PHASE3_PERSISTENCE_UNAVAILABLE;
    super(message);
    this.name = "Phase3PersistenceError";
    this.causeMessage = detail;
  }
}

/** Detect missing-relation / unmigrated-table errors from PostgREST/Supabase. */
export function isMissingPhase3RelationError(message: string): boolean {
  return /relation|does not exist|could not find the table|schema cache|undefined table/i.test(
    message
  );
}

export function throwIfMissingPhase3Relation(
  table: string,
  errorMessage: string
): void {
  if (isMissingPhase3RelationError(errorMessage)) {
    throw new Phase3PersistenceError(
      `Required table "${table}" is missing or unreachable (${errorMessage})`
    );
  }
}
