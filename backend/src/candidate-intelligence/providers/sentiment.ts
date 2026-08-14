import { getFearGreedIndex } from "@/lib/fear-greed-service";
import { isoNow } from "./http";
import type { ProviderCallStat, SentimentBlock } from "../types";

export async function fetchSentiment(): Promise<{
  sentiment: SentimentBlock;
  stat: ProviderCallStat;
}> {
  const started = Date.now();
  try {
    const idx = await getFearGreedIndex();
    const synthetic =
      idx.value === 50 &&
      idx.classification === "Neutral" &&
      idx.components?.momentum === 50;
    if (synthetic) {
      return {
        sentiment: {
          fear_greed: null,
          label: null,
          fetched_at: null,
          availability: "UNAVAILABLE",
          source: idx.source,
          detail: "Fear & Greed fallback default discarded (not a real reading)",
        },
        stat: {
          provider: "sentiment",
          ok: false,
          latency_ms: Date.now() - started,
          retries: 0,
          error: "default_index_discarded",
        },
      };
    }
    return {
      sentiment: {
        fear_greed: idx.value,
        label: idx.classification,
        fetched_at: isoNow(idx.timestamp || Date.now()),
        availability: "OK",
        source: idx.source,
      },
      stat: {
        provider: "sentiment",
        ok: true,
        latency_ms: Date.now() - started,
        retries: 0,
      },
    };
  } catch (err) {
    return {
      sentiment: {
        fear_greed: null,
        label: null,
        fetched_at: null,
        availability: "UNAVAILABLE",
        source: undefined,
        detail: err instanceof Error ? err.message : "sentiment fetch failed",
      },
      stat: {
        provider: "sentiment",
        ok: false,
        latency_ms: Date.now() - started,
        retries: 0,
        error: err instanceof Error ? err.message : "sentiment_failed",
      },
    };
  }
}
