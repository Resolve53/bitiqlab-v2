import { useEffect, useState } from "react";
import axios from "axios";
import { PageHeader } from "@/components/AppShell";
import { apiUrl } from "@/lib/api";

type OnChainTab = "overview" | "funding" | "liquidations" | "rsi";

interface FearGreedData {
  value: number;
  value_classification: string;
  timestamp: number;
}

interface WhaleRow {
  symbol: string;
  largeOrderCount: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  bullishSignal: boolean;
  confidence: number;
  timestamp: number;
}

interface DerivativesData {
  openInterestUsd: number;
  openInterestChange24hPct: number;
  futuresOpenInterestUsd: number;
  perpetualsOpenInterestUsd: number;
  avgFundingRatePct: number;
  btcFundingRatePct: number | null;
  ethFundingRatePct: number | null;
  liquidations24hUsd: number;
  longLiquidations24hUsd: number;
  shortLiquidations24hUsd: number;
  longLiquidationSharePct: number;
  derivativesVolume24h: number;
  lastUpdated: string;
  dataSource?: string;
  notice?: string;
}

interface TechnicalRow {
  symbol: string;
  name?: string;
  rsi: number | null;
  rsiSignal: string;
  macdSignal?: string;
}

interface MarketTa {
  rsi: number | null;
  rsiSignal: string;
  macdSignal?: string;
}

interface SymbolMetric {
  symbol: string;
  combinedScore: number;
  recommendation: string;
  fearGreedIndex: { value: number; classification: string };
  whaleActivity: { largeOrderCount: number; bullishSignal: boolean; confidence: number };
  fundingRate: { rate: number; bullishSignal: boolean };
  cmcQuote?: {
    price: number;
    percentChange24h: number;
    percentChange7d: number;
    marketCap: number;
    volume24h: number;
  } | null;
  cmcRsi?: number | null;
  cmcRsiSignal?: string | null;
}

interface GlobalMetrics {
  btcDominance: number;
  ethDominance: number;
  totalMarketCap: number;
  totalVolume24h: number;
  marketCapChange24hPct: number;
  volumeChange24hPct: number;
  derivativesVolume24h?: number;
  derivativesChange24hPct?: number;
  lastUpdated: string;
  source: string;
}

interface OverviewSummary {
  avgOnChainScore: number;
  bullishWhaleCount: number;
  symbolsScanned: number;
  marketSignal: "bullish" | "bearish" | "neutral";
  cmcConfigured?: boolean;
}

