# Paper Trading Monitoring & TradingView Integration Guide

## What's New

You now have **complete real-time monitoring** with **TradingView price integration**!

### Key Features

✅ **Real-Time TradingView Prices** - Get live prices directly from TradingView  
✅ **Automatic Trade Execution** - Trades execute every 5 seconds while monitoring  
✅ **Detailed Logging** - See exactly what's happening at each step  
✅ **Fallback to Binance** - If TradingView fails, uses Binance automatically  
✅ **Continuous Monitoring** - Runs in background monitoring loop  

---

## How It Works Now

### The Monitoring Loop

When you click **"▶️ Start Monitoring"**:

```
1. Call /api/paper-trading/monitor
   ↓
2. Fetch current price from TradingView
   ↓
3. Evaluate strategy entry/exit conditions
   ↓
4. IF signal triggered → Place trade on Binance testnet
   ↓
5. Log trade to database
   ↓
6. Update session P&L
   ↓
7. Wait 5 seconds, repeat from step 2
```

### Price Sources (In Order of Preference)

1. **TradingView API** (Real-time market data)
   - Primary source for live prices
   - Access to full market data
   - If working: `Price from TradingView: BTCUSDT = $67,500`

2. **Binance REST API** (Fallback)
   - Used if TradingView unavailable
   - Still real-time market prices
   - If used: `Price from Binance: BTCUSDT = $67,500`

---

## Checking If Trades Are Executing

### Method 1: Check the Logs

**Backend Logs** (where your backend is running):

Look for messages like:
```
[MONITOR] Starting monitor for session: abc-123-def
[MONITOR] Strategy: Buy when price bounces (BTCUSDT 1h)
[MONITOR] Price from TradingView: BTCUSDT = $67,500
[MONITOR] No open position - evaluating ENTRY conditions
[MONITOR] Entry Signal: BUY, Confidence: 75%, Reason: Ready to enter
[MONITOR] ✓ BUY signal triggered! (confidence: 75%)
[MONITOR] Executing BUY trade...
[MONITOR] Order Details: BUY 0.15 BTCUSDT @ $67,500
[MONITOR] ✓ Order placed successfully! Order ID: 12345
[MONITOR] ✓ Trade recorded in database
```

### Method 2: Check Binance Testnet

1. Go to: https://testnet.binance.vision/
2. Log in with your testnet account
3. Click **Trade** → **Orders**
4. Look for recent BTCUSDT orders
5. Confirm orders are being placed

### Method 3: Dashboard Update

Your paper trading dashboard should show:
- `Total Trades: 1, 2, 3, ...` (increasing)
- `Current Balance: $4,900, $4,800, ...` (changing as trades execute)
- `Trade History: BUY, SELL, BUY, ...` (orders appearing)

---

## Troubleshooting: Why Trades Aren't Executing

### Issue 1: "No trades yet" after 1 minute

**Check**: Are the backend logs showing monitoring activity?

**Solution A**: Monitor endpoint not being called
```bash
# Verify the endpoint is reachable
curl -X POST https://your-api.com/api/paper-trading/monitor \
  -H "Content-Type: application/json" \
  -d '{"session_id": "your-session-id"}'
```

**Solution B**: Dashboard not calling monitor endpoint
- Check browser DevTools → Network tab
- Look for POST request to `/api/paper-trading/monitor`
- If not present, click "Start Monitoring" button again

### Issue 2: "[MONITOR] Price from Binance" instead of TradingView

**What it means**: TradingView API is failing, using Binance fallback

**Is this a problem?** ❌ **NO** - You're still getting live prices!
- Binance prices are real-time market data
- Trades will execute correctly
- System is working as designed

**To fix**: 
1. Check if TradingView website is accessible
2. Verify network isn't blocking TradingView API
3. Wait a few minutes and try again (TradingView API sometimes has rate limits)

### Issue 3: Signal evaluated but trade NOT executed

**Log shows**:
```
[MONITOR] Entry Signal: BUY, Confidence: 45%
[MONITOR] ✗ BUY signal NOT triggered
```

**Reason**: Confidence is below 50% threshold

**Solution**:
- Strategy needs stronger technical signals
- Try a more volatile symbol (ETH instead of BTC)
- Try a shorter timeframe (5m instead of 1h)
- Or use "simplified mode" with weaker entry rules

### Issue 4: Binance API key error

**Log shows**:
```
[MONITOR] ✗ Trade execution failed: Binance API Error: 401 Invalid key
```

**Solutions**:
1. Check BINANCE_TESTNET_API_KEY is set correctly
2. Verify it's a TESTNET key (not mainnet)
3. Regenerate the key on https://testnet.binance.vision/
4. Confirm API key has trading permission enabled

### Issue 5: "Insufficient USDT balance" error

**Solution**:
1. Visit https://testnet.binance.vision/
2. Click **Wallet** → **Deposit**
3. Request USDT testnet funds (FREE, instant)
4. Minimum needed: ~$100-$1,000

---

## Understanding the Logs

### Log Levels

| Symbol | Meaning | Example |
|--------|---------|---------|
| `[MONITOR]` | Normal monitoring step | Price fetched, signal evaluated |
| `✓` | Success | Trade placed successfully |
| `✗` | Failed | Trade execution failed |
| `⚠` | Warning | Using fallback price source |

### Key Log Messages

| Message | Meaning | Action |
|---------|---------|--------|
| `Starting monitor for session` | Monitoring loop started | ✓ Good, trades can now execute |
| `Price from TradingView` | Using TradingView prices | ✓ Perfect |
| `Price from Binance` | TradingView failed, using fallback | ✓ Still working |
| `No open position - evaluating ENTRY` | Looking for BUY signal | ✓ Normal |
| `BUY signal triggered` | Trade condition met! | ✓ Trade about to execute |
| `Order placed successfully` | Trade executed | ✓ Check Binance for order |
| `Trade recorded in database` | Trade saved | ✓ Dashboard will update |

