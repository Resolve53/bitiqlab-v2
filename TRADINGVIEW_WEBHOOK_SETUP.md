# TradingView Webhook Integration Guide

## Overview

Connect TradingView directly to your paper trading system! When a TradingView alert fires, trades execute instantly on Binance testnet.

**Webhook URL**: `https://your-api.com/api/paper-trading/webhook/tradingview`

---

## How It Works

```
TradingView Alert Fires
    ↓
Sends JSON to your webhook
    ↓
Backend validates session & strategy
    ↓
Places BUY/SELL order on Binance testnet
    ↓
Logs trade to database
    ↓
Dashboard updates immediately
```

---

## Step 1: Get Your Webhook URL

Replace with your actual backend domain:

**Development (Local)**:
```
http://localhost:3001/api/paper-trading/webhook/tradingview
```

**Production (Railway)**:
```
https://your-app-name.up.railway.app/api/paper-trading/webhook/tradingview
```

**Production (Vercel)**:
```
https://your-app-name.vercel.app/api/paper-trading/webhook/tradingview
```

---

## Step 2: Create a Strategy in TradingView

### Option A: Using a Built-in Strategy

1. Open TradingView: https://www.tradingview.com/
2. Go to **Pine Editor** → Create a new strategy
3. Use the template below

### Option B: Use Existing Strategy

If you already have a strategy, just add alerts to it.

---

## Step 3: Add Alert to Your Strategy

### In TradingView Chart:

1. **Click "Alerts"** in the toolbar
2. **Click "+ Create Alert"**
3. **Configure Alert**:
   - Strategy: Select your strategy
   - Condition: Choose signal (e.g., "Entry" or "Exit")
   - Frequency: "Once Per Bar"

4. **Notification Type**: Select **"Webhook URL"**

5. **Webhook URL**: Paste your webhook URL from Step 1

6. **Alert Message**: Use the JSON format below

---

## Step 4: Format the Alert Message

The alert message tells the backend which session to trade and what signal to send.

### Minimal Format (Required):

```json
{
  "session_id": "abc-123-def-456",
  "signal": "BUY",
  "symbol": "BTCUSDT"
}
```

### Full Format (Recommended):

```json
{
  "session_id": "abc-123-def-456",
  "signal": "BUY",
  "symbol": "BTCUSDT",
  "price": 67500.50,
  "confidence": 85,
  "reason": "RSI oversold + MACD bullish",
  "risk_percentage": 2
}
```

### Example Pine Script Alert Call:

```pinescript
strategy.entry("Buy Signal", strategy.long)
// Later in code, when closing:
alertsent = "Entry triggered at " + str.tostring(close)
alert('{"session_id":"YOUR_SESSION_ID","signal":"BUY","symbol":"BTCUSDT","price":' + str.tostring(close) + ',"confidence":75,"reason":"Strategy entry"}', alert.freq_once_per_bar)
```

---

## Step 5: Get Your Session ID

Where do you find `session_id`?

### Method 1: From Dashboard URL
```
https://your-app.com/paper-trading/{session_id}/dashboard
                                     ^^^^^^^^^^^
                                   Copy this!
```

### Method 2: From Browser Console (After opening dashboard)
```javascript
// On paper trading dashboard page, open DevTools (F12) → Console
const url = window.location.pathname;
const sessionId = url.split('/')[3]; // e.g., "abc-123-def-456"
console.log(sessionId);
```

### Method 3: From Database
Ask your database to list active sessions for your strategy.

---

## Step 6: Create an Alert in TradingView

### Complete Alert Setup:

1. **Chart**: BTCUSDT, 1h timeframe (or your preferred)
2. **Condition**: 
   - Enter: "When strategy entry signal fires"
   - Exit: "When strategy exit signal fires"
3. **Notification Type**: **Webhook URL**
4. **Webhook URL**: 
   ```
   https://your-api.com/api/paper-trading/webhook/tradingview
   ```
5. **Message**:
   ```json
   {
     "session_id": "YOUR_SESSION_ID_HERE",
     "signal": "BUY",
     "symbol": "BTCUSDT",
     "price": {{ close }},
     "confidence": 85,
     "reason": "Strategy entry triggered"
   }
   ```

6. **Click "Create"** ✓

---

## Step 7: Test the Webhook

### Test Without TradingView:

```bash
curl -X POST https://your-api.com/api/paper-trading/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "YOUR_SESSION_ID",
    "signal": "BUY",
    "symbol": "BTCUSDT",
    "price": 67500,
    "confidence": 85,
    "reason": "Test signal"
  }'
```

### Expected Response:

```json
{
  "success": true,
  "data": {
    "status": "success",
    "order_id": 12345,
    "symbol": "BTCUSDT",
    "signal": "BUY",
    "message": "BUY order executed successfully",
    "timestamp": "2024-04-27T10:30:00Z"
  }
}
```

---

## Step 8: Monitor Execution

### Check Backend Logs:

Look for messages like:
```
[WEBHOOK] TradingView signal received: BUY BTCUSDT
[WEBHOOK] Session: abc-123-def-456, Reason: Strategy entry triggered
[WEBHOOK] Price fetched from Binance: BTCUSDT = $67,500
[WEBHOOK] Executing BUY order: 0.0296 BTCUSDT @ $67,500
[WEBHOOK] ✓ Order executed successfully! Order ID: 789456
[WEBHOOK] ✓ Trade recorded in database
```

### Check Dashboard:

