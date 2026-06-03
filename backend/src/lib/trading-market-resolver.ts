export type TradingMarketType = "spot" | "futures";

export function normalizeMarketType(
  value?: string | null
): TradingMarketType | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "spot" || v === "futures") return v;
  return undefined;
}

export function resolveTradingMarket(input: {
  strategyMarketType?: string | null;
  multiCoinTradingType?: string | null;
  requestMarketType?: string | null;
}): TradingMarketType {
  return (
    normalizeMarketType(input.requestMarketType) ||
    normalizeMarketType(input.multiCoinTradingType) ||
    normalizeMarketType(input.strategyMarketType) ||
    "spot"
  );
}
