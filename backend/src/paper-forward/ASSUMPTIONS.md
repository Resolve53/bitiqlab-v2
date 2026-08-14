# Phase 4B / 4C — Paper-forward simulated execution + operations

Phase 4A established immutable sessions and safety quarantine.
Phase 4B adds **deterministic simulated paper execution** on RUNNING sessions.
Phase 4C adds **operations, evaluation, readiness, and human review**.

It does **not**:
- place Binance (testnet or live) market/limit orders
- call Cornix, webhooks, or legacy execute-signal paths
- mutate `strategies.entry_rules` / `exit_rules`
- rewrite strategies or invoke Claude as a promotion authority
- automatically activate live trading
- start a real-money phase

`ENABLE_LIVE_TRADING` remains false-safe. Paper fills never touch exchange order APIs.

## Execution authority

Execution uses **only** `paper_forward_sessions.strategy_snapshot` (the frozen
row on `trading_sessions`), never the live `strategies` table.

Before a tick:

1. Snapshot must exist and parse to a Truth Engine `StrategyDefinition`.
2. `hashStrategyRules(snapshot)` must equal `session.snapshot_hash`.
3. Mismatch or corrupt snapshot → session `FAILED` (fail closed).

## Candle processing

- Source: same Binance OHLCV path as the Truth Engine (`fetchHistoricalOHLCV` / `BinanceDataFetcher` public klines).
- **Only CLOSED candles** are processed. A candle with open time `T` and timeframe interval `I` is closed iff `T + I <= now`.
- The currently forming candle is never evaluated.
- Bars are sorted strictly ascending; duplicates by timestamp are dropped; a bar whose timestamp is **after** `now` is rejected.
- No future-bar access: indicators/rules at index `i` read only bars `0..i`.
- Resume cursor: `trading_sessions.last_processed_candle_ts` (candle **open** time).
- A bar is processed iff `bar.timestamp > last_processed_candle_ts`.
- First tick of a session processes closed candles **at or after** `started_at` (no historical backfill as paper trades). Warmup bars before that are used only for indicators.
- Max bars per tick is bounded (500). This is a deterministic worker function, not an infinite process.

## Signal evaluation

Reuses `evaluateCondition` / `buildIndicatorSeries` from the Truth Engine.
Entry/exit timing matches Phase 1:

- Rules evaluate on **close of candle N**.
- Entry/strategy-exit fills at **open of N+1** (+ slippage).
- After an entry fill at open of N+1, **that same bar's OHLC** is checked for SL/TP.
- One open position per session. First matching directional setup wins (stable order).

## Fill semantics (simulated)

Identical conservative math to Truth Engine `ASSUMPTIONS.md`:

- Slippage: buy worsens up; sell worsens down.
- Commission: `price × quantity × commissionRate` on entry and exit.
- Defaults: commission 0.05%, slippage 0.02% (frozen from snapshot fees when present).
- Gap fills: SL through open fills at slipped open; TP gap does **not** credit the favorable open (fill at target + slippage).
- No `end_of_test` flattening — open paper positions remain open until SL/TP/strategy-exit/timeout/abort.

### SL/TP same-candle ambiguity

If both stop and target are touched in one OHLC candle and intrabar order is unknowable:
**assume adverse (stop loss) first.** `intrabarConflict = true`. Do not invent favorable execution.

## Position sizing

```
requestedRiskUsd = equity × (riskPerTradePct / 100)
riskPerUnit      = |entry − stop|
quantityRisk     = requestedRiskUsd / riskPerUnit
costPerUnit      = entry × (1/leverage + feeRate)
maxAffordableQty = equity / costPerUnit
quantity         = min(quantityRisk, maxAffordableQty)
actualRiskUsd    = quantity × riskPerUnit
```

Spot requires `leverage = 1`. Leverage does not multiply configured account risk; it only sets margin.

SHORT is simulated whenever the frozen snapshot defines a short entry setup (parity with Truth Engine). This does not imply exchange borrow/short availability.

## Persistence / idempotency

Migration `013_paper_forward_execution.sql`:

- `paper_forward_events` — append-only; `UNIQUE (session_id, event_type, candle_timestamp)` and `UNIQUE (idempotency_key)`.
- `paper_forward_trades` — `UNIQUE (session_id, entry_candle_ts)`.
- `paper_forward_positions` — at most one row per session (current open sim position).
- Session cursor + `paper_metrics` / `execution_state`.

Duplicate candle execution is refused (cursor + unique constraints). Persistence errors fail closed: no fake IDs, no success payload.

## Lifecycle

Tick **refuses** CREATED, PAUSED, COMPLETED, FAILED, ABORTED.
Only `RUNNING` sessions execute.

## Paper metrics

Computed from **simulated forward trades**, never copied from historical backtests:

starting capital, current equity, realized P&L, unrealized P&L (mark at last closed close),
total trades, wins, losses, win rate, max drawdown, fees paid.

## UI

Paper Trading surfaces must be labeled **PAPER / SIMULATED**. They must not look like real capital.

---

# Phase 4C — Paper-forward operations + evaluation

## Session operations

Legal transitions (unchanged from 4A, plus complete used in ops):

| From | To |
|---|---|
| CREATED | RUNNING, ABORTED, FAILED |
| RUNNING | PAUSED, COMPLETED, FAILED, ABORTED |
| PAUSED | RUNNING, COMPLETED, FAILED, ABORTED |
| COMPLETED / FAILED / ABORTED | none (terminal — cannot restart) |

`POST /api/paper-forward/sessions/:id/complete` moves RUNNING or PAUSED → COMPLETED.
Completing does **not** flatten leftover simulated positions (same as 4B: no `end_of_test`).
Start / pause / resume / abort APIs from 4A remain.

## Processing / scheduling

There is **no in-process infinite loop**. Production should cron:

```
POST /api/paper-forward/scheduler/run
Header: X-Paper-Forward-Scheduler-Token: $PAPER_FORWARD_SCHEDULER_TOKEN
```

If `PAPER_FORWARD_SCHEDULER_TOKEN` is unset, a human actor is required (no anonymous mass-tick).

Per RUNNING session:

1. Detect stale (no successful tick for `PAPER_FORWARD_STALE_AFTER_HOURS`, default 6h). Audit `STALE_DETECTED`. Do **not** auto-fail solely for staleness.
2. Compare-and-set lease lock (`tick_lock_token`, `tick_lock_until`). Expired leases are stealable after crash/deploy.
3. Call Phase 4B `tickPaperSession` (idempotent cursor + unique events — no duplicate candles).
4. On success: `last_tick_at`, increment `candles_processed`, persist evaluation + readiness.
5. On failure: increment `tick_error_count`. At `PAPER_FORWARD_MAX_TICK_ERRORS` (default 5) → session `FAILED`.
6. Release lock (or let lease expire on crash).

Max sessions per run: `PAPER_FORWARD_SCHEDULER_MAX_SESSIONS` (default 25). Lock lease: `PAPER_FORWARD_LOCK_LEASE_MS` (default 120000).

## Forward evaluation formulas

Source: **only** Phase 4B `paper_forward_trades` with `status=closed`. Never Phase 2 validation metrics.

Let closed trade net P&L be `p_i` (includes fees already in simulated `realized_pnl`).

- elapsed hours = `(end − started_at) / 3600000` where end is `completed_at` / `failed_at` / `aborted_at` / now
- closed candles processed = `trading_sessions.candles_processed` (fallback: count `candle_processed` events)
- trades = count closed
- wins = count `p_i > 0`; losses = count `p_i < 0`
- win rate = wins / closed (0 if none)
- expectancy = mean(`p_i`) or null if no closed trades
- profit factor = grossProfit / |grossLoss|; **null** if wins exist and grossLoss=0; **0** if closed trades exist with no profit and no loss path that yields PF; null if no trades
- realized P&L = sum(`p_i`)
- fees = sum of trade `fee` (open + closed)
- equity curve = initial capital, then cumulative `p_i` at each exit (source tagged `paper_forward_simulated`)
- max drawdown = Truth Engine `calcMaxDrawdown` on that equity path (fraction)
- consistency = mean expectancy of first half vs second half of closed trades (need ≥2 trades)

