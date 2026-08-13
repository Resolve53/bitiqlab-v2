/**
 * Cost stress cases — same strategy, worse fees/slippage.
 */

export interface CostStressSpec {
  name: string;
  commissionMultiplier: number;
  slippageMultiplier: number;
}

export const DEFAULT_COST_STRESS_CASES: CostStressSpec[] = [
  { name: "fees_x1_5", commissionMultiplier: 1.5, slippageMultiplier: 1 },
  { name: "fees_x2", commissionMultiplier: 2, slippageMultiplier: 1 },
  { name: "slippage_x1_5", commissionMultiplier: 1, slippageMultiplier: 1.5 },
  { name: "slippage_x2", commissionMultiplier: 1, slippageMultiplier: 2 },
  {
    name: "fees_x2_slippage_x2",
    commissionMultiplier: 2,
    slippageMultiplier: 2,
  },
];
