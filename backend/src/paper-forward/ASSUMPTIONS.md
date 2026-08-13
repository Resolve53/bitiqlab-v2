# Phase 4A — Paper Forward Safety Foundation

## Scope

Phase 4A establishes **immutable paper sessions** and **safety quarantine**.

It does **not**:
- evaluate live candles
- place Binance (testnet or live) orders
- simulate fills / P&L
- run a paper performance gate

## Session source of truth

Paper sessions bind permanently to `strategy_versions` (+ Phase 2 `strategy_validations`).
They never re-read mutable `strategies.entry_rules` / `exit_rules` for execution.

## Lifecycle

`CREATED → RUNNING ⇄ PAUSED → terminal (COMPLETED | FAILED | ABORTED)`

Terminal states cannot restart.

## Safety

- `ENABLE_LIVE_TRADING` defaults false; Phase 4A never enables live trading.
- `ENABLE_PAPER_TRADING` gates session creation (default true when unset).
- Legacy monitor / execute-signal / webhook / coin-monitor order paths return 410.

## Migration

`migrations/012_paper_forward_sessions.sql` — apply manually in Supabase before use.
