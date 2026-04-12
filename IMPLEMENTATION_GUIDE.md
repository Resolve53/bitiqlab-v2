# Bitiq Lab - Implementation Guide

## Overview

This guide provides detailed information about Bitiq Lab's architecture, data flow, and how to use each component.

## System Components

### 1. Core Package (`packages/core`)
**Purpose:** Shared types and utilities used across all packages

**Key Types:**
- `Strategy` - Trading strategy definition with entry/exit rules
- `BacktestRun` - Backtest results with performance metrics
- `Trade` - Individual trade record
- `PaperTradingSession` - Paper trading campaign tracking
- `WalkForwardResult` - Walk-forward validation results

**Utilities:**
```typescript
import { calculateSharpeRatio, calculateMaxDrawdown } from "@bitiqlab/core";

const sharpe = calculateSharpeRatio(returns);
const maxDD = calculateMaxDrawdown(equityCurve);
```

### 2. Backtest Engine (`packages/backtest-engine`)
**Purpose:** Simulates strategy execution on historical data

**Components:**
- `BacktestExecutor` - Runs backtests and calculates metrics
- `WalkForwardValidator` - Validates against overfitting
- `OutOfSampleValidator` - Tests on holdout data

**Usage:**
```typescript
import { BacktestExecutor } from "@bitiqlab/backtest-engine";

const executor = new BacktestExecutor(config, initialCapital);
const result = await executor.execute(bars, signals);
// result: BacktestRun with all metrics
```

**Metrics Calculated:**
- Sharpe Ratio - Risk-adjusted returns
- Sortino Ratio - Downside risk adjustment
- Max Drawdown - Largest peak-to-trough decline
- Win Rate - Percentage of profitable trades
- Profit Factor - Gross profit / Gross loss
- Average R:R - Risk/Reward ratio

### 3. TradingView MCP Integration (`packages/tradingview-mcp`)
**Purpose:** Fetches market data and generates trading signals

**Components:**
- `TradingViewDataFetcher` - Gets OHLCV data and indicators
- `SignalGenerator` - Converts strategy rules to trading signals
- `BatchTradingViewDataFetcher` - Parallel data fetching

**Usage:**
```typescript
import {
  TradingViewDataFetcher,
  SignalGenerator,
} from "@bitiqlab/tradingview-mcp";

// Fetch data
const fetcher = new TradingViewDataFetcher(config);
const bars = await fetcher.getOHLCV(
  "BTCUSDT",
  "1h",
  startDate,
  endDate
);

// Generate signals
const generator = new SignalGenerator(strategyConfig, fetcher);
const signals = await generator.generateSignals(startDate, endDate);
```

### 4. Paper Trading Simulator (`packages/paper-trading`)
**Purpose:** Simulates real-time trading on Binance testnet

**Components:**
- `PaperTradingSimulator` - Position management and P&L tracking

**Usage:**
```typescript
import { PaperTradingSimulator } from "@bitiqlab/paper-trading";

const simulator = new PaperTradingSimulator(config);

// Process signals
await simulator.processSignal(signal, currentPrice);

// Get session state
const session = simulator.getSessionState();
// session.current_balance, trades, validation_status, etc.
```

### 5. LLM Research Layer (`packages/llm-research`)
**Purpose:** Autonomous strategy discovery and optimization

**Components:**
- `StrategyGenerator` - Generates strategies from prompts using Claude
- `AutoresearchLoop` - Continuous improvement loop

**Usage:**
```typescript
import {
  StrategyGenerator,
  AutoresearchLoop,
} from "@bitiqlab/llm-research";

// Generate strategy from natural language
const generator = new StrategyGenerator(apiKey);
const strategy = await generator.generate({
  prompt: "Create a 15m momentum strategy using RSI + MACD",
  symbol: "BTCUSDT",
  timeframe: "15m",
  market_type: "spot",
});

// Run autoresearch loop
const researchLoop = new AutoresearchLoop(config, generator);
const result = await researchLoop.run(
  strategy,
  historicalData,
  getSignalsCallback
);
// result: improvements_made, total_improvement, etc.
```

## Complete Workflow Example

### Step 1: Generate Strategy
```typescript
const generator = new StrategyGenerator();
const strategy = await generator.generate({
  prompt: "Trending strategy for BTC 15m, using EMA crossover",
  symbol: "BTCUSDT",
  timeframe: "15m",
  market_type: "spot",
});
```

### Step 2: Run Backtest
```typescript
const fetcher = new TradingViewDataFetcher(config);
const bars = await fetcher.getOHLCV(
  "BTCUSDT",
  "15m",
  startDate,
  endDate
);

const signalGenerator = new SignalGenerator(strategy, fetcher);
const signals = await signalGenerator.generateSignals(startDate, endDate);

const executor = new BacktestExecutor(strategy, 10000);
const backtest = await executor.execute(bars, signals);
console.log(`Sharpe: ${backtest.sharpe_ratio}, Trades: ${backtest.total_trades}`);
```

### Step 3: Validate with Walk-Forward
```typescript
import { WalkForwardValidator } from "@bitiqlab/backtest-engine";

const validator = new WalkForwardValidator(config);
const result = await validator.validate(bars, getSignalsCallback);

if (result.is_overfit) {
  console.warn("Strategy is overfit, needs refinement");
} else {
  console.log(`Consistent Sharpe across windows: ${result.consistency_score}`);
}
```

