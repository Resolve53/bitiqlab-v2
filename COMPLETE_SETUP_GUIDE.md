# Complete BitiqLab Setup & Usage Guide
## Days 1-9: Foundation, Strategy, Execution, Logging & Analysis

---

## 📋 What You Now Have

A complete **monitoring, execution, logging, and analysis pipeline** for automated cryptocurrency trading strategies.

### **Phase 1: Foundation (Days 1-3)** ✅
- Continuous coin monitoring with 5-second polling
- Real-time price fetching and indicator calculation
- Background monitoring jobs with status tracking

### **Phase 2: Strategy & Execution (Days 4-6)** ✅
- RSI+MACD Pine Script strategy
- Automatic market order execution on Binance Testnet
- Three execution paths: TradingView webhook, direct API, auto-monitor

### **Phase 3: Logging & Analysis (Days 7-9)** ✅
- Comprehensive trade logging with all metrics
- Trade listing with filtering & sorting
- Aggregated statistics dashboard
- Backtest vs paper trading comparison
- React UI components for dashboard

---

## 🚀 Quick Start (5-Minute Setup)

### Step 1: Deploy Strategy
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

**Save: `strategy_id`** from response

### Step 2: Create Trading Session
```bash
curl -X POST http://localhost:3000/api/paper-trading/start \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "YOUR_STRATEGY_ID",
    "initial_balance": 1000,
    "risk_per_trade": 2
  }'
```

**Save: `session_id`** from response

### Step 3: Start Monitoring
```bash
curl -X POST http://localhost:3000/api/paper-trading/start-monitoring \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "YOUR_SESSION_ID",
    "strategy_id": "YOUR_STRATEGY_ID",
    "coins": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"],
    "timeframe": "1h",
    "auto_trade": true,
    "poll_interval_ms": 5000
  }'
```

**Save: `job_id`** from response

---

## 📊 Complete API Reference

### Monitoring APIs

#### Start Monitoring
```
POST /api/paper-trading/start-monitoring
```
**Body:**
```json
{
  "session_id": "string",
  "strategy_id": "string",
  "coins": ["BTCUSDT", "ETHUSDT"],
  "timeframe": "1h",
  "auto_trade": true,
  "poll_interval_ms": 5000
}
```

#### Check Monitoring Status
```
GET /api/paper-trading/monitoring-status?job_id=xxx&include_results=true
```

#### Stop Monitoring
```
POST /api/paper-trading/stop-monitoring
```
**Body:**
```json
{
  "job_id": "string"
}
```

---

### Trade Analysis APIs

#### List All Trades
```
GET /api/paper-trading/[session_id]/trades?symbol=BTCUSDT&sort_by=pnl&sort_order=desc&limit=100
```

**Query Parameters:**
- `symbol` - Filter by symbol
- `side` - Filter by "BUY" or "SELL"
- `start_date` - ISO8601 date
- `end_date` - ISO8601 date
- `profitable_only` - Boolean
- `loss_only` - Boolean
- `sort_by` - "entry_time" | "pnl" | "duration"
- `sort_order` - "asc" | "desc"

**Response:**
```json
{
  "status": "success",
  "session_id": "string",
  "trades": [
    {
      "id": "string",
      "symbol": "BTCUSDT",
      "side": "BUY",
      "entry_price": 62450.00,
      "exit_price": 63522.50,
      "entry_time": "2026-05-06T14:00:00Z",
      "exit_time": "2026-05-06T16:30:00Z",
      "pnl_percent": 1.72,
      "pnl_absolute": 17.25,
      "quantity": 0.01,
      "duration_minutes": 150
    }
  ],
  "total_count": 5,
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 5
  }
}
```

#### Get Single Trade Details
```
GET /api/paper-trading/[session_id]/trades/[trade_id]
```

**Response:**
```json
{
  "status": "success",
  "trade": {
    "id": "string",
    "symbol": "BTCUSDT",
    "entry_price": 62450.00,
    "exit_price": 63522.50,
    "pnl_percent": 1.72,
    "max_favorable_excursion": 2150.00,
    "max_adverse_excursion": -500.00,
    "duration_minutes": 150,
    "analysis": {
      "win_or_loss": "Win",
      "efficiency": 4.3,
      "risk_reward_achieved": 4.3,
      "price_action_summary": "Price moved up $2150 from entry before dropping to exit"
    }
  }
}
```

#### Get Session Statistics
```
GET /api/paper-trading/[session_id]/statistics
```

**Response includes:**
- `total_trades`, `winning_trades`, `losing_trades`
- `win_rate`, `total_pnl`, `total_pnl_percent`
- `profit_factor`, `sharpe_ratio`, `max_drawdown`
- `avg_duration_minutes`, `avg_mfe`, `avg_mae`
- `by_symbol` - Breakdown by symbol

#### Compare Backtest vs Paper Trading
```
GET /api/analysis/backtest-vs-paper?strategy_id=xxx&session_id=yyy
```

