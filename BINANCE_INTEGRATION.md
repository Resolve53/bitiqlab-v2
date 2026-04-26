# Binance Testnet Integration Guide

This document describes the Binance Demo Trading Integration, which enables real-time trading simulations using Binance's testnet API.

## Overview

The integration provides:

- **Real-time Price Feeds**: WebSocket-based price streaming from Binance
- **Automated Signal Generation**: Technical indicator evaluation (RSI, MACD, Bollinger Bands, MA)
- **Paper Trading Execution**: Market and limit order placement on testnet
- **Live P&L Tracking**: Real-time profit/loss calculations
- **Auto-Trading Mode**: Hands-off strategy execution when conditions are met

## Setup

### 1. Get Binance Testnet API Keys

Visit [https://testnet.binance.vision/](https://testnet.binance.vision/) and follow these steps:

1. Sign up for a free account
2. Generate API key and API secret
3. Store them securely

### 2. Configure Environment Variables

Create a `.env.local` file in the backend directory:

```bash
# Binance Testnet Configuration
BINANCE_TESTNET_API_KEY=your_testnet_api_key_here
BINANCE_TESTNET_API_SECRET=your_testnet_api_secret_here

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# API
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3. Start the Application

```bash
cd backend
npm install  # If dependencies not installed
npm run dev

# In another terminal
cd frontend
npm install
npm run dev
```

## Architecture

### Backend Components

#### 1. **BinanceTradingClient** (`src/lib/binance-trading.ts`)

Handles authenticated trading operations:

```typescript
const client = getTradingClient(true); // useTestnet = true

// Get account balance
const balance = await client.getBalance("USDT");

// Place market order
const order = await client.marketOrder("BTCUSDT", "BUY", 0.01);

// Place limit order
const limitOrder = await client.limitOrder("BTCUSDT", "BUY", 0.01, 45000);

// Check order status
const status = await client.getOrderStatus("BTCUSDT", orderId);

// Get open orders
const openOrders = await client.getOpenOrders("BTCUSDT");

// Get current price
const price = await client.getPrice("BTCUSDT");
```

#### 2. **BinanceWebSocketManager** (`src/lib/binance-websocket.ts`)

Real-time price streaming:

```typescript
const wsManager = getWebSocketManager();

// Subscribe to price updates
wsManager.subscribe("BTCUSDT", (tick) => {
  console.log(`${tick.symbol}: ${tick.price}`);
});

// Get cached price
const price = wsManager.getPrice("BTCUSDT");

// Unsubscribe
wsManager.unsubscribe("BTCUSDT", callback);
```

#### 3. **StrategyEvaluator** (`src/lib/strategy-evaluator.ts`)

Technical indicator evaluation and signal generation:

```typescript
const evaluator = getEvaluator();

// Evaluate entry conditions
const signal = await evaluator.evaluateEntry(
  "BTCUSDT",
  "1h",
  strategy.entry_rules,
  currentPrice
);

// Returns: { signal: "BUY" | "SELL" | "HOLD", confidence: 0-100, indicators: {...} }

// Evaluate exit conditions
const exitSignal = await evaluator.evaluateExit(
  "BTCUSDT",
  entryPrice,
  currentPrice,
  strategy.exit_rules
);
```

### API Endpoints

#### Start Paper Trading Session
```
POST /api/paper-trading/start
Body: {
  strategy_id: string,
  initial_balance: number (default: 10000),
  use_testnet: boolean (default: true)
}
Response: { session_id, session_name, initial_balance, ... }
```

#### Execute Trading Signal
```
POST /api/paper-trading/execute-signal
Body: {
  session_id: string,
  signal: "BUY" | "SELL",
  symbol: string,
  reason?: string,
  risk_percentage?: number (default: 2)
}
Response: { order_id, signal, symbol, quantity, price, status }
```

#### Get Session Status & P&L
```
GET /api/paper-trading/{session_id}/status
Response: {
  session_id, strategy_name, current_balance, total_pl, pl_percentage,
  total_trades, winning_trades, losing_trades, win_rate,
  trades: [...], open_positions: [...]
}
```

#### Monitor & Auto-Execute
```
POST /api/paper-trading/monitor
Body: {
  session_id: string,
  auto_trade: boolean (default: true),
  check_interval?: number
}
Response: { last_signal, position_status, session_stats }
```

### Frontend Components

#### Paper Trading Dashboard
Located at: `/paper-trading/[session_id]/dashboard`

Features:
- Real-time balance and P&L tracking (updates every 5 seconds)
- Open positions with unrealized P&L
- Complete trade history
- Auto-trading toggle and status
- Performance metrics (win rate, total trades, etc.)

#### Paper Trading Modal
Integrated into strategy cards to start new paper trading sessions:
- Initial balance configuration
- Trading pair selection
- Timeframe selection
- Binance testnet checkbox
- Auto-redirects to dashboard on success

## Trading Workflow

### 1. Create a Strategy

Generate or manually create a strategy on the `/strategies` page.

### 2. Start Paper Trading

Click "🚀 Paper Trading" on any strategy card:
- Configure initial balance (min $100)
- Select trading pair
- Select timeframe
- Enable/disable testnet
- Submit to create session

### 3. Monitor Live Trading

The dashboard displays:
- **Real-time P&L**: Updated every 5 seconds from Binance testnet
- **Open Positions**: Unrealized gains/losses
- **Trade History**: Complete execution record
- **Performance Metrics**: Win rate, total profit, etc.

### 4. Auto-Trading Mode

Enable auto-trading to let the system automatically:
1. Evaluate strategy entry/exit conditions
2. Check technical indicators
3. Generate BUY/SELL signals
4. Execute orders when confidence > 50%

## Technical Indicators

The StrategyEvaluator calculates and uses:

### RSI (Relative Strength Index)
- **Oversold**: RSI < 30 (buy signal)
- **Overbought**: RSI > 70 (sell signal)

### MACD (Moving Average Convergence Divergence)
- **Bullish Crossover**: MACD line > Signal line
- **Bearish Crossover**: MACD line < Signal line

### Bollinger Bands
- **Buy**: Price below lower band
- **Sell**: Price above upper band

### Moving Averages
- **Uptrend**: SMA20 > SMA50 and Price > SMA20
- **Downtrend**: SMA20 < SMA50 and Price < SMA20

## Position Sizing

Default risk per trade: **2% of account balance**

```
For BUY:  Quantity = (Balance × 0.02) / Current Price
For SELL: Quantity = Current Position Size
```

## Error Handling

Common errors and solutions:

### "Insufficient USDT balance in testnet account"
- Solution: Request testnet funds at https://testnet.binance.vision/

### "Cannot SELL without an open position"
- Solution: Execute BUY signals first, or wait for entry conditions

### "Invalid order quantity calculated"
- Solution: Ensure position size > minimum order quantity for symbol

### "WebSocket reconnection failed"
- Solution: Check internet connection and retry (auto-reconnect with exponential backoff)

## Database Schema

Key tables:

- `trading_sessions`: Paper trading sessions
- `paper_trades`: Individual trades (entries/exits)
- `strategies`: Strategy configurations
- `strategy_audit_log`: Audit trail of changes

## Performance Optimization

- **Indicator Caching**: 1-minute cache to avoid redundant calculations
- **WebSocket Pooling**: Single connection per symbol
- **Batch Database Updates**: Aggregate P&L calculations
- **Lazy Loading**: Dashboard data loaded on-demand

## Security Considerations

⚠️ **Important Security Notes:**

1. **Testnet API Keys**: Use testnet keys only (fake money)
2. **Never Log Keys**: API keys should never appear in logs or commits
3. **Environment Variables**: Store sensitive data in `.env.local` (git-ignored)
4. **Production Ready**: For live trading, implement additional security:
   - Rate limiting on API endpoints
   - IP whitelisting on Binance account
   - 2FA authentication
   - Hardware wallet for large positions

## Next Steps

After Binance integration is complete:

1. **TradingView Integration**: Connect webhook alerts to execute strategies
2. **Strategy Auto-Optimization**: Dynamically adjust parameters based on backtest results
3. **Multi-Account Support**: Trade same strategy across multiple accounts
4. **Advanced Analytics**: Equity curve analysis, drawdown tracking, etc.

## Troubleshooting

### Dashboard not updating
- Check browser console for errors
- Verify API endpoints are running
- Check Supabase connection

### Orders not executing
- Verify Binance API keys are correct
- Check USDT balance in testnet account
- Review order quantity calculations

### WebSocket disconnecting
- Normal - reconnection is automatic
- Check network connectivity
- Monitor logs for reconnection attempts

## References

- [Binance Testnet API Docs](https://testnet.binance.vision/)
- [Binance Trading Rules](https://www.binance.com/en/trade-rule)
- [Technical Indicators](https://www.investopedia.com/terms/t/technicalindicator.asp)
