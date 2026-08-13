/**
 * Slippage must worsen execution.
 * Explicit side: "buy" | "sell" — never inferred from isEntry booleans.
 */

export type OrderSide = "buy" | "sell";

/**
 * @param price raw intended price
 * @param side buy worsens upward; sell worsens downward
 * @param slippagePct percent, e.g. 0.02 means 0.02%
 */
export function applySlippage(
  price: number,
  side: OrderSide,
  slippagePct: number
): number {
  if (!(price > 0)) {
    throw new Error(`Invalid price for slippage: ${price}`);
  }
  const slip = (price * Math.max(0, slippagePct)) / 100;
  return side === "buy" ? price + slip : price - slip;
}

export function entrySide(direction: "long" | "short"): OrderSide {
  return direction === "long" ? "buy" : "sell";
}

export function exitSide(direction: "long" | "short"): OrderSide {
  return direction === "long" ? "sell" : "buy";
}
