import type { ClaudeExecutableStrategy } from "@/lib/claude-strategy-schema";

export const validLongStrategy = (): ClaudeExecutableStrategy => ({
  name: "BTC RSI Long",
  description: "Long when RSI oversold vs structured threshold",
  symbol: "BTCUSDT",
  timeframe: "1h",
  market_type: "spot",
  entries: [
    {
      direction: "long",
      condition: {
        type: "group",
        op: "and",
        rules: [
          {
            type: "indicator",
            indicator: "rsi",
            period: 14,
            operator: "<",
            value: 30,
          },
        ],
      },
    },
  ],
  exit_condition: null,
  stop_loss_percent: 2,
  take_profit_percent: 4,
  risk_per_trade_pct: 1.5,
  leverage: 1,
});

export const validShortStrategy = (): ClaudeExecutableStrategy => ({
  name: "ETH RSI Short",
  description: "Short stretch",
  symbol: "ETHUSDT",
  timeframe: "15m",
  market_type: "spot",
  entries: [
    {
      direction: "short",
      condition: {
        type: "indicator",
        indicator: "rsi",
        period: 14,
        operator: ">",
        value: 70,
      },
    },
  ],
  stop_loss_percent: 2,
  take_profit_percent: 3,
  risk_per_trade_pct: 1,
  leverage: 1,
});

export const validDualStrategy = (): ClaudeExecutableStrategy => ({
  name: "SOL Dual RSI",
  description: "Long and short setups",
  symbol: "SOLUSDT",
  timeframe: "4h",
  market_type: "spot",
  entries: [
    {
      direction: "long",
      condition: {
        type: "indicator",
        indicator: "rsi",
        period: 14,
        operator: "<",
        value: 30,
      },
    },
    {
      direction: "short",
      condition: {
        type: "indicator",
        indicator: "rsi",
        period: 14,
        operator: ">",
        value: 70,
      },
    },
  ],
  stop_loss_percent: 2.5,
  take_profit_percent: 5,
  risk_per_trade_pct: 2,
  leverage: 1,
});
