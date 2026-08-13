# Phase 2 Validation Engine — assumptions

## Chronological splits

- Bars are ordered oldest → newest.
- Default 60% / 20% / 20% train / validation / test.
- Segments are contiguous and non-overlapping; test is the newest slice.
- The reserved TEST set is never used for parameter selection or walk-forward decisions.

## Walk-forward

- Rolling windows use train then validation only on the pre-test region.
- Validation starts at the first bar after train (no overlap).
- Step size moves the window forward in bar counts.

## Degradation

- Retention ratios are `out / train`; `null` when denominator is 0/null/non-finite.
- Deltas are `out - train`.

## Sensitivity

- Nearby numeric variants only (bounded, not optimization).
- Original `entry_rules` / `exit_rules` must remain byte-equal after variant construction.
- Variants are evaluated on the validation segment only.

## Cost stress

- Same strategy and bars; only commission/slippage multipliers change.
- Stress cases: fees×1.5, fees×2, slippage×1.5, slippage×2, both×2.

## Regimes

- Deterministic SMA trend + ATR/close vs causal median volatility.
- Classification at bar `i` uses only information ≤ `i` (no future bars).
- Trade regime assignment uses the entry bar's regime label.
- Regime stats are **descriptive trade-grouping**, not separate regime-only backtests.
- Per-bucket `netPnl` is absolute P&L (not return %).
- Per-bucket `tradePathDrawdownApprox` is reconstructed from the trade-subset P&L path; it is not Truth Engine equity max drawdown.

## Parameter sensitivity gate

- Variants present: hard check on positive-expectancy majority.
- Zero stressable numeric parameters: soft/informational failure
  (`parameter robustness not evaluated`) → contributes to **conditional**,
  never counted as a hard pass / robustness proof.

## Cross-asset

- Same structured rules, timeframe, and relative date range.
- Informational by default (`crossAssetMandatory: false`).

## Gate

- Hard checks → fail; soft sample-size issues alone → conditional.
- Every check is returned with an explicit reason.
