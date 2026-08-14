# Phase 4B — Paper-forward simulated execution engine

Phase 4A established immutable sessions and safety quarantine.
Phase 4B adds **deterministic simulated paper execution** on RUNNING sessions.

It does **not**:
- place Binance (testnet or live) market/limit orders
- call Cornix, webhooks, or legacy execute-signal paths
- mutate `strategies.entry_rules` / `exit_rules`
- rewrite strategies or invoke Claude
- run TEST/validation logic
- start Phase 4C live trading

`ENABLE_LIVE_TRADING` remains false-safe. Paper fills never touch `BinanceTradingClient`.

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