**Response:**
```json
{
  "status": "success",
  "comparison": {
    "backtest": {
      "total_trades": 50,
      "win_rate": 58.0,
      "sharpe_ratio": 1.4,
      "total_return": 12.5,
      "max_drawdown": 3.2,
      "profit_factor": 2.1
    },
    "paper_trading": {
      "total_trades": 5,
      "win_rate": 60.0,
      "sharpe_ratio": 1.6,
      "total_return": 8.5,
      "max_drawdown": 2.1,
      "profit_factor": 3.0
    },
    "divergence": {
      "win_rate_diff": 2.0,
      "sharpe_diff": 0.2,
      "return_diff": -4.0,
      "max_drawdown_diff": -1.1,
      "summary": "Paper trading performance aligns well with backtest"
    }
  }
}
```

---

## 🎨 UI Components

### TradeLog Component
```tsx
import { TradeLog } from '@/components/TradeLog';

<TradeLog sessionId="your_session_id" />
```

**Features:**
- Filter by symbol, side, profitability
- Sort by entry time, P&L, duration
- Color-coded win/loss trades
- Pagination (100 trades per page)
- Responsive table

### PerformanceMetrics Component
```tsx
import { PerformanceMetrics } from '@/components/PerformanceMetrics';

<PerformanceMetrics sessionId="your_session_id" />
```

**Features:**
- Overall health score (0-100)
- Win rate and profit factor
- Sharpe ratio and max drawdown
- Trade duration analysis
- MFE/MAE efficiency metrics
- By-symbol breakdown

### BacktestComparison Component
```tsx
import { BacktestComparison } from '@/components/BacktestComparison';

<BacktestComparison strategyId="your_strategy_id" sessionId="your_session_id" />
```

**Features:**
- Side-by-side metric comparison
- Divergence analysis with interpretation
- Performance status (aligned/warning)
- Detailed metric differences

---

## 📈 Complete Workflow Example

### Full End-to-End Test

```bash
# 1. Deploy strategy
STRATEGY_RESPONSE=$(curl -s -X POST http://localhost:3000/api/strategies/deploy-rsi-macd \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","timeframe":"1h"}')

STRATEGY_ID=$(echo $STRATEGY_RESPONSE | jq -r '.strategy_id')
echo "Strategy ID: $STRATEGY_ID"

# 2. Create session
SESSION_RESPONSE=$(curl -s -X POST http://localhost:3000/api/paper-trading/start \
  -H "Content-Type: application/json" \
  -d "{\"strategy_id\":\"$STRATEGY_ID\",\"initial_balance\":1000}")

SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.session_id')
echo "Session ID: $SESSION_ID"

# 3. Start monitoring (5 coins)
MONITOR_RESPONSE=$(curl -s -X POST http://localhost:3000/api/paper-trading/start-monitoring \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\":\"$SESSION_ID\",
    \"strategy_id\":\"$STRATEGY_ID\",
    \"coins\":[\"BTCUSDT\",\"ETHUSDT\",\"SOLUSDT\",\"BNBUSDT\",\"XRPUSDT\"],
    \"auto_trade\":true
  }")

JOB_ID=$(echo $MONITOR_RESPONSE | jq -r '.job_id')
echo "Job ID: $JOB_ID"

# 4. Wait 30 seconds for some trades
sleep 30

# 5. Check monitoring status
curl -s http://localhost:3000/api/paper-trading/monitoring-status?job_id=$JOB_ID | jq '.'

# 6. Get all trades
curl -s http://localhost:3000/api/paper-trading/$SESSION_ID/trades | jq '.trades'

# 7. Get statistics
curl -s http://localhost:3000/api/paper-trading/$SESSION_ID/statistics | jq '.statistics'

# 8. Compare with backtest
curl -s "http://localhost:3000/api/analysis/backtest-vs-paper?strategy_id=$STRATEGY_ID&session_id=$SESSION_ID" | jq '.comparison'

# 9. Stop monitoring
curl -s -X POST http://localhost:3000/api/paper-trading/stop-monitoring \
  -H "Content-Type: application/json" \
  -d "{\"job_id\":\"$JOB_ID\"}"
```

---

## 🧠 How It All Works Together

```
┌─────────────────────────────────────────────────────────────┐
│                 COMPLETE SYSTEM ARCHITECTURE                 │
└─────────────────────────────────────────────────────────────┘

USER INITIATES
    ↓
Deploy Strategy (API)
    ├─ Creates strategy in database
    ├─ Stores entry/exit rules
    ↓
Create Trading Session (API)
    ├─ Sets initial balance
    ├─ Links to strategy
    ↓
START MONITORING ──────────────────────────┐
    ↓                                      │
CoinMonitor Job (Background)              │
    ├─ Every 5 seconds:                   │
    │  ├─ Fetch live prices (Binance)    │
    │  ├─ Calculate indicators           │
    │  ├─ Evaluate RSI+MACD conditions   │
    │  ├─ If signal: Execute trade       │
    │  └─ Log to database                │
    ↓                                      │
DATABASE RECORDS ALL                       │
    ├─ trades (entry/exit/P&L)           │
    ├─ paper_trading_sessions (state)    │
    ├─ paper_trading_signals (signals)   │
    ↓                                      │
USER QUERIES ◄─────────────────────────────┘
    ├─ /trades - All trades with filtering
    ├─ /statistics - Aggregated metrics
    ├─ /backtest-vs-paper - Comparison
    ↓
REACT DASHBOARD
    ├─ TradeLog component (filters, sorts)
    ├─ PerformanceMetrics component (health score)
    ├─ BacktestComparison component
    ↓
ANALYSIS & INSIGHTS
    └─ Win rate, Sharpe ratio, P&L analysis
```

