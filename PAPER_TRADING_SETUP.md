# Paper Trading Integration Guide

## Overview

The paper trading system allows you to test trading strategies using real Binance market data on the testnet (demo account) without risking real capital.

## Architecture

### Components

1. **Frontend**: Dashboard for monitoring paper trading sessions
2. **Backend API**: Next.js API routes for managing sessions and executing trades
3. **Binance Testnet**: Real-time order execution on Binance's demo environment
4. **Price Cache Service**: Real-time price fetching from Binance with intelligent caching

## Fixed Issues (Latest)

### CORS Configuration ✅

**Problem**: Frontend could not fetch from backend API due to CORS policy errors.

**Solution**: 
- Added CORS preflight (OPTIONS) request handling to the `asyncHandler` wrapper
- Configured CORS to allow:
  - Railway preview deployments (`*.up.railway.app`)
  - Vercel deployments (`*.vercel.app`)
  - Whitelisted production domains
  - All localhost ports for development

**Files Modified**:
- `backend/src/lib/utils.ts`: Added OPTIONS request handling and flexible origin checking

## Setup Requirements

### 1. Environment Variables

Set these in your deployment platform (Railway, Vercel, or `.env.local`):

```env
# Backend
BINANCE_TESTNET_API_KEY=your_testnet_api_key
BINANCE_TESTNET_API_SECRET=your_testnet_api_secret

# Frontend
NEXT_PUBLIC_API_URL=https://your-backend-api.railway.app
NEXT_PUBLIC_SITE_URL=https://your-frontend.railway.app
```

### 2. Binance Testnet Account Setup

1. Go to https://testnet.binance.vision/
2. Log in (or create an account)
3. Generate API Key and Secret
4. **Important**: Save the credentials in your environment variables as:
   - `BINANCE_TESTNET_API_KEY`
   - `BINANCE_TESTNET_API_SECRET`

### 3. Frontend Configuration

The frontend uses `NEXT_PUBLIC_API_URL` to determine the backend API location:

```typescript
// In frontend components:
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
```

**Important**: In production, ensure this points to your actual backend domain, NOT the frontend domain.

## API Endpoints

### Start Paper Trading Session
```
POST /api/paper-trading/start
Body:
{
  "strategy_id": "string",
  "initial_balance": 10000,
  "use_testnet": true
}
```

### Get Session Status & P&L
```
GET /api/paper-trading/:session_id/status
```

### Execute Trading Signal
```
POST /api/paper-trading/execute-signal
Body:
{
  "session_id": "string",
  "signal": "BUY" | "SELL",
  "symbol": "BTCUSDT",
  "reason": "optional reason"
}
```

### Auto-Monitor & Execute
```
POST /api/paper-trading/monitor
Body:
{
  "session_id": "string",
  "auto_trade": true
}
```

### Get Real-Time Prices
```
GET /api/market/prices?symbols=BTCUSDT,ETHUSDT,BNBUSDT
```

## How It Works

### Flow

1. **Create Strategy** → Strategy is saved to database
2. **Start Paper Trading** → Creates a trading session with initial capital
3. **Monitor Session** → Real-time price monitoring with auto-execution
4. **Execute Trades** → Place actual orders on Binance testnet
5. **Track P&L** → Dashboard shows all trades and current balance

### Real-Time Price Flow

```
Frontend Dashboard
        ↓
fetchStats() every 5 seconds
        ↓
GET /api/paper-trading/:session_id/status
        ↓
Backend fetches latest prices from Binance
        ↓
Price Cache (3-second interval, respects rate limits)
        ↓
Returns all trades, positions, and P&L
```

### Order Execution Flow

```
Strategy Signal Triggered
        ↓
execute-signal API called
        ↓
Get current price from Binance
        ↓
Calculate position size (2% risk default)
        ↓
Place MARKET order on Binance testnet
        ↓
Log trade in database
        ↓
Update session P&L
        ↓
Dashboard refreshes automatically
```

## Testing Checklist

- [ ] Backend API is deployed and accessible
- [ ] `NEXT_PUBLIC_API_URL` is correctly set in frontend
- [ ] Binance testnet credentials are valid
- [ ] CORS errors are resolved (fixed in latest commit)
- [ ] Can create a strategy
- [ ] Can start a paper trading session
- [ ] Can see session status on dashboard
- [ ] Can execute BUY/SELL signals
- [ ] Orders appear on Binance testnet account
- [ ] P&L is calculated correctly
- [ ] Dashboard updates in real-time

## Troubleshooting

### "CORS policy" Errors
**Solution**: Check that:
- Backend is returning proper CORS headers
- `NEXT_PUBLIC_API_URL` points to backend, not frontend
- Your deployment domain is in the allowed origins list

### "Trading session not found"
**Solution**: 
- Ensure session_id is valid and from the same backend
- Verify database connection is working

### "Insufficient USDT balance"
**Solution**:
- Binance testnet accounts need initial funds
- Visit https://testnet.binance.vision/ and request testnet funds
- This is FREE

### "Invalid order quantity"
**Solution**:
- Quantity might be too small after rounding
- Binance has minimum order amounts (usually ~$5-10 USDT)
- Try with a larger initial capital

## Development

### Local Testing

```bash
# Terminal 1: Backend
cd backend
npm run dev  # Runs on http://localhost:3001

# Terminal 2: Frontend
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev  # Runs on http://localhost:3000
```

### Production Deployment

```bash
# Ensure environment variables are set correctly
NEXT_PUBLIC_API_URL=https://your-backend-api-domain
BINANCE_TESTNET_API_KEY=xxx
BINANCE_TESTNET_API_SECRET=yyy
```

## Security Notes

⚠️ **Important**: Never use mainnet API keys in code. The system is hardcoded to use testnet, but:

1. Keep testnet credentials secret
2. Don't share `.env` files
3. Rotate API keys regularly
4. Use IP whitelist on Binance if possible

## Future Enhancements

- [ ] TradingView webhook integration for automated signals
- [ ] Historical backtest comparison
- [ ] Risk metrics dashboard
- [ ] Multiple concurrent sessions
- [ ] Export trades to CSV
- [ ] Email alerts for major P&L changes

## Related Files

- Backend API: `backend/src/pages/api/paper-trading/`
- Frontend Dashboard: `frontend/src/pages/paper-trading/`
- Binance Integration: `backend/src/lib/binance-trading.ts`
- Price Service: `backend/src/lib/price-cache.ts`
- CORS Config: `backend/src/lib/utils.ts`
