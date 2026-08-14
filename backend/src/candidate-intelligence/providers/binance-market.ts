import { timedGetJson, finiteOrNull, isoNow } from "./http";
import type {
  MarketBlock,
  MicrostructureBlock,
  ProviderCallStat,
} from "../types";

const SPOT = "https://api.binance.com/api/v3";
const FAPI = "https://fapi.binance.com/fapi/v1";

export function calcAtr(bars: Array<{ high: number; low: number; close: number }>, period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return Number.isFinite(atr) ? atr : null;
}

function intervalFor(tf: string): string {
  if (["15m", "1h", "4h", "1m", "5m", "1d"].includes(tf)) return tf;
  return "15m";
}

export async function fetchBinanceMarket(input: {
  symbol: string;
  timeframe: string;
  marketType: "spot" | "futures";
}): Promise<{
  market: MarketBlock;
  microstructure: MicrostructureBlock;
  stats: ProviderCallStat[];
}> {
  const symbol = input.symbol.toUpperCase();
  const interval = intervalFor(input.timeframe);
  const klineUrl =
    input.marketType === "futures"
      ? `${FAPI}/klines`
      : `${SPOT}/klines`;
  const tickerUrl =
    input.marketType === "futures"
      ? `${FAPI}/ticker/bookTicker`
      : `${SPOT}/ticker/bookTicker`;
  const depthUrl =
    input.marketType === "futures" ? `${FAPI}/depth` : `${SPOT}/depth`;
  const premiumUrl = `${FAPI}/premiumIndex`;

  const [klines, book, depth, premium] = await Promise.all([
    timedGetJson<unknown[]>({
      provider: "binance_klines",
      url: klineUrl,
      params: { symbol, interval, limit: 30 },
    }),
    timedGetJson<Record<string, string>>({
      provider: "binance_book_ticker",
      url: tickerUrl,
      params: { symbol },
    }),
    timedGetJson<{ bids?: [string, string][]; asks?: [string, string][] }>({
      provider: "binance_depth",
      url: depthUrl,
      params: { symbol, limit: 20 },
    }),
    timedGetJson<Record<string, string>>({
      provider: "binance_premium",
      url: premiumUrl,
      params: { symbol },
    }),
  ]);

  const stats = [klines.stat, book.stat, depth.stat, premium.stat];
  const fetched_at = isoNow();

  let price: number | null = null;
  let volume: number | null = null;
  let atr: number | null = null;
  const rows: Array<{ high: number; low: number; close: number; volume: number }> = [];
  if (Array.isArray(klines.data)) {
    for (const row of klines.data) {
      if (!Array.isArray(row) || row.length < 8) continue;
      const open = finiteOrNull(row[1]);
      const high = finiteOrNull(row[2]);
      const low = finiteOrNull(row[3]);
      const close = finiteOrNull(row[4]);
      const vol = finiteOrNull(row[7]);
      if (open == null || high == null || low == null || close == null) continue;
      rows.push({ high, low, close, volume: vol ?? 0 });
    }
    if (rows.length) {
      price = rows[rows.length - 1].close;
      volume = rows[rows.length - 1].volume;
      atr = calcAtr(rows);
    }
  }

  const bid = finiteOrNull(book.data?.bidPrice);
  const ask = finiteOrNull(book.data?.askPrice);
  if (price == null && bid != null && ask != null) {
    price = (bid + ask) / 2;
  }
  const spread_pct =
    bid != null && ask != null && (bid + ask) / 2 > 0
      ? ((ask - bid) / ((ask + bid) / 2)) * 100
      : null;
  const volatility_ratio =
    atr != null && price != null && price > 0 ? atr / price : null;

  const marketOk = price != null;
  const market: MarketBlock = {
    price,
    spread_pct,
    volume,
    atr,
    volatility_ratio,
    fetched_at: marketOk ? fetched_at : null,
    availability: marketOk ? "OK" : "UNAVAILABLE",
    source: "binance",
    detail: marketOk ? undefined : "Binance kline/ticker missing price",
  };

  let bid_depth: number | null = null;
  let ask_depth: number | null = null;
  let imbalance: number | null = null;
  if (depth.data?.bids && depth.data?.asks) {
    bid_depth = depth.data.bids.reduce((s, [p, q]) => {
      const pn = finiteOrNull(p);
      const qn = finiteOrNull(q);
      return pn != null && qn != null ? s + pn * qn : s;
    }, 0);
    ask_depth = depth.data.asks.reduce((s, [p, q]) => {
      const pn = finiteOrNull(p);
      const qn = finiteOrNull(q);
      return pn != null && qn != null ? s + pn * qn : s;
    }, 0);
    const total = (bid_depth ?? 0) + (ask_depth ?? 0);
    if (total > 0) imbalance = ((bid_depth ?? 0) - (ask_depth ?? 0)) / total;
  }

  const mark = finiteOrNull(premium.data?.markPrice);
  const index = finiteOrNull(premium.data?.indexPrice);
  const basis =
    mark != null && index != null && index !== 0
      ? ((mark - index) / index) * 100
      : null;

  const microOk = imbalance != null || basis != null;
  const microstructure: MicrostructureBlock = {
    orderbook_imbalance: imbalance,
    bid_depth,
    ask_depth,
    spot_perp_basis: basis,
    fetched_at: microOk ? fetched_at : null,
    availability: microOk ? "OK" : "UNAVAILABLE",
    source: "binance",
    detail: microOk ? undefined : "orderbook/basis unavailable",
  };

  return { market, microstructure, stats };
}
