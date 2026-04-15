/**
 * Binance API Data Fetcher
 * Fetches real OHLCV data from Binance for backtesting
 */

export interface OHLCV {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Binance API client for fetching OHLCV data
 */
export class BinanceDataFetcher {
  private baseUrl = "https://api.binance.com/api/v3";

  /**
   * Convert timeframe to Binance interval format
   */
  private getInterval(timeframe: string): string {
    const intervals: Record<string, string> = {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
      "1w": "1w",
    };
    return intervals[timeframe] || "1h";
  }

  /**
   * Fetch OHLCV data from Binance
   * Binance returns data in chunks of max 1000 candles
   */
  async getOHLCV(
    symbol: string,
    timeframe: string,
    startDate: Date,
    endDate: Date
  ): Promise<OHLCV[]> {
    try {
      const interval = this.getInterval(timeframe);
      const data: OHLCV[] = [];

      let currentStartTime = startDate.getTime();
      const endTime = endDate.getTime();

      while (currentStartTime < endTime) {
        const queryUrl =
          `${this.baseUrl}/klines?symbol=${symbol}&interval=${interval}` +
          `&startTime=${currentStartTime}&endTime=${endTime}&limit=1000`;

        const response = await fetch(queryUrl);

        if (!response.ok) {
          throw new Error(
            `Binance API error: ${response.status} ${response.statusText}`
          );
        }

        const klines = await response.json();

        if (!klines || klines.length === 0) {
          break;
        }

        // Convert Binance format to OHLCV
        for (const kline of klines) {
          data.push({
            timestamp: new Date(kline[0]),
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[7]),
          });
        }

        // Update startTime for next batch (last candle time + 1ms)
        currentStartTime = klines[klines.length - 1][0] + 1;

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (data.length === 0) {
        throw new Error(
          `No data found for ${symbol} ${timeframe} between ${startDate} and ${endDate}`
        );
      }

      return data;
    } catch (error) {
      console.error("Binance fetch error:", error);
      throw error;
    }
  }
}

/**
 * Calculate technical indicators from OHLCV data
 */
export function calculateIndicators(data: OHLCV[]) {
  const closes = data.map((d) => d.close);
  const volumes = data.map((d) => d.volume);

  // Calculate RSI
  const rsi = calculateRSI(closes);

  // Calculate MACD
  const macd = calculateMACD(closes);

  // Calculate Bollinger Bands
  const bb = calculateBollingerBands(closes);

  // Calculate Moving Averages
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);

  return {
    rsi: rsi[rsi.length - 1],
    rsi_values: rsi,
    macd: {
      line: macd.line[macd.line.length - 1],
      signal: macd.signal[macd.signal.length - 1],
      histogram: macd.histogram[macd.histogram.length - 1],
    },
    bollinger_bands: {
      upper: bb.upper[bb.upper.length - 1],
      middle: bb.middle[bb.middle.length - 1],
      lower: bb.lower[bb.lower.length - 1],
    },
    sma_20: sma20[sma20.length - 1],
    sma_50: sma50[sma50.length - 1],
    current_price: closes[closes.length - 1],
    price_history: closes,
  };
}

function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsis: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      rsis.push(50);
      continue;
    }

    let gains = 0;
    let losses = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    rsis.push(isNaN(rsi) ? 50 : rsi);
  }
  return rsis;
}

function calculateMACD(closes: number[]) {
  const line: number[] = [];
  const signal: number[] = [];
  const histogram: number[] = [];

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  for (let i = 0; i < closes.length; i++) {
    line.push(ema12[i] - ema26[i]);
  }

  const signal_values = calculateEMA(line, 9);
  for (let i = 0; i < line.length; i++) {
    signal.push(signal_values[i]);
    histogram.push(line[i] - signal_values[i]);
  }

  return { line, signal, histogram };
}

function calculateEMA(data: number[], period: number): number[] {
  const emas: number[] = [];
  const k = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      emas.push(data[i]);
    } else {
      emas.push(data[i] * k + emas[i - 1] * (1 - k));
    }
  }

  return emas;
}

function calculateSMA(data: number[], period: number): number[] {
  const smas: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      smas.push(data[i]);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      smas.push(sum / period);
    }
  }

  return smas;
}

function calculateBollingerBands(closes: number[], period: number = 20) {
  const uppers: number[] = [];
  const middles: number[] = [];
  const lowers: number[] = [];

  const sma = calculateSMA(closes, period);

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      middles.push(closes[i]);
      uppers.push(closes[i]);
      lowers.push(closes[i]);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance =
        slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      middles.push(mean);
      uppers.push(mean + 2 * stdDev);
      lowers.push(mean - 2 * stdDev);
    }
  }

  return { upper: uppers, middle: middles, lower: lowers };
}
