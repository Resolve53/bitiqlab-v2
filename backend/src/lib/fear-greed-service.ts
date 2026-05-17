import axios from 'axios';

interface FearGreedIndex {
  timestamp: number;
  value: number;
  classification: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed';
  components: {
    momentum: number;
    volatility: number;
    dominance: number;
    trends: number;
  };
}

const FEAR_GREED_URL = 'https://api.alternative.me/fng/';

interface CacheEntry {
  data: FearGreedIndex;
  fetchedAt: number;
}

let indexCache: CacheEntry | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function getFearGreedIndex(): Promise<FearGreedIndex> {
  // Return cached value if still valid
  if (indexCache && Date.now() - indexCache.fetchedAt < CACHE_DURATION) {
    return indexCache.data;
  }

  try {
    const response = await axios.get(FEAR_GREED_URL, {
      params: { limit: 1 },
      timeout: 5000,
    });

    if (!response.data.data || response.data.data.length === 0) {
      return createDefaultIndex();
    }

    const data = response.data.data[0];
    const index: FearGreedIndex = {
      timestamp: parseInt(data.timestamp) * 1000,
      value: parseInt(data.value),
      classification: mapClassification(parseInt(data.value)),
      components: {
        momentum: 0, // Not provided by this API
        volatility: 0,
        dominance: 0,
        trends: 0,
      },
    };

    indexCache = { data: index, fetchedAt: Date.now() };
    return index;
  } catch (error) {
    console.error('Error fetching fear-greed index:', error);
    return createDefaultIndex();
  }
}

export async function getFearGreedTrend(days: number = 30): Promise<FearGreedIndex[]> {
  try {
    const response = await axios.get(FEAR_GREED_URL, {
      params: { limit: days },
      timeout: 5000,
    });

    if (!response.data.data) {
      return [];
    }

    return response.data.data.map((d: any) => ({
      timestamp: parseInt(d.timestamp) * 1000,
      value: parseInt(d.value),
      classification: mapClassification(parseInt(d.value)),
      components: {
        momentum: 0,
        volatility: 0,
        dominance: 0,
        trends: 0,
      },
    }));
  } catch (error) {
    console.error('Error fetching fear-greed trend:', error);
    return [];
  }
}

export function getOptimalTradeCondition(index: FearGreedIndex): {
  isOptimal: boolean;
  reason: string;
  score: number; // 0-100
} {
  // Generally better to buy near extreme fear, sell near extreme greed
  const { value, classification } = index;

  let isOptimal = false;
  let score = 0;
  let reason = '';

  if (value < 25) {
    isOptimal = true;
    score = 90; // Extreme fear - great buying opportunity
    reason = 'Extreme fear - excellent entry point for long positions';
  } else if (value < 45) {
    isOptimal = true;
    score = 70;
    reason = 'Fear zone - good entry opportunity';
  } else if (value < 55) {
    isOptimal = false;
    score = 50;
    reason = 'Neutral zone - wait for better setup';
  } else if (value < 75) {
    isOptimal = false;
    score = 30;
    reason = 'Greed zone - consider taking profits';
  } else {
    isOptimal = false;
    score = 10; // Extreme greed - risky for new long
    reason = 'Extreme greed - high risk for entries';
  }

  return { isOptimal, reason, score };
}

function mapClassification(
  value: number
): 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed' {
  if (value < 25) return 'Extreme Fear';
  if (value < 45) return 'Fear';
  if (value < 55) return 'Neutral';
  if (value < 75) return 'Greed';
  return 'Extreme Greed';
}

function createDefaultIndex(): FearGreedIndex {
  return {
    timestamp: Date.now(),
    value: 50,
    classification: 'Neutral',
    components: {
      momentum: 50,
      volatility: 50,
      dominance: 50,
      trends: 50,
    },
  };
}
