# TradingView MCP Local Setup Guide

## Current Status

✅ **What Works:**
- Paper trading sessions create successfully
- Monitoring is active and running
- Binance testnet price fetching works
- Trade execution is functional
- All endpoints are deployed on Railway

❌ **What Doesn't Work (Yet):**
- MCP can't add indicators to TradingView automatically
- Real-time prices from TradingView charts aren't fetching
- Strategy signals can't be generated from chart indicators

## The Problem

TradingView is running on your **local Mac** on port 9222.
Backend is deployed on **Railway in the cloud**.
Cloud backend **cannot reach localhost:9222** on your machine.

This is a network isolation issue - not a code problem.

## The Solution: Run Backend Locally

To enable the MCP to work, you need the backend running on the **same machine as TradingView**.

### Step 1: Stop All Existing Processes

```bash
# Kill any npm processes
killall node
# Or use: lsof -ti:3000,3001 | xargs kill -9
```

### Step 2: Start Backend Locally

**Terminal 1 - Backend:**
```bash
cd ~/Documents/bitiqlab-v2/backend
npm run dev
# Should start on http://localhost:3000
```

### Step 3: Start Frontend Locally

**Terminal 2 - Frontend:**
```bash
cd ~/Documents/bitiqlab-v2/frontend
npm run dev -- -p 3001
# Should start on http://localhost:3001
```

### Step 4: Configure Frontend Environment

```bash
cat > ~/Documents/bitiqlab-v2/frontend/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
```

### Step 5: Ensure TradingView is Running

**Terminal 3 - TradingView:**
```bash
/Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222
```

### Step 6: Use the App

1. Go to `http://localhost:3001`
2. Create a strategy
3. Start paper trading
4. When you see "Monitoring Active", the backend is connecting to TradingView via MCP
5. Indicators will automatically be added to your TradingView chart
6. Trades will execute automatically when signals trigger

## How It Works (Locally)

```
Your Mac (Local Machine)
├─ TradingView Desktop
│  └─ CDP on port 9222
│
├─ Backend (http://localhost:3000)
│  ├─ Connects to TradingView via MCP
│  ├─ Reads prices and indicators
│  └─ Executes trades on Binance testnet
│
└─ Frontend (http://localhost:3001)
   └─ Communicates with localhost:3000 backend
```

## What Happens When You Register with TradingView

1. Click "Register with TradingView" in paper trading dashboard
2. Backend:
   - ✅ Connects to TradingView via Chrome DevTools Protocol
   - ✅ Automatically adds RSI (Period 14)
   - ✅ Automatically adds MACD (12, 26, 9)
   - ✅ Automatically adds Bollinger Bands (20, 2)
   - ✅ Automatically adds Moving Averages (SMA 20, SMA 50)
3. Every 5 seconds:
   - Fetches current price from your chart
   - Reads indicator values
   - Evaluates strategy rules
   - Executes trades automatically if conditions match
4. Dashboard updates in real-time with:
   - Trade history
   - P&L
   - Win rate
   - Current balance

## Troubleshooting

### Backend can't connect to TradingView
**Error:** `[TradingView MCP] Price fetch failed`

**Fix:**
1. Make sure TradingView is running with `--remote-debugging-port=9222`
2. Verify: `ps aux | grep remote-debugging-port` should show the flag
3. Restart TradingView if needed

### Frontend can't reach backend
**Error:** Network errors, failed to fetch

**Fix:**
1. Verify backend is running on port 3000: `lsof -i :3000`
2. Check `.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3000`
3. Restart frontend dev server

### Port already in use
**Error:** `EADDRINUSE: address already in use :::3001`

**Fix:**
```bash
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

## Key Endpoints

- **Backend:** http://localhost:3000
- **Frontend:** http://localhost:3001
- **TradingView CDP:** http://localhost:9222
- **Binance Testnet API:** https://testnet.binance.vision

## Performance

When running locally, expect:
- MCP connection: ~1-2 seconds
- Price fetch: 100-500ms
- Indicator fetch: 200-800ms
- Signal evaluation: 50-200ms
- Trade execution: 500-2000ms
- **Total cycle:** ~1-3 seconds per check (every 5 seconds)

## Next: Deploy to Production

Once testing works locally, you can:
1. Deploy backend with proper networking setup
2. Use SSH tunneling to reach local TradingView from cloud
3. Or run backend on a local server that stays online

For now, **local development is the fastest path to getting MCP working**.

## Questions?

Check the individual setup guides:
- `TRADINGVIEW_MCP_INTEGRATION.md` - MCP architecture
- `TRADINGVIEW_LIVE_EXECUTION.md` - Live trading execution guide
- `MONITORING_AND_TRADINGVIEW_GUIDE.md` - Monitoring details
