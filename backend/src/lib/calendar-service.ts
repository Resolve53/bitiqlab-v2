import axios from 'axios';

interface EconomicEvent {
  id: string;
  eventName: string;
  country: string;
  eventDate: string;
  importance: 'low' | 'medium' | 'high';
  forecastValue?: string;
  actualValue?: string;
  previousValue?: string;
  marketImpact?: string;
  affectedSymbols: string[];
}

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const ECONOMIC_CALENDAR_URL = 'https://www.alphavantage.co/query';

const CURRENCY_TO_CRYPTO: { [key: string]: string[] } = {
  USD: ['BTCUSDT', 'ETHUSDT', 'USDTUSDT'],
  EUR: ['BTCEUR', 'ETHEUR'],
  GBP: ['BTCGBP', 'ETHGBP'],
  JPY: ['BTCJPY', 'ETHJPY'],
};

const HIGH_IMPACT_EVENTS = [
  'FOMC Meeting',
  'FOMC Press Conference',
  'Federal Funds Rate',
  'CPI Release',
  'NFP',
  'Unemployment Rate',
  'Retail Sales',
  'Manufacturing PMI',
  'Services PMI',
  'GDP Release',
  'Inflation Report',
  'Bank of England',
  'ECB',
  'BoJ',
];

interface CalendarCache {
  events: EconomicEvent[];
  fetchedAt: number;
}

let calendarCache: CalendarCache = { events: [], fetchedAt: 0 };
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getEconomicCalendar(
  startDate: string,
  endDate: string
): Promise<EconomicEvent[]> {
  // Return cached events if still valid
  if (Date.now() - calendarCache.fetchedAt < CACHE_DURATION) {
    return filterEventsByDateRange(calendarCache.events, startDate, endDate);
  }

  try {
    const response = await axios.get(ECONOMIC_CALENDAR_URL, {
      params: {
        function: 'ECONOMIC_CALENDAR',
        apikey: ALPHA_VANTAGE_API_KEY,
      },
      timeout: 5000,
    });

    if (!response.data.data) {
      console.warn('No calendar data from Alpha Vantage, using empty list');
      return [];
    }

    const events: EconomicEvent[] = (response.data.data as any[])
      .map((event: any) => ({
        id: `${event.event}_${event.date}`,
        eventName: event.event,
        country: event.country,
        eventDate: event.date,
        importance: mapImportance(event.importance),
        forecastValue: event.forecast,
        actualValue: event.actual,
        previousValue: event.previous,
        affectedSymbols: getAffectedCryptos(event.country),
      }))
      .filter((event) => HIGH_IMPACT_EVENTS.some((h) => event.eventName.includes(h)));

    calendarCache = { events, fetchedAt: Date.now() };
    return filterEventsByDateRange(events, startDate, endDate);
  } catch (error) {
    console.error('Error fetching economic calendar:', error);
    return [];
  }
}

export async function getEventImpact(
  symbol: string,
  eventDate: string
): Promise<{ hasEvent: boolean; eventName?: string; importance?: string }> {
  const events = await getEconomicCalendar(
    new Date(new Date(eventDate).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    new Date(new Date(eventDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  const matchingEvent = events.find((e) =>
    e.affectedSymbols.some((s) => s.includes(symbol.replace('USDT', '').toUpperCase()))
  );

  return {
    hasEvent: !!matchingEvent,
    eventName: matchingEvent?.eventName,
    importance: matchingEvent?.importance,
  };
}

function filterEventsByDateRange(events: EconomicEvent[], startDate: string, endDate: string) {
  return events.filter((e) => e.eventDate >= startDate && e.eventDate <= endDate);
}

function mapImportance(importance: string): 'low' | 'medium' | 'high' {
  if (!importance) return 'low';
  if (importance.toLowerCase().includes('high')) return 'high';
  if (importance.toLowerCase().includes('medium')) return 'medium';
  return 'low';
}

function getAffectedCryptos(country: string): string[] {
  const upper = country.toUpperCase();
  if (upper === 'US' || upper === 'USA') return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT'];
  if (upper === 'EU' || upper.includes('EUR')) return ['BTCUSDT', 'ETHUSDT'];
  if (upper === 'GB' || upper.includes('GBP')) return ['BTCUSDT', 'ETHUSDT'];
  if (upper === 'JP' || upper.includes('JPY')) return ['BTCUSDT', 'ETHUSDT'];
  return ['BTCUSDT', 'ETHUSDT'];
}
