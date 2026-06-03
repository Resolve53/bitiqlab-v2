import { getDB } from "./db";
import { getTradingClient, BinanceTradingClient } from "./binance-trading";
import {
  resolveTradingMarket,
  TradingMarketType,
} from "./trading-market-resolver";

export interface SessionTradingContext {
  client: BinanceTradingClient;
  marketType: TradingMarketType;
  leverage: number;
}

export async function getSessionTradingContext(
  sessionId: string,
  options?: {
    strategyId?: string;
    requestMarketType?: string;
  }
): Promise<SessionTradingContext> {
  const db = getDB();
  const session = await db.getTradingSession(sessionId);
  if (!session) {
    throw new Error("Trading session not found");
  }

  const strategyId = options?.strategyId || session.strategy_id;
  let strategyMarketType: string | undefined;
  let leverage = 1;

  if (strategyId) {
    try {
      const strategy = await db.getStrategy(strategyId);
      strategyMarketType = strategy?.market_type;
      const rawLeverage = (strategy as { leverage?: number })?.leverage;
      if (typeof rawLeverage === "number" && rawLeverage > 0) {
        leverage = Math.min(125, Math.max(1, rawLeverage));
      }
    } catch {
      // optional
    }
  }

  let multiCoinTradingType: string | undefined;
  try {
    const multi = await db.getMultiCoinConfig(sessionId);
    multiCoinTradingType = multi?.trading_type;
  } catch {
    // optional
  }

  const marketType = resolveTradingMarket({
    strategyMarketType,
    multiCoinTradingType,
    requestMarketType: options?.requestMarketType,
  });

  return {
    client: getTradingClient(true, marketType),
    marketType,
    leverage: marketType === "futures" ? leverage : 1,
  };
}