function formatUsd(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function rsiColor(rsi: number | null) {
  if (rsi == null) return "text-slate-400";
  if (rsi >= 70) return "text-red-400";
  if (rsi <= 30) return "text-emerald-400";
  return "text-yellow-400";
}

const TAB_GROUPS: { group: string; tabs: { id: OnChainTab; label: string }[] }[] = [
  { group: "", tabs: [{ id: "overview", label: "Overview" }] },
  {
    group: "Derivatives",
    tabs: [
      { id: "funding", label: "Funding Rates" },
      { id: "liquidations", label: "Liquidations" },
    ],
  },
  {
    group: "Technical Analysis",
    tabs: [{ id: "rsi", label: "RSI" }],
  },
];

export default function OnChain() {
  const [tab, setTab] = useState<OnChainTab>("overview");
  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null);
  const [whales, setWhales] = useState<WhaleRow[]>([]);
  const [metrics, setMetrics] = useState<SymbolMetric[]>([]);
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetrics | null>(null);
  const [derivatives, setDerivatives] = useState<DerivativesData | null>(null);
  const [marketTa, setMarketTa] = useState<MarketTa | null>(null);
  const [symbolTa, setSymbolTa] = useState<TechnicalRow[]>([]);
  const [fearGreedSource, setFearGreedSource] = useState<string | null>(null);
  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataNotices, setDataNotices] = useState<{ derivatives?: string; technical?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as OnChainTab;
    if (["overview", "funding", "liquidations", "rsi"].includes(hash)) {
      setTab(hash);
    }
  }, []);

  useEffect(() => {
    fetchOnChainData();
    const interval = setInterval(fetchOnChainData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchOnChainData = async () => {
    try {
      setError(null);
      const res = await axios.get(apiUrl("/api/analysis/on-chain-overview"));
      const data = res.data?.data;

      if (data?.fearGreed) {
        setFearGreed({
          value: data.fearGreed.value,
          value_classification: data.fearGreed.classification,
          timestamp: data.fearGreed.timestamp,
        });
      }

      setWhales(data?.whales || []);
      setMetrics(data?.metrics || []);
      setSummary(data?.summary || null);
      setGlobalMetrics(data?.globalMetrics || null);
      setDerivatives(data?.derivatives || null);
      setMarketTa(data?.technicalAnalysis?.market || null);
      setSymbolTa(data?.technicalAnalysis?.symbols || []);
      setFearGreedSource(data?.fearGreed?.source || null);
      setDataNotices(data?.dataNotices || {});
    } catch (err) {
      console.error("Error fetching on-chain data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load on-chain overview"
      );
    } finally {
      setLoading(false);
    }
  };

  const selectTab = (id: OnChainTab) => {
    setTab(id);
    window.location.hash = id === "overview" ? "" : id;
  };

  const getFGColor = (value: number) => {
    if (value >= 75) return "text-emerald-400 bg-emerald-500/20";
    if (value >= 50) return "text-yellow-400 bg-yellow-500/20";
    if (value >= 25) return "text-orange-400 bg-orange-500/20";
    return "text-red-400 bg-red-500/20";
  };

  const getFGLabel = (classification: string) => classification;

  const bullishWhales = whales.filter((w) => w.bullishSignal).length;
  const bearishWhales = whales.length - bullishWhales;
  const avgScore = summary?.avgOnChainScore ?? 50;

  const marketSignalLabel =
    summary?.marketSignal === "bullish"
      ? "Bullish"
      : summary?.marketSignal === "bearish"
        ? "Bearish"
        : "Neutral";

  const marketSignalClass =
    summary?.marketSignal === "bullish"
      ? "bg-emerald-500/20 text-emerald-400"
      : summary?.marketSignal === "bearish"
        ? "bg-red-500/20 text-red-400"
        : "bg-yellow-500/20 text-yellow-400";

  const cmcMissing = summary?.cmcConfigured === false;

  return (
    <>
      <PageHeader
        title="On-Chain Analytics"
        subtitle="Fear & Greed, derivatives, and RSI from CoinMarketCap; whale order-book signals from Binance."
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-52 shrink-0 space-y-4">
          {TAB_GROUPS.map(({ group, tabs }) => (
            <div key={group || "main"}>
              {group && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group}
                </p>
              )}
              <div className="space-y-0.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTab(t.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                      tab === t.id
                        ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0 space-y-6">
          {error && (
            <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
              {error}
              {cmcMissing &&
                " Set COINMARKETCAP_API_KEY on Railway for derivatives and RSI from CoinMarketCap."}
            </div>
          )}

          {loading && (
            <p className="text-slate-400 text-center py-4">Loading on-chain data…</p>
          )}

          {tab === "overview" && !loading && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-lg p-8">
                  <h2 className="text-lg font-bold text-white mb-6">
                    FEAR & GREED INDEX
                  </h2>
                  {fearGreed ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-400 text-sm mb-2">Current Index</p>
                          <p
                            className={`text-6xl font-bold ${getFGColor(fearGreed.value).split(" ")[0]}`}
                          >
                            {fearGreed.value}
                          </p>
                        </div>
                        <div className="flex-1 ml-8">
                          <div className="w-full h-3 bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white/30"
                              style={{ width: `${fearGreed.value}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-400 mt-2">
                            <span>0 (Fear)</span>
                            <span>50</span>
                            <span>100 (Greed)</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm mb-2">Classification</p>
                        <span
                          className={`px-4 py-2 rounded text-sm font-bold ${getFGColor(fearGreed.value)}`}
                        >
                          {getFGLabel(fearGreed.value_classification)}
                        </span>
                      </div>
                      <div className="border-t border-slate-700 pt-4 space-y-1">
                        <p className="text-slate-400 text-xs">
                          Last updated:{" "}
                          {new Date(fearGreed.timestamp).toLocaleString()}
                        </p>
                        {fearGreedSource && (
                          <p className="text-slate-500 text-xs">
                            Source:{" "}
                            {fearGreedSource === "coinmarketcap"
                              ? "CoinMarketCap"
                              : fearGreedSource}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500">Fear & Greed data unavailable</p>
                  )}
                </div>

                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-white mb-4">MARKET CONDITIONS</h3>
                  <div className="space-y-3">
                    {globalMetrics && (
                      <>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">BTC Dominance</p>
                          <p className="text-white font-bold">
                            {globalMetrics.btcDominance.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">24h Market Cap Change</p>
                          <p
                            className={`font-bold ${
                              globalMetrics.marketCapChange24hPct >= 0
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {globalMetrics.marketCapChange24hPct >= 0 ? "+" : ""}
                            {globalMetrics.marketCapChange24hPct.toFixed(2)}%
                          </p>
                        </div>
                      </>
                    )}
                    <div>
                      <p className="text-slate-400 text-sm mb-1">Avg On-Chain Score</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 rounded"
                            style={{ width: `${avgScore}%` }}
                          />
                        </div>
                        <span className="text-white font-bold text-sm">
                          {avgScore}/100
                        </span>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-700">
                      <p className="text-slate-400 text-sm mb-2">Market Signal</p>
                      <span
                        className={`px-3 py-1 rounded text-sm font-bold ${marketSignalClass}`}
                      >
                        {marketSignalLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  WHALE ORDER BOOK SIGNALS
                </h2>
                <p className="text-slate-400 text-sm mb-4">
                  Large resting orders (&gt;$500k) on Binance spot books
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-slate-300">SYMBOL</th>
                        <th className="text-left py-3 px-4 text-slate-300">LARGE ORDERS</th>
                        <th className="text-left py-3 px-4 text-slate-300">NET FLOW</th>
                        <th className="text-left py-3 px-4 text-slate-300">SIGNAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whales.length > 0 ? (
                        whales.map((w) => (
                          <tr
                            key={w.symbol}
                            className="border-b border-slate-700/50"
                          >
                            <td className="py-3 px-4 text-white font-bold">
                              {w.symbol}
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              {w.largeOrderCount}
                            </td>
                            <td
                              className={`py-3 px-4 font-bold ${w.netVolume >= 0 ? "text-emerald-400" : "text-red-400"}`}
                            >
                              {w.netVolume >= 0 ? "+" : ""}
                              {(w.netVolume / 1e6).toFixed(2)}M
                            </td>
                            <td className="py-3 px-4">
                              {w.bullishSignal ? (
                                <span className="text-emerald-400">Bullish</span>
                              ) : (
                                <span className="text-slate-400">Neutral</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-6 text-center text-slate-500"
                          >
                            No whale activity detected
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === "funding" && !loading && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
              <h2 className="text-lg font-bold text-white mb-2">FUNDING RATES</h2>
              <p className="text-slate-400 text-sm mb-6">
                Global derivatives funding from CoinMarketCap. Positive = longs pay
                shorts.
              </p>
              {derivatives ? (
                <>
                  {derivatives.notice && (
                    <p className="text-amber-200/90 text-sm mb-4 p-3 rounded-lg bg-amber-900/20 border border-amber-700/40">
                      {derivatives.notice}
                    </p>
                  )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-5 rounded-lg bg-slate-950/50 border border-slate-700">
                    <p className="text-slate-400 text-sm">Avg funding rate</p>
                    <p
                      className={`text-3xl font-bold mt-1 ${
                        derivatives.avgFundingRatePct >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {derivatives.avgFundingRatePct >= 0 ? "+" : ""}
                      {derivatives.avgFundingRatePct.toFixed(4)}%
                    </p>
                  </div>
                  {derivatives.btcFundingRatePct != null && (
                    <div className="p-5 rounded-lg bg-slate-950/50 border border-slate-700">
                      <p className="text-slate-400 text-sm">BTC funding</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {derivatives.btcFundingRatePct.toFixed(4)}%
                      </p>
                    </div>
                  )}
                  {derivatives.ethFundingRatePct != null && (
                    <div className="p-5 rounded-lg bg-slate-950/50 border border-slate-700">
                      <p className="text-slate-400 text-sm">ETH funding</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {derivatives.ethFundingRatePct.toFixed(4)}%
                      </p>
                    </div>
                  )}
                  <div className="p-5 rounded-lg bg-slate-950/50 border border-slate-700">
                    <p className="text-slate-400 text-sm">Open interest</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {formatUsd(derivatives.openInterestUsd)}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      24h: {derivatives.openInterestChange24hPct >= 0 ? "+" : ""}
                      {derivatives.openInterestChange24hPct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="p-5 rounded-lg bg-slate-950/50 border border-slate-700">
                    <p className="text-slate-400 text-sm">Futures OI</p>
                    <p className="text-xl font-bold text-white mt-1">
                      {formatUsd(derivatives.futuresOpenInterestUsd)}
                    </p>
                    <p className="text-slate-400 text-sm mt-3">Perpetuals OI</p>
                    <p className="text-xl font-bold text-white">
                      {formatUsd(derivatives.perpetualsOpenInterestUsd)}
                    </p>
                  </div>
                  <p className="text-slate-500 text-xs md:col-span-2">
                    Updated: {new Date(derivatives.lastUpdated).toLocaleString()} ·
                    Source: {derivatives.dataSource === "coinmarketcap" ? "CoinMarketCap" : "Binance + CMC volume"}
                  </p>
                </div>
                </>
              ) : (
                <p className="text-slate-500">
                  Derivatives funding data unavailable. Confirm COINMARKETCAP_API_KEY is set on Railway.
                </p>
              )}
            </div>
          )}

          {tab === "liquidations" && !loading && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
              <h2 className="text-lg font-bold text-white mb-2">LIQUIDATIONS</h2>
              <p className="text-slate-400 text-sm mb-6">
                24h liquidation estimates from CoinMarketCap derivatives metrics.
              </p>
              {derivatives ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {derivatives.notice && (
                    <p className="text-amber-200/90 text-sm md:col-span-3 p-3 rounded-lg bg-amber-900/20 border border-amber-700/40">
                      {derivatives.notice}
                    </p>
                  )}
                  {derivatives.derivativesVolume24h > 0 && (
                    <div className="p-5 rounded-lg bg-slate-950/50 border border-slate-700 md:col-span-3">
                      <p className="text-slate-400 text-sm">Global derivatives volume (CMC)</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {formatUsd(derivatives.derivativesVolume24h)}
                      </p>
                    </div>
                  )}
                  <div className="p-5 rounded-lg bg-slate-950/50 border border-slate-700 md:col-span-3">
                    <p className="text-slate-400 text-sm">Total 24h liquidations (CMC detail)</p>
                    <p className="text-4xl font-bold text-white mt-1">
                      {derivatives.liquidations24hUsd > 0 ? formatUsd(derivatives.liquidations24hUsd) : "—"}
                    </p>
                    {derivatives.liquidations24hUsd <= 0 && (
                      <p className="text-slate-500 text-xs mt-2">
                        Liquidation breakdown needs CMC derivatives v3 (unavailable on your API tier). Use Funding Rates tab for live Binance funding.
                      </p>
                    )}
                  </div>
                  <div className="p-5 rounded-lg bg-red-500/10 border border-red-500/30">
                    <p className="text-slate-400 text-sm">Long liquidations</p>
                    <p className="text-2xl font-bold text-red-400 mt-1">
                      {formatUsd(derivatives.longLiquidations24hUsd)}
                    </p>
                  </div>
                  <div className="p-5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-slate-400 text-sm">Short liquidations</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">
                      {formatUsd(derivatives.shortLiquidations24hUsd)}
                    </p>
                  </div>
                  <div className="p-5 rounded-lg bg-slate-950/50 border border-slate-700">
                    <p className="text-slate-400 text-sm">Long share</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {derivatives.longLiquidationSharePct.toFixed(1)}%
                    </p>
                    <div className="mt-3 h-2 bg-slate-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-red-500"
                        style={{
                          width: `${derivatives.longLiquidationSharePct}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-slate-500 text-xs md:col-span-3">
                    Updated: {new Date(derivatives.lastUpdated).toLocaleString()} ·
                    Source: CoinMarketCap
                  </p>
                </div>
              ) : (
                <p className="text-slate-500">
                  Liquidation data unavailable from CoinMarketCap.
                </p>
              )}
            </div>
          )}

          {tab === "rsi" && !loading && (
            <div className="space-y-6">
              {dataNotices.technical && (
                <p className="text-amber-200/90 text-sm p-3 rounded-lg bg-amber-900/20 border border-amber-700/40">{dataNotices.technical}</p>
              )}
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
                <h2 className="text-lg font-bold text-white mb-2">
                  TOTAL MARKET RSI
                </h2>
                <p className="text-slate-400 text-sm mb-6">
                  CoinMarketCap technical analysis for total crypto market cap.
                </p>
                {marketTa && marketTa.rsi != null ? (
                  <div className="flex items-center gap-8">
                    <p className={`text-6xl font-bold ${rsiColor(marketTa.rsi)}`}>
                      {marketTa.rsi.toFixed(1)}
                    </p>
                    <div>
                      <p className="text-white font-semibold">{marketTa.rsiSignal}</p>
                      {marketTa.macdSignal && (
                        <p className="text-slate-400 text-sm mt-1">
                          MACD: {marketTa.macdSignal}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500">Market RSI unavailable from CMC.</p>
                )}
              </div>

              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
                <h2 className="text-lg font-bold text-white mb-4">PER-COIN RSI</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-slate-300">SYMBOL</th>
                        <th className="text-left py-3 px-4 text-slate-300">RSI</th>
                        <th className="text-left py-3 px-4 text-slate-300">SIGNAL</th>
                        <th className="text-left py-3 px-4 text-slate-300">MACD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(symbolTa.length > 0
                        ? symbolTa
                        : metrics.map((m) => ({
                            symbol: m.symbol.replace(/USDT$/i, ""),
                            rsi: m.cmcRsi ?? null,
                            rsiSignal: m.cmcRsiSignal || "—",
                            macdSignal: undefined,
                          }))
                      ).map((row: TechnicalRow) => (
                        <tr
                          key={row.symbol}
                          className="border-b border-slate-700/50"
                        >
                          <td className="py-3 px-4 text-white font-bold">
                            {row.symbol}
                          </td>
                          <td
                            className={`py-3 px-4 font-bold ${rsiColor(row.rsi)}`}
                          >
                            {row.rsi != null ? row.rsi.toFixed(1) : "—"}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {row.rsiSignal}
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            {row.macdSignal || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-slate-500 text-xs mt-4">Source: CoinMarketCap</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
