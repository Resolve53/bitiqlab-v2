/**
 * Shared paper-trading defaults (Binance testnet demo).
 */

export const PAPER_TRADING_DEFAULT_CAPITAL = Number(
  process.env.PAPER_TRADING_INITIAL_CAPITAL || 5000
);

/** Top coins scanned when multi-coin monitor is enabled (default: 20). */
export const TOP_MONITOR_COINS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "MATICUSDT",
  "LTCUSDT",
  "TRXUSDT",
  "ATOMUSDT",
  "UNIUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "NEARUSDT",
  "INJUSDT",
] as const;

export const DEFAULT_MULTI_COIN_COUNT = 20;

export function buildDefaultMultiCoinConfig(
  initialBalance: number,
  tradingType: "spot" | "futures" = "spot"
) {
  const coins = TOP_MONITOR_COINS.slice(0, DEFAULT_MULTI_COIN_COUNT);
  const coinCount = coins.length;
  const positionSizePerCoin = initialBalance / coinCount;

  return {
    coin_count: coinCount,
    custom_coins: [...coins],
    scan_frequency: 30,
    position_size_per_coin: positionSizePerCoin,
    max_concurrent_positions: Math.min(5, coinCount),
    stop_loss_percent: 2,
    take_profit_percent: 5,
    trading_type: tradingType,
  };
}
