# TradingView MCP + Binance Integration - Railway Deployment

## Architecture
```
┌─────────────────────────────────────┐
│   User Dashboard (Vercel)           │
│   - Create Strategy                 │
│   - Start Paper Trading             │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│   Backend API (Railway)              │
│   - /api/paper-trading/start        │
│   - /api/paper-trading/execute      │
└────────────┬────────────────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
┌──────────────┐ ┌────────────────────┐
│  Binance     │ │ TradingView MCP    │
│  Testnet     │ │ (Railway Service)  │
│  Execute     │ │ Auto-deploy        │
│  Trades      │ │ Strategies         │
└──────────────┘ └────────────────────┘
```

## Step 1: Deploy to Railway

### Option A: Using Railway UI (Recommended)

1. **Go to Railway Dashboard**: https://railway.app
2. **Create New Service**:
   - Click "New" → "Service"
   - Select "GitHub Repo"
   - Choose `bitiqlab-v2` repository
   
3. **Deploy Backend API**:
   - **Name**: `bitiqlab-backend`
   - **Dockerfile**: `backend.Dockerfile`
   - **Root Directory**: `/`
   - **Port**: 3001
   - **Environment Variables**:
     ```
     SUPABASE_URL=https://hcfbxpccsnksulgxgblw.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=<your-key>
     ANTHROPIC_API_KEY=sk-ant-<your-key>
     BINANCE_TESTNET_API_KEY=<your-key>
     BINANCE_TESTNET_API_SECRET=<your-secret>
     TRADINGVIEW_MCP_URL=http://tradingview-mcp:3000
     NEXT_PUBLIC_API_URL=https://bitiqlab-backend-production.up.railway.app
     ```

4. **Deploy TradingView MCP Service**:
   - **Name**: `tradingview-mcp`
   - **Dockerfile**: `Dockerfile.mcp`
   - **Root Directory**: `/`
   - **Port**: 3000
   - **Environment Variables**:
     ```
     ANTHROPIC_API_KEY=sk-ant-<your-key>
     NODE_ENV=production
     ```

### Option B: Using `railway.toml` (Infrastructure as Code)

Railway automatically detects `railway.toml` and deploys both services:

```bash
# Just push to main and Railway deploys both automatically
git push origin main
```

---

## Step 2: Verify Deployment

**Check Backend Health**:
```bash
curl https://bitiqlab-backend-production.up.railway.app/api/health
```

**Check MCP Server Health**:
```bash
curl https://tradingview-mcp-production.up.railway.app/health
```

Both should return `{"status":"ok"}`.

---

## Step 3: Complete Workflow

### User Flow:

```
1. User goes to https://labbitiq.vercel.app
2. Creates strategy:
   {
     "name": "RSI Strategy",
     "symbol": "BTCUSDT",
     "entry_rules": {"conditions": "RSI<30"},
     "exit_rules": {"stop_loss_percent": -2}
   }

3. Clicks "Paper Trading" button
   ↓
   Backend automatically:
   - Creates trading session
   - Calls TradingView MCP to deploy strategy
   - MCP generates Pine Script
   - MCP deploys to TradingView automatically
   - Starts monitoring for signals
   
4. TradingView generates signal (RSI < 30)
   ↓
   Signal sent to: /api/paper-trading/tradingview-webhook
   ↓
   Backend executes on Binance testnet
   ↓
   Trade logged in database
   ↓
   Dashboard updates with P&L
```

---

## Step 4: Test End-to-End

```bash
# 1. Create strategy
STRATEGY_ID=$(curl -X POST https://bitiqlab-backend-production.up.railway.app/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test Strategy",
    "symbol":"BTCUSDT",
    "entry_rules":{"conditions":"RSI<30"},
    "exit_rules":{"stop_loss_percent":-2},
    "created_by":"test"
  }' | jq -r '.data.id')

# 2. Start paper trading (automatically deploys to TradingView)
SESSION_DATA=$(curl -X POST https://bitiqlab-backend-production.up.railway.app/api/paper-trading/start \
  -H "Content-Type: application/json" \
  -d '{"strategy_id":"'$STRATEGY_ID'","initial_balance":10000}')

SESSION_ID=$(echo $SESSION_DATA | jq -r '.data.session_id')
TRADINGVIEW_STATUS=$(echo $SESSION_DATA | jq -r '.data.tradingview_status')

echo "Session: $SESSION_ID"
echo "TradingView Status: $TRADINGVIEW_STATUS"

# 3. Simulate TradingView signal
curl -X POST https://bitiqlab-backend-production.up.railway.app/api/paper-trading/tradingview-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "session_id":"'$SESSION_ID'",
    "signal":"BUY",
    "symbol":"BTCUSDT",
    "reason":"RSI<30 detected"
  }'
```

---

## Troubleshooting

### MCP Server Not Connecting
**Error**: `"tradingview_status":"pending"`

**Solution**:
1. Check MCP health: `curl https://tradingview-mcp-production.up.railway.app/health`
2. Check Railway logs for MCP service
3. Verify `TRADINGVIEW_MCP_URL` env var is correct

### Binance Testnet Errors
**Error**: `"Insufficient USDT balance"`

**Solution**:
1. Go to https://testnet.binance.vision
2. Request test USDT from faucet
3. Verify API keys are correct

### Strategy Not Deploying to TradingView
**Check**:
1. MCP server is healthy
2. Strategy rules are valid JSON
3. Check Railway logs: `railway logs tradingview-mcp`

---

## Environment Variables Reference

| Variable | Value | Service |
|----------|-------|---------|
| `SUPABASE_URL` | Your Supabase URL | Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase key | Backend |
| `ANTHROPIC_API_KEY` | Claude API key | Both |
| `BINANCE_TESTNET_API_KEY` | Binance testnet key | Backend |
| `BINANCE_TESTNET_API_SECRET` | Binance testnet secret | Backend |
| `TRADINGVIEW_MCP_URL` | `http://tradingview-mcp:3000` | Backend |
| `NEXT_PUBLIC_API_URL` | Backend URL | Backend |

---

## Next Steps

1. ✅ Deploy both services to Railway
2. ✅ Verify health checks pass
3. ✅ Test end-to-end workflow
4. ⏳ (Optional) Set up Claude auto-improvement loop
5. ⏳ (Optional) Add promotion/drop decision logic

---

**Your complete MCP integration is ready!** 🚀
