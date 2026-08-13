# Mathematical assumptions — Phase 1 Truth Engine

## Direction

- Direction is **never inferred** from indicators (no RSI→long heuristics).
- Each entry setup must declare `direction: "long" | "short"` with an explicit `condition` tree.
- Dual-direction strategies define **separate** long and short entry setups.
- Ambiguous legacy strategies **fail validation**.

## Entry condition trees

- Each setup has a root `condition` (indicator or `group` with explicit `op: "and" | "or"`).
- Nested AND/OR is supported inside groups.
- No implicit top-level AND of bare rule arrays unless wrapped in a group during legacy migration (legacy flat AND-split conditions become one `group.op=and` only after an explicit direction is resolved).

## Execution timing

- Indicators/rules evaluate on **CLOSED candle N only** (no look-ahead).
- Entry/exit strategy signals confirmed at close of N execute at **OPEN of N+1**.
- After entry fill at open of N+1, **that same bar's OHLC** is checked for SL/TP.

## Slippage

- `applySlippage(price, side, pct)` with `side ∈ {buy, sell}`.
- Buy worsens upward; sell worsens downward.

## Commissions

- `entryCommission = entryPrice × quantity × commissionRate`
- `exitCommission = exitPrice × quantity × commissionRate`

## TP/SL same-bar conflict

- If both stop and target are touched in one candle, assume **adverse (SL) first**.
- `intrabarConflict = true`.

## Gap fills (deterministic, conservative)

- **LONG SL:** if `bar.open < stopLoss`, fill at `applySlippage(bar.open, sell)` (cannot fill at higher stop).
- **SHORT SL:** if `bar.open > stopLoss`, fill at `applySlippage(bar.open, buy)`.
- **LONG TP gap up:** if `bar.open > takeProfit`, fill at target + sell slippage (do not credit the favorable open).
- **SHORT TP gap down:** if `bar.open < takeProfit`, fill at target + buy slippage.
- `gapFill = true` when a gap path is used.

## Position sizing & capital

- `requestedRiskUsd = equity × (riskPerTradePct / 100)`
- `riskPerUnit = |entry − stop|`
- `quantityRisk = requestedRiskUsd / riskPerUnit`
- **Capital cap (preferred policy):** shrink quantity so
  - spot (`leverage=1`): `notional + entryCommission ≤ equity`
  - futures: `notional/leverage + entryCommission ≤ equity`
  equivalently `quantity ≤ equity / (entry × (1/leverage + feeRate))`
- After cap: recompute notional, margin, `actualRiskUsd = quantity × riskPerUnit`
- Record `requestedRiskUsd`, `actualRiskUsd`, `capitalCapped`
- If affordable quantity is ~0, skip the entry (no position)
- Leverage does not multiply configured account risk; it only sets margin requirement
- Spot requires `leverage = 1`

## P&L

- LONG gross = `(exit − entry) × quantity`
- SHORT gross = `(entry − exit) × quantity`
- `net = gross − fees`; `equity := equity + net`
- `realizedR = netPnl / actualRiskUsd`

## Sharpe / Sortino

- Daily equity returns × √365, or `null` if insufficient daily points
- Risk-free rate = 0
