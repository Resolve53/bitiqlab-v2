# Mathematical assumptions — Phase 1 Truth Engine

## Execution timing

- Indicators/rules evaluate on **CLOSED candle N only** (no look-ahead).
- Entry/exit strategy signals confirmed at close of N execute at **OPEN of N+1**.
- Stop-loss and take-profit are checked **intrabar** using that candle's OHLC.

## Slippage

- `applySlippage(price, side, pct)` with `side ∈ {buy, sell}`.
- Buy worsens upward; sell worsens downward.
- Never inferred from `isEntry` booleans.

## Commissions

- `entryCommission = entryPrice × quantity × commissionRate`
- `exitCommission = exitPrice × quantity × commissionRate`
- `commissionRate = commissionPct / 100`

## TP/SL same-bar conflict

- If both stop and target are touched in one candle, assume **adverse (SL) first**.
- Trade records `intrabarConflict = true`.

## Position sizing

- `riskAmount = equity × (riskPerTradePct / 100)`
- `riskPerUnit = |entry − stop|`
- `quantity = riskAmount / riskPerUnit` (requires `riskPerUnit > 0`)
- Leverage affects `marginUsed = notional / leverage` only; it does **not** multiply account risk beyond `riskPerTradePct`.

## P&L

- LONG gross = `(exit − entry) × quantity`
- SHORT gross = `(entry − exit) × quantity`
- `net = gross − entryCommission − exitCommission`
- `equity := equity + net`

## Sharpe / Sortino

- Built from a UTC **daily** equity series (last equity per day).
- Daily return `r_t = E_t / E_{t-1} − 1`
- Sharpe = `mean(r)/std(r) × √365`; Sortino uses downside std (`r < 0`)
- Risk-free rate = **0** for Phase 1
- Returns **`null`** if fewer than 2 daily returns (never invent a number)
