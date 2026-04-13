/**
 * Adapter layer for integrating TradingView MCP with Bitiq Lab API
 * Provides a clean interface for fetching OHLCV data and indicator values
 */

import * as chart from './core/chart.js';
import * as data from './core/data.js';
import * as health from './core/health.js';

/**
 * Initialize connection to TradingView Desktop
 */
export async function initializeConnection() {
  try {
    const status = await health.health_check();
    if (status.success) {
      console.log('TradingView MCP connected successfully');
      return { success: true, status };
    }
    throw new Error('TradingView MCP health check failed');
  } catch (error) {
    console.error('Failed to initialize TradingView connection:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch OHLCV data for a symbol and timeframe
 * @param {string} symbol - Trading symbol (e.g., "BTCUSDT", "ES1!")
 * @param {string} timeframe - Timeframe (e.g., "1", "5", "60", "D")
 * @param {number} count - Number of bars to fetch (default: 100, max: 500)
 * @returns {Promise<Object>} OHLCV data with price bars
 */
export async function fetchOHLCVData(symbol, timeframe, count = 100) {
  try {
    // Set the symbol and timeframe on the chart
    await chart.chart_set_symbol({ symbol });
    await chart.chart_set_timeframe({ resolution: timeframe });

    // Fetch OHLCV data with summary
    const result = await data.data_get_ohlcv({
      count: Math.min(count, 500),
      summary: true,
    });

    if (result.success) {
      return { success: true, data: result };
    }
    throw new Error('Failed to fetch OHLCV data');
  } catch (error) {
    console.error(`Failed to fetch OHLCV data for ${symbol} ${timeframe}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch current indicator values for all visible indicators
 * @param {string} symbol - Trading symbol
 * @param {string} timeframe - Timeframe
 * @returns {Promise<Object>} Current indicator values
 */
export async function fetchIndicatorValues(symbol, timeframe) {
  try {
    // Set the symbol and timeframe
    await chart.chart_set_symbol({ symbol });
    await chart.chart_set_timeframe({ resolution: timeframe });

    // Get chart state to see what indicators are available
    const chartState = await chart.chart_get_state();
    if (!chartState.success) {
      throw new Error('Failed to get chart state');
    }

    // Fetch study values (indicator values)
    const values = await data.data_get_study_values();
    if (values.success) {
      return { success: true, indicators: values };
    }
    throw new Error('Failed to fetch indicator values');
  } catch (error) {
    console.error(`Failed to fetch indicators for ${symbol}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch current quote (price) for a symbol
 * @param {string} symbol - Trading symbol
 * @returns {Promise<Object>} Current quote data
 */
export async function fetchCurrentQuote(symbol) {
  try {
    await chart.chart_set_symbol({ symbol });
    const quote = await data.quote_get();

    if (quote.success) {
      return { success: true, quote: quote };
    }
    throw new Error('Failed to fetch quote');
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch multiple symbols with the same action
 * @param {string[]} symbols - Array of symbols to fetch
 * @param {string} action - Action to perform (e.g., "get_ohlcv", "screenshot")
 * @returns {Promise<Object>} Batch results
 */
export async function batchFetch(symbols, action = 'get_ohlcv') {
  try {
    const batch = await data.batch_run({
      symbols,
      action,
    });

    if (batch.success) {
      return { success: true, results: batch };
    }
    throw new Error('Failed to batch fetch');
  } catch (error) {
    console.error(`Failed to batch fetch:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Add an indicator to the current chart
 * @param {string} indicatorName - Full indicator name (e.g., "Relative Strength Index")
 * @param {Object} settings - Indicator settings
 * @returns {Promise<Object>} Result of adding indicator
 */
export async function addIndicator(indicatorName, settings = {}) {
  try {
    const result = await chart.chart_manage_indicator({
      action: 'add',
      name: indicatorName,
      ...settings,
    });

    if (result.success) {
      return { success: true, result };
    }
    throw new Error('Failed to add indicator');
  } catch (error) {
    console.error(`Failed to add indicator ${indicatorName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove an indicator from the current chart
 * @param {string} indicatorName - Full indicator name
 * @returns {Promise<Object>} Result of removing indicator
 */
export async function removeIndicator(indicatorName) {
  try {
    const result = await chart.chart_manage_indicator({
      action: 'remove',
      name: indicatorName,
    });

    if (result.success) {
      return { success: true, result };
    }
    throw new Error('Failed to remove indicator');
  } catch (error) {
    console.error(`Failed to remove indicator ${indicatorName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * TradingViewDataFetcher class for fetching OHLCV data
 * Used by backtest engine for historical data retrieval
 */
export class TradingViewDataFetcher {
  constructor(config = {}) {
    this.base_url = config.base_url || 'http://localhost:8000';
    this.api_key = config.api_key || 'test-key';
    this.cache = new Map();
    this.cacheExpiry = 3600000; // 1 hour
  }

  /**
   * Get OHLCV data for a symbol
   * @param {string} symbol - Trading symbol
   * @param {string} timeframe - Timeframe (1, 5, 15, 60, D, W)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Array of OHLCV bars
   */
  async getOHLCV(symbol, timeframe, startDate, endDate) {
    const cacheKey = `${symbol}:${timeframe}:${startDate.getTime()}:${endDate.getTime()}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
    }

    try {
      // Fetch from TradingView via MCP
      const result = await fetchOHLCVData(symbol, timeframe, 500);

      if (!result.success) {
        throw new Error(`Failed to fetch OHLCV data: ${result.error}`);
      }

      // Parse and filter data by date range
      const bars = result.data.bars || [];
      const filteredBars = bars.filter(bar => {
        const barTime = new Date(bar.time);
        return barTime >= startDate && barTime <= endDate;
      });

      // Cache the result
      this.cache.set(cacheKey, {
        data: filteredBars,
        timestamp: Date.now(),
      });

      return filteredBars;
    } catch (error) {
      console.error(`Failed to get OHLCV for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get indicator values for a symbol
   * @param {string} symbol - Trading symbol
   * @param {string} timeframe - Timeframe
   * @returns {Promise<Object>} Indicator values
   */
  async getIndicators(symbol, timeframe) {
    try {
      const result = await fetchIndicatorValues(symbol, timeframe);
      if (!result.success) {
        throw new Error(`Failed to fetch indicators: ${result.error}`);
      }
      return result.indicators;
    } catch (error) {
      console.error(`Failed to get indicators for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get current quote for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} Quote data
   */
  async getQuote(symbol) {
    try {
      const result = await fetchCurrentQuote(symbol);
      if (!result.success) {
        throw new Error(`Failed to fetch quote: ${result.error}`);
      }
      return result.quote;
    } catch (error) {
      console.error(`Failed to get quote for ${symbol}:`, error);
      throw error;
    }
  }
}

/**
 * SignalGenerator class for generating trading signals
 * Used by backtest engine for signal generation
 */
export class SignalGenerator {
  constructor(strategyConfig, dataFetcher) {
    this.symbol = strategyConfig.symbol;
    this.timeframe = strategyConfig.timeframe;
    this.entryRules = strategyConfig.entry_rules;
    this.exitRules = strategyConfig.exit_rules;
    this.marketType = strategyConfig.market_type;
    this.leverage = strategyConfig.leverage || 1;
    this.dataFetcher = dataFetcher;
  }

  /**
   * Generate trading signals for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Array of signals
   */
  async generateSignals(startDate, endDate) {
    try {
      // Fetch OHLCV data
      const bars = await this.dataFetcher.getOHLCV(
        this.symbol,
        this.timeframe,
        startDate,
        endDate
      );

      // Fetch current indicators
      const indicators = await this.dataFetcher.getIndicators(
        this.symbol,
        this.timeframe
      );

      // Generate signals based on entry/exit rules
      const signals = [];

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        const signal = this._evaluateBar(bar, indicators, i, bars);

        if (signal) {
          signals.push(signal);
        }
      }

      return signals;
    } catch (error) {
      console.error('Error generating signals:', error);
      throw error;
    }
  }

  /**
   * Evaluate a single bar for entry/exit signals
   * @private
   */
  _evaluateBar(bar, indicators, index, bars) {
    const signal = {
      timestamp: new Date(bar.time),
      type: null, // 'entry', 'exit', etc.
      price: bar.close,
      conditions: [],
    };

    // Evaluate entry rules
    if (this.entryRules && this._evaluateConditions(this.entryRules.conditions, bar, indicators)) {
      signal.type = 'entry';
      return signal;
    }

    // Evaluate exit rules
    if (this.exitRules && this._evaluateConditions(this.exitRules.conditions, bar, indicators)) {
      signal.type = 'exit';
      return signal;
    }

    return null;
  }

  /**
   * Evaluate rule conditions
   * @private
   */
  _evaluateConditions(conditions, bar, indicators) {
    if (typeof conditions === 'string') {
      // Simple string-based condition parsing
      // This is a basic implementation; extend as needed
      return this._parseCondition(conditions, bar, indicators);
    }

    if (typeof conditions === 'object') {
      // Array or object of conditions
      return Object.values(conditions).every(cond =>
        this._parseCondition(cond, bar, indicators)
      );
    }

    return false;
  }

  /**
   * Parse and evaluate a single condition string
   * @private
   */
  _parseCondition(conditionStr, bar, indicators) {
    // Simple condition parser - extend with more logic as needed
    // Example: "RSI < 30" or "close > open"

    if (!conditionStr) return true;

    const conditionLower = conditionStr.toLowerCase();

    // Check for basic OHLCV conditions
    if (conditionLower.includes('close')) {
      return this._evaluateExpression(conditionStr, 'close', bar.close, bar, indicators);
    }
    if (conditionLower.includes('open')) {
      return this._evaluateExpression(conditionStr, 'open', bar.open, bar, indicators);
    }
    if (conditionLower.includes('high')) {
      return this._evaluateExpression(conditionStr, 'high', bar.high, bar, indicators);
    }
    if (conditionLower.includes('low')) {
      return this._evaluateExpression(conditionStr, 'low', bar.low, bar, indicators);
    }
    if (conditionLower.includes('volume')) {
      return this._evaluateExpression(conditionStr, 'volume', bar.volume, bar, indicators);
    }

    // Check for indicator conditions
    for (const [indicatorName, indicatorValue] of Object.entries(indicators || {})) {
      if (conditionLower.includes(indicatorName.toLowerCase())) {
        return this._evaluateExpression(conditionStr, indicatorName, indicatorValue, bar, indicators);
      }
    }

    return true; // Default: condition passes if no specific match
  }

  /**
   * Evaluate a mathematical expression
   * @private
   */
  _evaluateExpression(expr, varName, varValue, bar, indicators) {
    // Simple evaluation of expressions like "RSI < 30" or "close > open"
    const regex = new RegExp(`\\b${varName}\\b\\s*([<>]=?|===|!==)\\s*([\\d.]+)`, 'gi');
    const match = regex.exec(expr);

    if (!match) return true;

    const [, operator, compareValue] = match;
    const numValue = parseFloat(compareValue);

    switch (operator) {
      case '<': return varValue < numValue;
      case '>': return varValue > numValue;
      case '<=': return varValue <= numValue;
      case '>=': return varValue >= numValue;
      case '===': return varValue === numValue;
      case '!==': return varValue !== numValue;
      default: return true;
    }
  }
}

export default {
  initializeConnection,
  fetchOHLCVData,
  fetchIndicatorValues,
  fetchCurrentQuote,
  batchFetch,
  addIndicator,
  removeIndicator,
  TradingViewDataFetcher,
  SignalGenerator,
};
