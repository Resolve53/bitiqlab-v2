import axios from "axios";
import {
  fetchCmcFearGreedLatest,
  isCoinMarketCapConfigured,
} from "./coinmarketcap-client";

interface FearGreedIndex {
  timestamp: number;
  value: number;
  classification: string;
  source: "coinmarketcap" | "alternative.me";
  components: {
    momentum: number;
    volatility: number;
    dominance: number;
    trends: number;
  };
}

const FALLBACK_URL = "https://api.alternative.me/fng/";

interface CacheEntry {
  data: FearGreedIndex;
  fetchedAt: number;
}

let indexCache: CacheEntry | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour — CMC updates daily

export type { FearGreedIndex };

export async function getFearGreedIndex(): Promise<FearGreedIndex> {
  if (indexCache && Date.now() - indexCache.fetchedAt < CACHE_DURATION) {
    return indexCache.data;
  }

  if (isCoinMarketCapConfigured()) {
    try {
      const cmc = await fetchCmcFearGreedLatest();
      const index: FearGreedIndex = {
        timestamp: cmc.timestamp,
        value: cmc.value,
        classification: normalizeCmcClassification(
          cmc.classification,
          cmc.value
        ),
        source: "coinmarketcap",
        components: { momentum: 0, volatility: 0, dominance: 0, trends: 0 },
      };
      indexCache = { data: index, fetchedAt: Date.now() };
      return index;
    } catch (error) {
      console.error("CoinMarketCap fear/greed fetch failed:", error);
    }
  }

  try {
    const response = await axios.get(FALLBACK_URL, {
      params: { limit: 1 },
      timeout: 5000,
    });

    if (!response.data.data?.length) {
      return createDefaultIndex();
    }

    const data = response.data.data[0];
    const value = parseInt(data.value, 10);
    const index: FearGreedIndex = {
      timestamp: parseInt(data.timestamp, 10) * 1000,
      value,
      classification: mapClassification(value),
      source: "alternative.me",
      components: { momentum: 0, volatility: 0, dominance: 0, trends: 0 },
    };

    indexCache = { data: index, fetchedAt: Date.now() };
    return index;
  } catch (error) {
    console.error("Error fetching fear-greed index:", error);
    return createDefaultIndex();
  }
}

export async function getFearGreedTrend(days: number = 30): Promise<FearGreedIndex[]> {
  if (isCoinMarketCapConfigured()) {
    try {
      const key = process.env.COINMARKETCAP_API_KEY?.trim();
      const res = await axios.get(
        "https://pro-api.coinmarketcap.com/v3/fear-and-greed/historical",
        {
          headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
          params: { limit: Math.min(days, 200) },
          timeout: 10000,
        }
      );
      const rows = res.data?.data;
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((d: { timestamp: string; value: number; value_classification?: string }) => {
          const value = Number(d.value);
          return {
            timestamp: new Date(d.timestamp).getTime(),
            value,
            classification: normalizeCmcClassification(
              d.value_classification || "",
              value
            ),
            source: "coinmarketcap" as const,
            components: { momentum: 0, volatility: 0, dominance: 0, trends: 0 },
          };
        });
      }
    } catch (error) {
      console.error("CMC fear/greed historical failed:", error);
    }
  }

  try {
    const response = await axios.get(FALLBACK_URL, {
      params: { limit: days },
      timeout: 5000,
    });

    if (!response.data.data) return [];

    return response.data.data.map((d: { timestamp: string; value: string }) => {
      const value = parseInt(d.value, 10);
      return {
        timestamp: parseInt(d.timestamp, 10) * 1000,
        value,
        classification: mapClassification(value),
        source: "alternative.me" as const,
        components: { momentum: 0, volatility: 0, dominance: 0, trends: 0 },
      };
    });
  } catch (error) {
    console.error("Error fetching fear-greed trend:", error);
    return [];
  }
}

export function getOptimalTradeCondition(index: FearGreedIndex): {
  isOptimal: boolean;
  reason: string;
  score: number;
} {
  const { value, classification } = index;

  let isOptimal = false;
  let score = 0;
  let reason = "";

  const cls = classification.toLowerCase();

  if (cls.includes("extreme fear") || value < 25) {
    isOptimal = true;
    score = 90;
    reason = "Extreme fear — strong contrarian entry zone (CMC index)";
  } else if (cls.includes("fear") || value < 45) {
    isOptimal = true;
    score = 70;
    reason = "Fear zone — favorable for new long entries";
  } else if (cls.includes("neutral") || value < 55) {
    isOptimal = false;
    score = 50;
    reason = "Neutral — wait for clearer sentiment";
  } else if (cls.includes("greed") && !cls.includes("extreme") || value < 75) {
    isOptimal = false;
    score = 30;
    reason = "Greed zone — consider taking profits";
  } else {
    isOptimal = false;
    score = 10;
    reason = "Extreme greed — high risk for new longs";
  }

  return { isOptimal, reason, score };
}

function normalizeCmcClassification(
  cmcLabel: string,
  value: number
): string {
  const label = cmcLabel.trim();
  if (label) {
    const lower = label.toLowerCase();
    if (lower.includes("extreme")) {
      return lower.includes("greed") ? "Extreme Greed" : "Extreme Fear";
    }
    if (lower === "fear") return value < 25 ? "Extreme Fear" : "Fear";
    if (lower === "greed") return value >= 75 ? "Extreme Greed" : "Greed";
    if (lower === "neutral") return "Neutral";
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return mapClassification(value);
}

function mapClassification(value: number): string {
  if (value < 25) return "Extreme Fear";
  if (value < 45) return "Fear";
  if (value < 55) return "Neutral";
  if (value < 75) return "Greed";
  return "Extreme Greed";
}

function createDefaultIndex(): FearGreedIndex {
  return {
    timestamp: Date.now(),
    value: 50,
    classification: "Neutral",
    source: "alternative.me",
    components: { momentum: 50, volatility: 50, dominance: 50, trends: 50 },
  };
}
