import { timedGetJson, finiteOrNull, isoNow } from "./http";
import type {
  FundingBlock,
  LiquidationsBlock,
  LongShortBlock,
  OpenInterestBlock,
  ProviderCallStat,
  TakerFlowBlock,
} from "../types";

const FAPI = "https://fapi.binance.com/fapi/v1";
const FDATA = "https://fapi.binance.com/futures/data";

function periodFor(tf: string): string {
  if (tf === "15m") return "15m";
  if (tf === "1h") return "1h";
  if (tf === "4h") return "4h";
  return "15m";
}

function fundingTrend(rate: number | null): string | null {
  if (rate == null) return null;
  if (rate > 0.01) return "rising_positive";
  if (rate > 0) return "positive";
  if (rate < -0.01) return "falling_negative";
  if (rate < 0) return "negative";
  return "flat";
}

export async function fetchBinanceDerivatives(symbol: string, timeframe: string): Promise<{
  open_interest: OpenInterestBlock;
  funding: FundingBlock;
  long_short_ratio: LongShortBlock;
  liquidations: LiquidationsBlock;
  taker_flow: TakerFlowBlock;
  stats: ProviderCallStat[];
}> {
  const sym = symbol.toUpperCase();
  const period = periodFor(timeframe);
  const fetched_at = isoNow();

  const [oiNow, oiHist, premium, globalLs, topLs, taker] = await Promise.all([
    timedGetJson<{ openInterest?: string }>({
      provider: "binance_oi",
      url: `${FAPI}/openInterest`,
      params: { symbol: sym },
    }),
    timedGetJson<Array<{ sumOpenInterest?: string; sumOpenInterestValue?: string }>>({
      provider: "binance_oi_hist",
      url: `${FDATA}/openInterestHist`,
      params: { symbol: sym, period, limit: 12 },
    }),
    timedGetJson<Record<string, string>>({
      provider: "binance_funding",
      url: `${FAPI}/premiumIndex`,
      params: { symbol: sym },
    }),
    timedGetJson<Array<{ longShortRatio?: string }>>({
      provider: "binance_ls_global",
      url: `${FDATA}/globalLongShortAccountRatio`,
      params: { symbol: sym, period, limit: 1 },
    }),
    timedGetJson<Array<{ longShortRatio?: string }>>({
      provider: "binance_ls_top",
      url: `${FDATA}/topLongShortAccountRatio`,
      params: { symbol: sym, period, limit: 1 },
    }),
    timedGetJson<Array<{ buySellRatio?: string; buyVol?: string; sellVol?: string }>>({
      provider: "binance_taker",
      url: `${FDATA}/takerlongshortRatio`,
      params: { symbol: sym, period, limit: 1 },
    }),
  ]);

  const stats = [
    oiNow.stat,
    oiHist.stat,
    premium.stat,
    globalLs.stat,
    topLs.stat,
    taker.stat,
  ];

  const oiValue = finiteOrNull(oiNow.data?.openInterest);
  let delta_pct: number | null = null;
  if (Array.isArray(oiHist.data) && oiHist.data.length >= 2) {
    const first = finiteOrNull(oiHist.data[0]?.sumOpenInterest);
    const last = finiteOrNull(oiHist.data[oiHist.data.length - 1]?.sumOpenInterest);
    if (first != null && last != null && first !== 0) {
      delta_pct = ((last - first) / first) * 100;
    }
  }

  const open_interest: OpenInterestBlock = {
    value: oiValue,
    delta_pct,
    fetched_at: oiValue != null ? fetched_at : null,
    availability: oiValue != null ? "OK" : "UNAVAILABLE",
    source: "binance",
    detail: oiValue != null ? undefined : "openInterest missing",
  };

  const fundingRate = finiteOrNull(premium.data?.lastFundingRate);
  const fundingPct = fundingRate != null ? fundingRate * 100 : null;
  const funding: FundingBlock = {
    value: fundingPct,
    trend: fundingTrend(fundingPct),
    fetched_at: fundingPct != null ? fetched_at : null,
    availability: fundingPct != null ? "OK" : "UNAVAILABLE",
    source: "binance",
    detail: fundingPct != null ? undefined : "premiumIndex lastFundingRate missing",
  };

  const global = finiteOrNull(
    Array.isArray(globalLs.data) ? globalLs.data[0]?.longShortRatio : null
  );
  const top = finiteOrNull(
    Array.isArray(topLs.data) ? topLs.data[0]?.longShortRatio : null
  );
  const long_short_ratio: LongShortBlock = {
    global,
    top_traders: top,
    fetched_at: global != null || top != null ? fetched_at : null,
    availability: global != null || top != null ? "OK" : "UNAVAILABLE",
    source: "binance",
    detail:
      global != null || top != null
        ? undefined
        : "long/short ratio endpoints unavailable",
  };

  const buy = finiteOrNull(
    Array.isArray(taker.data) ? taker.data[0]?.buyVol : null
  );
  const sell = finiteOrNull(
    Array.isArray(taker.data) ? taker.data[0]?.sellVol : null
  );
  let cvd: number | null = null;
  let bias: TakerFlowBlock["bias"] = null;
  if (buy != null && sell != null) {
    cvd = buy - sell;
    if (buy === sell) bias = "NEUTRAL";
    else bias = buy > sell ? "BUY" : "SELL";
  }
  const taker_flow: TakerFlowBlock = {
    buy,
    sell,
    cvd,
    bias,
    fetched_at: buy != null && sell != null ? fetched_at : null,
    availability: buy != null && sell != null ? "OK" : "UNAVAILABLE",
    source: "binance",
    detail:
      buy != null && sell != null
        ? undefined
        : "takerlongshortRatio unavailable on this symbol/plan",
  };

  const liquidations: LiquidationsBlock = {
    long_usd: null,
    short_usd: null,
    window: "24h",
    fetched_at: null,
    availability: "UNAVAILABLE",
    source: "binance",
    detail:
      "Binance public REST does not expose per-symbol liquidation USD totals without authenticated force-order history",
  };

  return {
    open_interest,
    funding,
    long_short_ratio,
    liquidations,
    taker_flow,
    stats,
  };
}