### Step 4: Run Autoresearch
```typescript
const researchLoop = new AutoresearchLoop(config);
const improvement = await researchLoop.run(
  strategy,
  bars,
  getSignalsCallback
);

console.log(`Improved from ${improvement.baseline_metric.toFixed(2)} 
           to ${improvement.final_metric.toFixed(2)} 
           (${improvement.total_improvement.toFixed(2)}%)`);
```

### Step 5: Paper Trading
```typescript
const simulator = new PaperTradingSimulator({
  strategy_id: strategy.id,
  initial_capital: 10000,
  max_drawdown_limit: 0.2,
  max_concurrent_positions: 5,
  commission_percent: 0.1,
  slippage_percent: 0.01,
});

// In real-time loop
for (const signal of realTimeSignals) {
  await simulator.processSignal(signal, currentPrice);
  
  const state = simulator.getSessionState();
  if (state.validation_status === "passed") {
    // Ready to promote to live trading
    console.log("Strategy passed paper trading validation!");
  }
}
```

## Database Schema

### Key Tables

#### strategies
```sql
- id (UUID)
- name, symbol, timeframe, market_type, leverage
- entry_rules, exit_rules, position_sizing (JSONB)
- status (draft, backtested, optimized, paper_trading, approved, disabled)
- current_sharpe, current_max_drawdown
- created_at, updated_at, created_by
- git_commit_hash
```

#### backtest_runs
```sql
- id (UUID)
- strategy_id, version, window (12m/6m/3m)
- start_date, end_date
- Metrics: total_trades, win_rate, sharpe_ratio, max_drawdown, etc.
- out_of_sample_sharpe, overfitting_score
- created_at
```

#### paper_trading_sessions
```sql
- id (UUID)
- strategy_id, version, start_date, end_date
- status (active, completed, failed, paused)
- initial_balance, current_balance, total_pnl
- Validation: meets_min_trades, meets_min_duration, passes_stability
- validation_status (pending, passed, failed)
```

#### trades
```sql
- id (UUID)
- strategy_id, session_id (backtest or paper trading)
- symbol, timeframe, direction, entry_price, entry_time
- stop_loss, take_profit
- exit_price, exit_time, exit_reason
- pnl_percent, pnl_absolute, duration_minutes
```

## API Endpoints (To Be Implemented)

### Strategy Management
```
POST   /api/strategies                    - Create strategy
GET    /api/strategies                    - List strategies
GET    /api/strategies/:id                - Get strategy details
PATCH  /api/strategies/:id                - Update strategy
GET    /api/strategies/:id/history        - Get version history
DELETE /api/strategies/:id                - Delete strategy
```

### Backtesting
```
POST   /api/backtest/run                  - Run backtest
GET    /api/backtest/:id                  - Get backtest result
POST   /api/backtest/walk-forward         - Run walk-forward validation
POST   /api/backtest/optimize             - Run parameter optimization
```

### Paper Trading
```
POST   /api/paper-trading/start           - Start session
GET    /api/paper-trading/sessions/:id    - Get session details
POST   /api/paper-trading/sessions/:id/stop - Stop session
GET    /api/paper-trading/sessions/:id/evaluate - Evaluate readiness
```

### Research
```
POST   /api/research/generate-strategy    - Generate from prompt
POST   /api/research/auto-improve         - Run autoresearch loop
GET    /api/research/sessions/:id         - Get research progress
POST   /api/research/sessions/:id/stop    - Stop research
```

## Configuration

Create `.env` file with:
```env
# Anthropic (Claude API)
ANTHROPIC_API_KEY=sk-ant-...

# Supabase
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# TradingView MCP
TRADINGVIEW_MCP_URL=http://...
TRADINGVIEW_MCP_API_KEY=...

# Binance Testnet
BINANCE_TESTNET_API_KEY=...
BINANCE_TESTNET_API_SECRET=...

# Features
ENABLE_AUTO_RESEARCH=true
ENABLE_PAPER_TRADING=true
```

## Development

### Build All Packages
```bash
npm run build
```

### Run in Development
```bash
npm run dev
```

### Run Tests
```bash
npm run test
```

## Performance Considerations

1. **Caching:** TradingView fetcher caches OHLCV data for 1 hour
2. **Batching:** Batch data fetcher processes symbols in batches of 5
3. **Database Indexes:** Key queries indexed on status, created_at, sharpe_ratio
4. **Backtest Efficiency:** Use reasonable data windows (3-12 months)

## Security

- Never commit `.env` files
- API keys stored in environment variables only
- Supabase RLS policies enforce authorization
- All strategy changes logged for audit trail
- Admin approval required before live trading

## Monitoring

Track these metrics:
- Backtest success rate
- Average Sharpe ratio of backtested strategies
- Paper trading validation success rate
- Strategy promotion rate (backtest → live)
- LLM API costs and token usage

## Troubleshooting

### Backtest Fails
- Check OHLCV data quality and completeness
- Verify indicator calculations
- Ensure signal generation doesn't have errors

### Paper Trading Not Matching Backtest
- Commission and slippage differences
- Real vs simulated order execution
- Data feed delays/gaps

### Autoresearch Gets Stuck
- Check improvement threshold is reasonable (e.g., 5%)
- Verify metrics are stable (not too noisy)
- Set time limit to prevent infinite loops

## Next Steps

1. Implement API endpoints with Express/Next.js
2. Create admin dashboard UI
3. Setup Supabase migrations
4. Integrate with Binance Testnet
5. Deploy to Railway + Vercel
6. Build monitoring dashboard
7. Create documentation for users

---

**Version:** 0.1.0  
**Last Updated:** April 2026