---

## 📊 Key Metrics Explained

### Win Rate
- Percentage of profitable trades
- Formula: (Winning Trades / Total Trades) × 100
- Good: > 50%

### Sharpe Ratio
- Risk-adjusted return measurement
- Higher = better returns per unit of risk
- Good: > 1.0

### Profit Factor
- Ratio of wins to losses
- Formula: Total Wins / Total Losses
- Good: > 1.5

### Max Drawdown
- Largest peak-to-trough decline
- Measures downside risk
- Good: < 20%

### Expectancy
- Average profit per trade
- Formula: Total P&L / Total Trades
- Good: > 0

### MFE / MAE
- **MFE**: Max Favorable Excursion (best price after entry)
- **MAE**: Max Adverse Excursion (worst price after entry)
- Efficiency = MFE / MAE (higher = better)

---

## ✅ Verification Checklist

- [ ] Monitoring is polling every 5 seconds
- [ ] Prices are updating in real-time
- [ ] Trades are executing when conditions met
- [ ] All trades logged to database
- [ ] Statistics calculate correctly
- [ ] Backtest comparison shows results
- [ ] UI components display without errors
- [ ] Trade filtering works as expected
- [ ] P&L calculations are accurate

---

## 🔧 Troubleshooting

### Monitoring not running
- Check if job_id is valid
- Verify session exists
- Check backend logs

### Trades not executing
- Confirm auto_trade=true
- Verify signal confidence > 50%
- Check Binance balance
- Review API keys on Railway

### Statistics showing zeros
- Need at least 1 trade
- Check if trades are logged
- Verify session has trades

### UI Components not loading
- Verify session_id is correct
- Check network requests in browser console
- Ensure backend is running

---

## 📅 What's Next (Days 10-12)

After verifying this works:

1. **AI Enhancement Module**
   - CoinGlass API integration (on-chain data)
   - Signal grading (A/B/C based on metrics)
   - AI rationale generation (why this signal?)

2. **Telegram Integration**
   - Alert on new signals
   - Performance updates
   - Risk warnings

3. **Multi-Strategy Management**
   - Run multiple strategies simultaneously
   - Cross-strategy performance comparison
   - Portfolio-level risk management

---

## 📖 File Structure

```
bitiqlab-v2/
├── backend/src/
│   ├── lib/
│   │   ├── coin-monitor.ts          # Continuous monitoring engine
│   │   ├── strategy-evaluator.ts    # Entry/exit condition evaluation
│   │   ├── price-cache.ts           # Real-time price fetching
│   │   └── binance-trading.ts       # Market order execution
│   ├── pages/api/
│   │   ├── paper-trading/
│   │   │   ├── start-monitoring.ts  # Start monitoring job
│   │   │   ├── monitoring-status.ts # Check monitoring status
│   │   │   ├── stop-monitoring.ts   # Stop monitoring job
│   │   │   └── [session_id]/
│   │   │       ├── trades.ts        # List trades with filtering
│   │   │       ├── trades/
│   │   │       │   └── [trade_id].ts # Trade detail
│   │   │       └── statistics.ts    # Aggregated stats
│   │   ├── analysis/
│   │   │   └── backtest-vs-paper.ts # Backtest comparison
│   │   └── strategies/
│   │       └── deploy-rsi-macd.ts   # Deploy strategy
│   └── autoresearch/
│
├── web/src/components/
│   ├── TradeLog.tsx                 # Trade list component
│   ├── PerformanceMetrics.tsx       # Stats dashboard
│   └── BacktestComparison.tsx       # Comparison view
│
├── strategies/
│   └── rsi-macd-momentum.pine       # Pine Script strategy
│
└── TESTING_GUIDE.md                 # Testing instructions
└── COMPLETE_SETUP_GUIDE.md          # This file
```

---

## 🎯 Success Criteria

Your system is **production-ready** when:

✅ Monitoring runs continuously without crashes
✅ Trades execute automatically when conditions met
✅ All trades are logged with correct metrics
✅ Statistics dashboard shows accurate aggregated data
✅ Backtest comparison highlights divergences
✅ UI components load and update in real-time
✅ Can run multiple strategies simultaneously
✅ Error handling gracefully degrades

---

## 🚀 You Now Have

1. **Real-time monitoring** of 10 coins with 5-second polling
2. **Automatic trade execution** based on RSI+MACD signals
3. **Comprehensive trade logging** with 20+ metrics
4. **Complete statistics dashboard** with health scoring
5. **Backtest comparison** to validate strategy performance
6. **Professional React UI** for analysis and review

**The foundation for a complete automated trading system is ready.**

Next: Days 10-12 will add AI grading and Telegram alerts to complete the pipeline.
