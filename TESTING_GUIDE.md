# BitiqLab Monitoring & Execution Testing Guide

This guide shows how to test the complete monitoring, execution, and logging pipeline for the RSI+MACD momentum strategy.

## Prerequisites

- ✅ Binance Testnet API keys configured on Railway
- ✅ Backend running (`npm run dev` in `backend/` directory)
- ✅ Database migrations applied (Supabase)

## Phase 1: Deploy Strategy

### 1.1 Deploy RSI+MACD Strategy

```bash
curl -X POST http://localhost:3000/api/strategies/deploy-rsi-macd \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bitiq RSI+MACD Momentum",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "market_type": "spot"
  }'
```

**Response:**
```json
{
  "status": "success",
  "strategy_id": "abc123...",
  "name": "Bitiq RSI+MACD Momentum",
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "message": "Strategy created and deployment started"
}
```

**Save the `strategy_id` for next steps.**

---

## Phase 2: Create Trading Session

### 2.1 Start a Paper Trading Session

```bash
curl -X POST http://localhost:3000/api/paper-trading/start \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "abc123...",
    "initial_balance": 1000,
    "risk_per_trade": 2
  }'
```

**Response:**
```json
{
  "status": "success",
  "session_id": "session-xyz...",
  "initial_balance": 1000,
  "current_balance": 1000,
  "message": "Paper trading session started"
}
```

**Save the `session_id` for monitoring.**

---

## Phase 3: Start Continuous Monitoring

### 3.1 Start Monitoring on 10 Coins

```bash
curl -X POST http://localhost:3000/api/paper-trading/start-monitoring \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "session-xyz...",
    "strategy_id": "abc123...",
    "coins": [
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
      "BNBUSDT",
      "XRPUSDT",
      "ADAUSDT",
      "AVAXUSDT",
      "LINKUSDT",
      "MATICUSDT",
      "DOTUSDT"
    ],
    "timeframe": "1h",
    "auto_trade": true,
    "poll_interval_ms": 5000
  }'
```

**Response:**
```json
{
  "status": "success",
  "job_id": "1715008800000-a1b2c3d4e",
  "message": "Monitoring started for 10 coins",
  "coins_monitored": ["BTCUSDT", "ETHUSDT", ...]
}
```

**Save the `job_id` to check status.**

---

## Phase 4: Monitor Live Results

### 4.1 Check Monitoring Status (Without Results)

```bash
curl http://localhost:3000/api/paper-trading/monitoring-status?job_id=1715008800000-a1b2c3d4e
```

**Response:**
```json
{
  "status": "running",
  "job_id": "1715008800000-a1b2c3d4e",
  "session_id": "session-xyz...",
  "coins_monitored": ["BTCUSDT", "ETHUSDT", ...],
  "last_prices": {
    "BTCUSDT": 62450.00,
    "ETHUSDT": 3150.75,
    ...
  },
  "last_evaluation": "2026-05-06T14:23:45.123Z",
  "signals_generated": 2,
  "trades_executed": 1
}
```

### 4.2 Check Status with Results

```bash
curl http://localhost:3000/api/paper-trading/monitoring-status?job_id=1715008800000-a1b2c3d4e&include_results=true
```

**Response includes `results` array with last 100 monitoring results:**
```json
{
  "status": "running",
  "job_id": "1715008800000-a1b2c3d4e",
  ...
  "results": [
    {
      "symbol": "BTCUSDT",
      "timestamp": "2026-05-06T14:23:45.123Z",
      "price": 62450.00,
      "signal": {
        "signal": "BUY",
        "confidence": 65,
        "reason": "RSI oversold (<30); MACD bullish crossover"
      },
      "trade_executed": true
    },
    ...
  ]
}
```

### 4.3 List All Active Monitoring Jobs

```bash
curl http://localhost:3000/api/paper-trading/monitoring-status
```

**Response:**
```json
{
  "status": "success",
  "active_jobs": 1,
  "jobs": [
    {
      "job_id": "1715008800000-a1b2c3d4e",
      "status": "running",
      "session_id": "session-xyz...",
      "coins_monitored": 10,
      ...
    }
  ]
}
```

---

## Phase 5: Query Trade Logs

### 5.1 List All Trades in Session

(These endpoints will be created in Days 7-9)

```bash
curl http://localhost:3000/api/paper-trading/session-xyz/trades
```

### 5.2 Get Session Statistics

```bash
curl http://localhost:3000/api/paper-trading/session-xyz/statistics
```

---

## Phase 6: Stop Monitoring

### 6.1 Stop a Monitoring Job

```bash
curl -X POST http://localhost:3000/api/paper-trading/stop-monitoring \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "1715008800000-a1b2c3d4e"
  }'
```

**Response:**
```json
{
  "status": "success",
  "message": "Monitoring job stopped: 1715008800000-a1b2c3d4e",
  "job_id": "1715008800000-a1b2c3d4e"
}
```

---

## Testing Checklist

- [ ] Deploy RSI+MACD strategy
- [ ] Create trading session
- [ ] Start monitoring on 10 coins
- [ ] Verify prices are updating every 5 seconds
- [ ] Check that signals are being generated
- [ ] Verify trades are being executed (if auto_trade=true)
- [ ] Check monitoring status multiple times
- [ ] Stop monitoring job
- [ ] Query trade logs (after Days 7-9)
- [ ] Verify P&L calculations are correct

---

## Understanding the Monitoring Flow

```
Start Monitoring (POST /start-monitoring)
  ↓
Every 5 seconds:
  1. Fetch live prices from Binance (via PriceCache)
  2. For each coin:
     a) Check if position is open
     b) If no position: Evaluate ENTRY (RSI < 30 + MACD bullish)
     c) If position open: Evaluate EXIT (stop loss or take profit)
     d) If signal + auto_trade: Execute market order
     e) Log result to database
  3. Update job status
  ↓
Query Status (GET /monitoring-status)
  ↓
Stop Monitoring (POST /stop-monitoring)
```

---

## Troubleshooting

### No trades executing
- Check that `auto_trade: true` in start-monitoring request
- Verify signal confidence > 50%
- Check Binance testnet has sufficient balance
- Verify API keys are configured correctly

### Prices not updating
- Check that prices are being returned from PriceCache
- Verify network connectivity to Binance
- Check rate limiting (PriceCache has 3-second minimum interval)

### Monitoring job stops
- Check backend logs for errors
- Verify database connection is stable
- Check for exceptions in StrategyEvaluator

---

## Performance Notes

- Each monitoring job creates a background interval polling every 5 seconds
- 10 coins = ~10 Binance API calls per cycle (1 per coin for price)
- Indicator calculation is cached for 60 seconds per symbol/timeframe
- Results are stored in memory (last 100 per job)
- For production: implement persistent storage of monitoring history

---

## Next Steps (Days 7-9)

After confirming trades are executing, build:
- Trade listing endpoints
- Statistics aggregation
- Backtest vs. paper comparison
- Dashboard UI components
