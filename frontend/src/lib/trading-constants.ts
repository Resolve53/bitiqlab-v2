export const PAPER_TRADING_DEFAULT_CAPITAL = 5000;
export const DEFAULT_MULTI_COIN_COUNT = 20;

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

/** Format win_rate whether stored as 0–1 or 0–100 */
export function formatWinRate(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

export function formatDrawdown(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const pct = Math.abs(value) <= 1 ? Math.abs(value) * 100 : Math.abs(value);
  return `${pct.toFixed(1)}%`;
}

export function formatPnl(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "$0.00";
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
}
