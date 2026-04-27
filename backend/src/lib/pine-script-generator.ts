/**
 * Pine Script Generator
 * Converts strategy rules to executable TradingView Pine Script
 */

import { Strategy } from "@/core";

export interface PineScriptConfig {
  strategyName: string;
  entryRules: string;
  exitRules: string;
  timeframe: string;
  symbol: string;
}

export class PineScriptGenerator {
  /**
   * Generate Pine Script from strategy rules
   */
  static generate(strategy: Strategy): string {
    const config: PineScriptConfig = {
      strategyName: strategy.name.replace(/\s+/g, "_"),
      entryRules: strategy.entry_rules?.conditions || "close < open",
      exitRules: strategy.exit_rules?.stop_loss_percent?.toString() || "-2",
      timeframe: strategy.timeframe,
      symbol: strategy.symbol,
    };

    return this.buildPineScript(config, strategy);
  }

  /**
   * Build complete Pine Script
   */
  private static buildPineScript(
    config: PineScriptConfig,
    strategy: Strategy
  ): string {
    const indicators = this.detectIndicators(strategy);
    const entryLogic = this.parseEntryRules(strategy.entry_rules);
    const exitLogic = this.parseExitRules(strategy.exit_rules);

    return `
//@version=5
strategy("${config.strategyName}", overlay=true,
         default_qty_type=strategy.percent_of_equity, default_qty_value=2)

// ============================================
// Configuration
// ============================================
risk_percent = input(2, "Risk %", minval=0.1, maxval=100)
${indicators}

// ============================================
// Entry Conditions
// ============================================
${entryLogic}

// ============================================
// Exit Conditions
// ============================================
${exitLogic}

// ============================================
// Strategy Execution
// ============================================
if entry_signal and not strategy.opentrades
    strategy.entry("BUY", strategy.long)

if exit_signal
    strategy.close("BUY")

// ============================================
// Alerts for Webhook
// ============================================
alertmessage = ""
if entry_signal
    alertmessage := "SIGNAL_BUY"
if exit_signal
    alertmessage := "SIGNAL_SELL"

if alertmessage != ""
    alert(alertmessage, alert.freq_once_per_bar_close)

// ============================================
// Plotting
// ============================================
plot(strategy.equity, "Equity", color.blue)
`;
  }

  /**
   * Detect required indicators from strategy rules
   */
  private static detectIndicators(strategy: Strategy): string {
    const indicators: string[] = [];
    const ruleStr = JSON.stringify(strategy.entry_rules).toLowerCase();

    if (ruleStr.includes("rsi")) {
      indicators.push('rsi = ta.rsi(close, 14)');
      indicators.push('plot(rsi, "RSI", color.orange)');
      indicators.push('hline(70, "Overbought", color.red)');
      indicators.push('hline(30, "Oversold", color.green)');
    }

    if (ruleStr.includes("macd")) {
      indicators.push('[macdLine, signalLine, histogram] = ta.macd(close, 12, 26, 9)');
      indicators.push('plot(macdLine, "MACD", color.blue)');
      indicators.push('plot(signalLine, "Signal", color.red)');
    }

    if (ruleStr.includes("bollinger") || ruleStr.includes("bb")) {
      indicators.push('basis = ta.sma(close, 20)');
      indicators.push('dev = ta.stdev(close, 20)');
      indicators.push('upper = basis + (dev * 2)');
      indicators.push('lower = basis - (dev * 2)');
      indicators.push('plot(upper, "BB Upper", color.gray)');
      indicators.push('plot(lower, "BB Lower", color.gray)');
    }

    if (ruleStr.includes("sma") || ruleStr.includes("moving")) {
      indicators.push('sma20 = ta.sma(close, 20)');
      indicators.push('sma50 = ta.sma(close, 50)');
      indicators.push('plot(sma20, "SMA 20", color.blue)');
      indicators.push('plot(sma50, "SMA 50", color.orange)');
    }

    return indicators.join('\n');
  }

  /**
   * Parse entry rules into Pine Script conditions
   */
  private static parseEntryRules(entryRules: any): string {
    if (!entryRules) {
      return 'entry_signal = close > open';
    }

    let condition = entryRules.conditions || '';

    // Replace common patterns
    condition = condition
      .replace(/RSI\s*<\s*30/gi, 'rsi < 30')
      .replace(/RSI\s*>\s*70/gi, 'rsi > 70')
      .replace(/MACD.*cross/gi, 'ta.cross(macdLine, signalLine)')
      .replace(/price.*above.*SMA/gi, 'close > sma50')
      .replace(/price.*below.*SMA/gi, 'close < sma50')
      .replace(/close\s*<\s*open/gi, 'close < open')
      .replace(/close\s*>\s*open/gi, 'close > open');

    return `entry_signal = ${condition || 'close > open'}`;
  }

  /**
   * Parse exit rules into Pine Script conditions
   */
  private static parseExitRules(exitRules: any): string {
    if (!exitRules) {
      return `
stop_loss_pct = input(2.0, "Stop Loss %")
take_profit_pct = input(5.0, "Take Profit %")
exit_signal = false`;
    }

    const stopLossPct = Math.abs(exitRules.stop_loss_percent || 2);
    const takeProfitPct = exitRules.take_profit_percent || 5;

    return `
stop_loss_pct = ${stopLossPct}
take_profit_pct = ${takeProfitPct}

entry_price = strategy.opentrades.entry_price(0)
current_pnl_pct = (close - entry_price) / entry_price * 100

exit_signal = (current_pnl_pct <= -stop_loss_pct) or (current_pnl_pct >= take_profit_pct)`;
  }

  /**
   * Generate webhook payload Pine Script
   */
  static generateWebhookCode(sessionId: string, symbol: string): string {
    return `
// Webhook Configuration
WEBHOOK_URL = "${process.env.NEXT_PUBLIC_API_URL || 'https://bitiqlab-v2-production.up.railway.app'}/api/paper-trading/execute-signal"
SESSION_ID = "${sessionId}"
SYMBOL = "${symbol}"

// Send webhook on signal
if entry_signal
    request.post(WEBHOOK_URL, headers={"Content-Type": "application/json"}, body=json.stringify({
        "session_id": SESSION_ID,
        "signal": "BUY",
        "symbol": SYMBOL,
        "reason": "Entry signal triggered"
    }))

if exit_signal
    request.post(WEBHOOK_URL, headers={"Content-Type": "application/json"}, body=json.stringify({
        "session_id": SESSION_ID,
        "signal": "SELL",
        "symbol": SYMBOL,
        "reason": "Exit signal triggered"
    }))
`;
  }
}
