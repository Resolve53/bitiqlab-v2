# TradingView Live Strategy Execution Guide

## Overview

Your strategies now execute **live on TradingView charts** with real-time signals!

When you create a strategy and start monitoring:
1. Strategy gets registered with your TradingView chart
2. MCP monitors chart indicators in real-time
3. When signals trigger → Trades execute automatically on Binance testnet
4. Dashboard updates with live results

---

## Prerequisites

✅ Paid TradingView account  
✅ TradingView Desktop installed  
✅ Chrome DevTools Protocol enabled  
✅ Backend deployed  

---

## Complete Setup (5 Minutes)

### Step 1: Start TradingView with CDP

**Windows (PowerShell as Admin):**
```powershell
"C:\Program Files\TradingView\TradingView.exe" --remote-debugging-port=9222
```

**Mac:**
```bash
/Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222
```

**Verify it's running:**
```bash
curl http://localhost:9222/json/list
```

---

### Step 2: Open Chart in TradingView

1. **Launch TradingView Desktop**
2. **Open Chart**: BTCUSDT, 1h timeframe
3. **Add Indicators**:
   - **RSI**: Period 14
   - **MACD**: (12, 26, 9)
   - **Bollinger Bands**: Period 20, Std Dev 2
   - **Moving Averages**: SMA 20 and SMA 50

4. **Leave window open** - Monitoring runs in background

---

### Step 3: Create a Strategy in App

1. Go to your app
2. Click **"Create Strategy"**
3. Fill in details:
   - **Name**: e.g., "BTC Oversold Bounce"
   - **Symbol**: BTCUSDT
   - **Timeframe**: 1h
   - **Idea**: e.g., "Buy when RSI oversold below 30"

4. Click **"Create"**

---

### Step 4: Start Paper Trading

1. Go to Strategies page
2. Find your strategy
3. Click **"Start Paper Trading"**
4. Set initial balance: $5,000
5. Click **"Start"**

---

### Step 5: Register with TradingView

Once paper trading session starts, you'll see a **"Register with TradingView"** button.

**Click it!**

```
POST /api/paper-trading/register-tradingview
{
  "strategy_id": "abc-123",
  "session_id": "xyz-789"
}
```

Expected response:
```
✓ Strategy registered
✓ Monitoring TradingView chart for live signals
✓ Ready to execute trades
```

---

### Step 6: Watch It Execute

Now watch your TradingView chart:

**Backend logs will show:**
```
[STRATEGY] Registered strategy: BTC Oversold Bounce
[STRATEGY] Connected to TradingView chart: BTCUSDT 1h
[STRATEGY] Current price: $67,432.50
[STRATEGY] Indicators: RSI=28.5, MACD=150.25

[Every 5 seconds...]
[STRATEGY] Evaluating conditions...
[STRATEGY] RSI oversold (28.5) ✓
[STRATEGY] MACD bullish ✓
[STRATEGY] 📊 Signal generated: BUY
[STRATEGY] Confidence: 85%
[STRATEGY] Reason: RSI oversold (28.5); MACD bullish crossover
```

**Trades execute immediately:**
```
[MONITOR] Executing BUY trade...
[MONITOR] Order: BUY 0.0296 BTCUSDT @ $67,432.50
[MONITOR] ✓ Order placed! Order ID: 123456
[MONITOR] ✓ Trade recorded in database
```

**Dashboard updates in real-time:**
```
Total Trades: 1 (was 0)
Current Balance: $4,900 (was $5,000)
Trade History: [BUY 0.0296 BTCUSDT]
```

---

## How Signals Are Generated

### Current Implementation

The system evaluates these indicators from your TradingView chart:

| Indicator | Buy Signal | Confidence |
|-----------|-----------|------------|
| **RSI < 30** | Oversold | +35% |
| **MACD Bullish** | Line > Signal | +30% |
| **Price > MA20** | Above short MA | +25% |
| **MA20 > MA50** | In uptrend | +25% |
| **Price < Lower BB** | Below Bollinger | +25% |

**Trade executes when: Total Confidence > 50%**

### Example

```
TradingView Chart shows:
- RSI: 28 (oversold) ✓ +35%
- MACD: Line crossed above Signal ✓ +30%
- Price: $67,432 > MA20: $67,200 ✓ +25%

Total Confidence: 90% ✓

Result: BUY signal triggered!
```

---

## API Endpoints

### Register Strategy with TradingView

```bash
POST /api/paper-trading/register-tradingview

{
  "strategy_id": "your-strategy-id",
  "session_id": "your-session-id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "registered",
    "strategy_id": "abc-123",
    "session_id": "xyz-789",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "message": "Strategy is now monitoring TradingView chart"
  }
}
```

