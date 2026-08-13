# Phase 3 Controlled Autoresearch — assumptions

## Authorities

- **Claude** proposes exactly one structured mutation (tool-use).
- **Truth Engine** measures TRAIN and VALIDATION performance.
- **Deterministic selection gate** decides KEEP / REJECT.
- **Phase 2 Validation Engine** runs **once** after champion selection (includes TEST).

## Data isolation

- Same chronological split as Phase 2: TRAIN 60% / VALIDATION 20% / TEST 20%.
- Split boundaries are frozen at research start.
- Claude receives **TRAIN diagnostics only**.
- Candidate evaluation uses TRAIN + VALIDATION only.
- Selection uses VALIDATION (+ VAL cost ×1.5).
- **TEST never enters the research loop.**
- TEST failure ends the run; it must not trigger another mutation.

## KEEP / REJECT rules (selection-gate.ts)

Reject unless all pass:

1. Not a duplicate hash
2. Validation trades ≥ `minimumValidationTrades` (Phase 2 default 20)
3. Validation expectancy > 0
4. Validation PF ≥ 1.2
5. Validation max DD ≤ 0.2
6. Not TRAIN-only improvement (TRAIN↑ and VAL↓ → reject)
7. Candidate VAL expectancy ≥ baseline VAL expectancy
8. DD increase vs baseline ≤ 5 percentage points
9. Cost ×1.5 on VALIDATION has positive expectancy
10. Win-rate / Sharpe are **not** primary KEEP criteria

## Persistence (fail closed)

Phase 3 research **requires** migrations `010_strategy_versions.sql` and
`011_strategy_research_experiments.sql`.

If required tables are missing, create/update/append operations throw
`Phase3PersistenceError` and the research run fails. No synthetic IDs or
fake successful records are returned.

If a run was created and a later experiment/version write fails, the run is
marked `status=failed` with the original error in `outcome_reasons`, then the
error is rethrown (API returns non-success).


## Versioning

Immutable `strategy_versions` snapshots. Rejected candidates remain auditable.
Active production strategy is unchanged until a future explicit activation (Phase 4+).