- Trade appears in "Trade History" immediately
- "Total Trades" count increases
- "Current Balance" updates with P&L

### Check Binance Testnet:

1. Go to https://testnet.binance.vision/
2. Click **Trade** → **Orders**
3. Look for recent BTCUSDT orders

---

## Real-World Examples

### Example 1: Simple RSI Strategy

```pinescript
//@version=5
strategy("RSI Trading Strategy", overlay=false)

rsiLen = input(14, title="RSI Length")
overbought = input(70, title="Overbought Level")
oversold = input(30, title="Oversold Level")

rsi = ta.rsi(close, rsiLen)

// Entry signals
if rsi < oversold
    strategy.entry("Buy", strategy.long)
    
if rsi > overbought
    strategy.entry("Sell", strategy.short)

// Exit with take profit
if strategy.position_size > 0 and close > strategy.position_avg_price * 1.05
    strategy.close("Buy")
```

**Alert Message for Entry**:
```json
{
  "session_id": "YOUR_SESSION_ID",
  "signal": "BUY",
  "symbol": "BTCUSDT",
  "price": {{ close }},
  "confidence": {{ rsi < 20 ? 90 : 75 }},
  "reason": "RSI oversold at {{ rsi }}"
}
```

---

### Example 2: MACD Strategy

```pinescript
//@version=5
strategy("MACD Strategy", overlay=false)

[macdLine, signalLine, histogram] = ta.macd(close, 12, 26, 9)

// Bullish crossover
if ta.crossover(macdLine, signalLine)
    strategy.entry("Buy", strategy.long)

// Bearish crossover
if ta.crossunder(macdLine, signalLine)
    strategy.close("Buy")
```

**Alert Message**:
```json
{
  "session_id": "YOUR_SESSION_ID",
  "signal": "BUY",
  "symbol": "BTCUSDT",
  "price": {{ close }},
  "confidence": 80,
  "reason": "MACD bullish crossover"
}
```

---

## Troubleshooting

### Issue: Alert Created But No Trade Executes

**Check**:
1. ✓ Session ID is correct
2. ✓ Symbol matches strategy symbol (BTCUSDT not BTC)
3. ✓ Signal is "BUY" or "SELL" (case-sensitive)
4. ✓ Session still active (not expired)

**Test**: Use curl command from Step 7 to verify webhook is reachable

---

### Issue: "Session not found" Error

**Reason**: Session ID doesn't exist or is incorrect

**Solution**:
1. Create new paper trading session
2. Copy exact session ID from URL
3. Update alert message with correct ID

---

### Issue: "Cannot SELL without open position" Error

**Reason**: Trying to SELL when no BUY position exists

**Solution**:
1. Send BUY signal first to open position
2. Then send SELL signal to close

---

### Issue: Webhook URL Not Accepting Requests

**Check**:
1. ✓ URL is publicly accessible (not localhost in production)
2. ✓ HTTPS not HTTP for production
3. ✓ No typos in URL
4. ✓ Backend is actually running

**Test**: 
```bash
curl -v https://your-api.com/api/health
# Should return 200 OK
```

---

## Advanced Configuration

### Variable Parameters from TradingView:

You can pass dynamic values from your strategy:

```json
{
  "session_id": "YOUR_SESSION_ID",
  "signal": "{{ strategy.position_size > 0 ? 'SELL' : 'BUY' }}",
  "symbol": "BTCUSDT",
  "price": {{ close }},
  "confidence": {{ strategy.max_bars_back }},
  "reason": "Position: {{ strategy.position_size }}",
  "risk_percentage": 2
}
```

### Custom Risk Percentage:

Control position size from alerts:

```json
{
  "session_id": "YOUR_SESSION_ID",
  "signal": "BUY",
  "symbol": "BTCUSDT",
  "risk_percentage": 3
}
```

- `1` = 1% of balance (small position)
- `2` = 2% of balance (default)
- `5` = 5% of balance (large position)

---

## Best Practices

### ✓ Do:
- Test alerts in TradingView's "Test" mode first
- Use consistent session IDs across multiple alerts
- Include confidence and reason for debugging
- Monitor logs when alerts fire

### ✗ Don't:
- Hard-code session IDs - they change each session
- Send BUY alerts too frequently (rate limiting)
- Forget to set alert frequency to "Once Per Bar"
- Use production API without testing first

---

## Monitoring Webhook Activity

### Enable Detailed Logging:

Backend automatically logs all webhook calls:

```
[WEBHOOK] TradingView signal received: ...
[WEBHOOK] Session: ...
[WEBHOOK] ✓ Order executed successfully!
[WEBHOOK] ✓ Trade recorded in database
```

Check your backend logs when alerts fire to verify execution.

---

## Next Steps

1. **Create a TradingView strategy** (or use existing)
2. **Get your session ID** from paper trading dashboard
3. **Set up an alert** with webhook URL
4. **Test with curl** from Step 7
5. **Monitor execution** in logs and on Binance testnet
6. **Refine strategy** based on results

---

## Support

| Issue | Solution |
|-------|----------|
| Webhook not reachable | Verify API URL is public and HTTPS |
| Wrong session | Copy exact session ID from URL |
| Invalid JSON | Test JSON in https://jsonlint.com/ |
| Orders not appearing | Check Binance testnet account has funds |
| No logs showing | Verify backend is actually running |

Once you have this working, your TradingView strategy can execute trades directly on Binance testnet in real-time! 🚀