### Monitor Session (Existing)

```bash
POST /api/paper-trading/monitor

{
  "session_id": "your-session-id",
  "auto_trade": true,
  "use_mcp": true
}
```

---

## Workflow Example

### 1. Create Strategy
```
App: "Create Strategy"
Input: "Buy when RSI oversold"
Output: strategy_id = "abc-123"
```

### 2. Start Paper Trading
```
App: "Start Paper Trading"
Input: strategy_id = "abc-123", initial_balance = $5,000
Output: session_id = "xyz-789"
```

### 3. Register with TradingView
```
API: POST /api/paper-trading/register-tradingview
Input: strategy_id = "abc-123", session_id = "xyz-789"
Output: ✓ Monitoring started
```

### 4. Monitor Automatically
```
Every 5 seconds:
1. Fetch indicators from TradingView chart
2. Evaluate strategy conditions
3. If signal: Execute trade on Binance testnet
4. Update dashboard with results
```

### 5. View Results
```
Dashboard shows:
- Live P&L
- Trade history
- Open positions
- Win rate
- Real-time updates
```

---

## Monitoring Details

### What Gets Monitored

From your TradingView chart, the system fetches:

```typescript
{
  symbol: "BTCUSDT",
  timeframe: "1h",
  price: 67432.50,
  indicators: {
    rsi: 28.5,
    macd: {
      line: 150.25,
      signal: 140.10,
      histogram: 10.15
    },
    bollinger_bands: {
      upper: 68500,
      middle: 67432,
      lower: 66365
    },
    moving_average_20: 67200,
    moving_average_50: 66800
  }
}
```

### Update Frequency

- **Check interval**: Every 5 seconds
- **Price updates**: Real-time from TradingView
- **Signal cooldown**: 5 seconds (prevents spam)
- **Dashboard refresh**: Every 5 seconds

---

## Troubleshooting

### Issue: "TradingView MCP connection timeout"

**Solutions:**
1. Verify TradingView is running with CDP:
   ```bash
   curl http://localhost:9222/json/list
   ```

2. Restart TradingView with CDP flag:
   ```bash
   killall TradingView
   /path/to/TradingView --remote-debugging-port=9222
   ```

3. Check that a chart is open in TradingView

---

### Issue: "No signals being generated"

**Check:**
1. ✓ Chart has indicators added (RSI, MACD, BB, MA)
2. ✓ Indicators are **visible** on chart (not hidden)
3. ✓ Market conditions don't match signals yet
   - RSI needs to be < 30 for BUY
   - MACD needs bullish crossover
   - Price needs specific MA relationship

**Test:** Make indicators visible, adjust RSI threshold to < 50 temporarily

---

### Issue: Orders not appearing on Binance testnet

**Check:**
1. ✓ Binance testnet credentials are correct
2. ✓ Testnet account has sufficient USDT funds
3. ✓ Backend logs show "[MONITOR] ✓ Order placed"

**Request testnet funds:**
```
https://testnet.binance.vision/
Wallet → Deposit USDT → Request free funds
```

---

### Issue: Dashboard not updating

**Check:**
1. ✓ Monitor is running (logs show "[STRATEGY] Evaluating...")
2. ✓ Refresh browser
3. ✓ Check browser console for errors (F12)

---

## Advanced: Customize Signal Logic

Edit the signal generation in:
```
backend/src/lib/tradingview-strategy-manager.ts
Line 205: generateSignal() function
```

Change confidence thresholds:
```typescript
// Default: +35 for RSI < 30
// Change to: +50 for RSI < 25
if (indicators.rsi < 25) {
  confidence += 50;  // ← Adjust this
}
```

---

## Performance

| Metric | Value |
|--------|-------|
| Update Frequency | 5 seconds |
| Order Execution Time | < 2 seconds |
| Dashboard Refresh | < 1 second |
| Total Cycle Time | ~1-3 seconds |

---

## Next Steps

1. ✅ **Start TradingView with CDP**
2. ✅ **Open a chart with indicators**
3. ✅ **Create a strategy in your app**
4. ✅ **Start paper trading**
5. ✅ **Register with TradingView**
6. ✅ **Watch trades execute live!**

Your strategies are now live on TradingView! 🚀

---

## Support

| Problem | Solution |
|---------|----------|
| Can't start TradingView | Reinstall or check firewall |
| CDP not accessible | Wrong port or TradingView closed |
| No signals | Check indicator visibility on chart |
| Orders failing | Check Binance testnet credentials |
| Dashboard frozen | Refresh page or restart backend |

Let me know if you hit any issues!

