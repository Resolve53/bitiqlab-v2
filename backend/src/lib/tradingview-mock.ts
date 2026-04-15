/**
 * Mock TradingView Data Provider
 * Generates realistic OHLCV data for testing
 * Can be replaced with real TradingView MCP when available
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
 * Generate mock OHLCV data for backtesting
 * Creates realistic price movements with volatility
 */
export function generateMockOHLCVData(
  symbol: string,
  timeframe: string,
  startDate: Date,
  endDate: Date,
  basePrice: number = 40000
): OHLCV[] {
  const data: OHLCV[] = [];

  // Determine interval in milliseconds based on timeframe
  const intervals: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };

  const interval = intervals[timeframe] || intervals["1h"];
  let currentPrice = basePrice;
  let currentTime = new Date(startDate);

  while (currentTime < endDate) {
    // Generate realistic price movement (±2% volatility)
    const volatility = 0.02;
    const randomChange = (Math.random() - 0.5) * 2 * volatility;
    const openPrice = currentPrice;
    const closePrice = currentPrice * (1 + randomChange);
    const highPrice = Math.max(openPrice, closePrice) * (1 + Math.random() * 0.01);
    const lowPrice = Math.min(openPrice, closePrice) * (1 - Math.random() * 0.01);
    const volume = Math.floor(Math.random() * 1000) + 500;

    data.push({
      timestamp: new Date(currentTime),
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      close: closePrice,
      volume,
    });

    currentPrice = closePrice;
    currentTime = new Date(currentTime.getTime() + interval);
  }

  return data;
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