## Exact readiness criteria

Deterministic code in `readiness-gate.ts`. Claude is not consulted. `force=true` is not an input.

Statuses: `NOT_READY` | `READY_FOR_REVIEW` | `REJECT`.

Hard REJECT even with a small sample:

- session `FAILED`
- frozen snapshot hash mismatch / corrupt
- missing `validation_id` or validation `fail` (CONDITIONAL requires `conditional_acknowledged`)
- `tick_error_count >= maxTickErrors`
- max drawdown > `maxDrawdown`

After sufficient sample, also hard REJECT when:

- expectancy < `minExpectancy`
- profit factor < `minProfitFactor` (null PF with wins and zero losses **passes**)
- win rate < `minWinRate`
- first-half or second-half expectancy < `minHalfExpectancy`
- max consecutive losses > `maxConsecutiveLosses`

Insufficient sample (and no hard fail) → `NOT_READY`.

All hard+sample checks pass → `READY_FOR_REVIEW`.

Defaults (env override in parentheses):

| Key | Default | Env |
|---|---|---|
| minClosedTrades | 20 | `PAPER_FORWARD_MIN_TRADES` |
| minClosedCandles | 100 | `PAPER_FORWARD_MIN_CANDLES` |
| minElapsedHours | 24 | `PAPER_FORWARD_MIN_ELAPSED_HOURS` |
| minExpectancy | 0 | `PAPER_FORWARD_MIN_EXPECTANCY` |
| minProfitFactor | 1.2 | `PAPER_FORWARD_MIN_PROFIT_FACTOR` |
| maxDrawdown | 0.20 | `PAPER_FORWARD_MAX_DRAWDOWN` |
| minWinRate | 0.40 | `PAPER_FORWARD_MIN_WIN_RATE` |
| minHalfExpectancy | 0 | `PAPER_FORWARD_MIN_HALF_EXPECTANCY` |
| maxConsecutiveLosses | 10 | `PAPER_FORWARD_MAX_CONSECUTIVE_LOSSES` |
| maxTickErrors | 5 | `PAPER_FORWARD_MAX_TICK_ERRORS` |
| staleAfterHours | 6 | `PAPER_FORWARD_STALE_AFTER_HOURS` |

Gate output is tagged `evaluationSource: paper_forward_simulated` and `historicalSourceExcluded: true`.

## Human-review workflow

Only when **current** re-evaluated readiness is `READY_FOR_REVIEW`:

`POST /api/paper-forward/sessions/:id/review`
`{ decision: "APPROVE_FUTURE_LIVE_ELIGIBLE" | "REJECT_REVIEW", notes }`

- Re-verifies frozen snapshot hash.
- Re-runs evaluation + gate (does not trust a stale stored status).
- `force=true` → HTTP 400 `PROMOTION_FORCE_DISABLED`.
- APPROVE sets `strategy_versions.live_phase_eligible*` — **future live phase eligibility only**.
- Does **not** place an exchange order, enable `ENABLE_LIVE_TRADING`, call Cornix, or `promoteStrategyToBitiq`.
- Every decision is appended to `paper_forward_reviews`, `paper_forward_ops_events`, and `strategy_audit_log`.

## Historical vs forward comparison

GET session returns `comparison.blended = false` with two slices:

- `historical.source = phase2_historical_validation` from `strategy_validations.report.chronological.validation|test.metrics`
- `forward.source = paper_forward_simulated` from Phase 4C evaluation

Never averaged, substituted, or mixed.

## Persistence / audit (migration 014)

Append-oriented tables:

- `paper_forward_ops_events` — lifecycle, locks, ticks, stale, evaluations, reviews
- `paper_forward_evaluations` — metric snapshots
- `paper_forward_readiness` — gate decisions
- `paper_forward_reviews` — human decisions

Session columns: lock, last tick, errors, stale, candles_processed, readiness_status/reasons, last_evaluated_at.

Apply `migrations/014_paper_forward_operations.sql` manually in Supabase (same policy as 012/013).