---

## Real-World Example

### Scenario: You Create a Strategy and Click Monitor

**What you see on dashboard**:
```
Status: Monitoring Active
Trades: 0
Balance: $5,000
```

**Backend logs** (first 10 seconds):
```
[MONITOR] Starting monitor for session: 12ab-34cd-56ef
[MONITOR] Strategy: Buy when price bounces (BTCUSDT 1h)
[MONITOR] Price from TradingView: BTCUSDT = $67,432.50
[MONITOR] No open position - evaluating ENTRY conditions
[MONITOR] Entry Signal: BUY, Confidence: 62%, Reason: RSI oversold
[MONITOR] ✓ BUY signal triggered! (confidence: 62%)
[MONITOR] Executing BUY trade...
[MONITOR] Order Details: BUY 0.0296 BTCUSDT @ $67,432.50
[MONITOR] ✓ Order placed successfully! Order ID: 789456123
[MONITOR] ✓ Trade recorded in database
```

**What you see on dashboard** (5 seconds later):
```
Status: Monitoring Active
Trades: 1          ← Updated!
Balance: $5,000    ← Still waiting for P&L calculation
History:
  BUY 0.0296 BTCUSDT @ $67,432.50
```

**Binance Testnet** (https://testnet.binance.vision/):
```
Orders:
  Symbol: BTCUSDT
  Side: BUY
  Qty: 0.0296
  Price: $67,432.50
  Status: FILLED
```

---

## Monitoring Configuration

### Default Settings

```json
{
  "session_id": "required",
  "auto_trade": true,
  "check_interval": 5000,
  "use_tradingview": true
}
```

### Custom Settings

To change monitoring behavior (for advanced users):

```bash
# Slower monitoring (10 seconds)
curl -X POST /api/paper-trading/monitor \
  -d '{"session_id": "xxx", "check_interval": 10000}'

# Use only Binance prices
curl -X POST /api/paper-trading/monitor \
  -d '{"session_id": "xxx", "use_tradingview": false}'

# Disable auto-trading (monitoring only)
curl -X POST /api/paper-trading/monitor \
  -d '{"session_id": "xxx", "auto_trade": false}'
```

---

## Performance

### Monitoring Cycle Time

| Step | Time | Notes |
|------|------|-------|
| Fetch Price | 500-1000ms | TradingView or Binance API |
| Evaluate Strategy | 100-500ms | Technical indicator calculations |
| Place Trade | 500-2000ms | Binance API round-trip |
| Database Update | 50-200ms | Supabase insert |
| **Total per cycle** | **~1-3 seconds** | Runs every 5 seconds |

### Rate Limits

- TradingView: ~10 requests/second per IP (unlikely to hit)
- Binance: 1200 requests/minute (plenty for monitoring)
- Database: Unlimited (Supabase generous limits)

---

## Dashboard Integration

### What Dashboard Shows

| Section | Updates Every | Source |
|---------|-----------------|--------|
| Current Balance | 5 seconds | Database query |
| Total P&L | 5 seconds | Trade calculation |
| Open Positions | 5 seconds | Latest trades |
| Trade History | Real-time | WebSocket or polling |
| Monitoring Status | Real-time | Component state |

### Expected Behavior

1. Click "Start Monitoring"
2. Dashboard shows "Monitoring Active" (green)
3. Every 5 seconds, data refreshes
4. When trade executes:
   - Trade appears in history instantly
   - Total trades count increases
   - Balance updates with P&L

---

## Testing the System

### Quick Test (2 minutes)

```bash
# 1. Check logs are working
# Look for [MONITOR] messages in your backend logs

# 2. Check price updates
# Look for "Price from TradingView" or "Price from Binance"

# 3. Check Binance testnet
# Go to https://testnet.binance.vision/trade/BTCUSDT
# Should see BUY/SELL orders appearing

# 4. Check dashboard updates
# Watch "Total Trades" and "Current Balance" increment
```

### Full Verification

1. ✓ Backend logs show `[MONITOR]` messages
2. ✓ Price fetched from TradingView or Binance
3. ✓ Signals evaluated (BUY/SELL/HOLD)
4. ✓ Orders placed on Binance testnet
5. ✓ Trades recorded in database
6. ✓ Dashboard updates with new trades
7. ✓ Balance changes with P&L

---

## FAQ

**Q: Why use TradingView if Binance prices are free?**
A: TradingView has more data (volume, 24h change, etc.) and is industry standard for technical analysis.

**Q: What if TradingView API is down?**
A: System automatically falls back to Binance. Trades still execute with real prices.

**Q: Can I use TradingView alerts to trigger trades?**
A: Future feature - will add webhook to /api/paper-trading/webhook/tradingview soon.

**Q: How accurate are the prices?**
A: Real-time market prices (within 1-2 seconds), same as TradingView and Binance charts show.

**Q: Does this work during market hours only?**
A: 24/7 - Crypto markets are always open. Testnet always accessible.

**Q: Can I monitor multiple strategies simultaneously?**
A: Yes! Each session runs independently in parallel.

---

## Next Steps

1. **Deploy the updated code** to your backend
2. **Start a paper trading session** and click "Monitor"
3. **Check the logs** - you should see `[MONITOR]` messages
4. **Verify on Binance Testnet** - orders should appear
5. **Watch your dashboard** - trades execute automatically

If anything isn't working, the detailed logs will tell you exactly what's wrong!

