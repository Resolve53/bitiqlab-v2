# Bitiq Lab - Comprehensive Architecture & Implementation Plan

## System Overview
Bitiq Lab is an autonomous trading strategy research platform that:
- Discovers new strategies via LLM (Claude API)
- Backtests them using historical TradingView data
- Continuously improves strategies via autoresearch pattern
- Paper trades validated strategies on Binance testnet
- Promotes winning strategies to Bitiq signal pipeline

## Technology Stack
- **Frontend:** Next.js + React (Vercel)
- **Backend:** Node.js + Express / Next.js API Routes (Railway)
- **Database:** PostgreSQL (Supabase)
- **Strategy Engine:** Python (for backtesting & optimization)
- **ML/LLM:** Claude API (Anthropic)
- **Market Data:** TradingView MCP
- **Paper Trading:** Binance Testnet API
- **Cloud:** Vercel (frontend), Railway (backend), Supabase (database)

## Project Structure

```
bitiqlab-v2/
├── packages/
│   ├── core/                    # Shared types, models, utilities
│   │   ├── src/
│   │   │   ├── models/          # TypeScript/Python data models
│   │   │   ├── types/           # Shared types
│   │   │   ├── constants/       # Trading constants, enum values
│   │   │   └── utils/           # Shared utilities
│   │   └── package.json
│   │
│   ├── api/                     # Next.js backend API
│   │   ├── src/
│   │   │   ├── pages/api/       # API endpoints
│   │   │   ├── lib/             # Utilities, services
│   │   │   ├── middleware/      # Auth, logging, etc
│   │   │   └── db/              # Database interactions
│   │   ├── .env.local
│   │   └── package.json
│   │
│   ├── web/                     # Next.js frontend (admin dashboard)
│   │   ├── src/
│   │   │   ├── pages/           # Dashboard pages
│   │   │   ├── components/      # Reusable components
│   │   │   ├── hooks/           # React hooks
│   │   │   └── styles/          # Tailwind CSS
│   │   └── package.json
│   │
│   ├── backtest-engine/         # Python backtesting service
│   │   ├── src/
│   │   │   ├── engine/          # Core backtest logic
│   │   │   ├── metrics/         # Performance metrics calculations
│   │   │   ├── validators/      # Walk-forward, out-of-sample validation
│   │   │   └── indicators/      # Technical indicators
│   │   ├── api.py               # REST API for backtest requests
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── tradingview-mcp/         # TradingView MCP integration
│   │   ├── src/
│   │   │   ├── client/          # MCP client setup
│   │   │   ├── data/            # Data fetching (OHLCV, indicators)
│   │   │   ├── executor/        # Signal execution
│   │   │   └── cache/           # Data caching layer
│   │   └── package.json
│   │
│   ├── paper-trading/           # Paper trading simulator
│   │   ├── src/
│   │   │   ├── simulator/       # Trade execution simulation
│   │   │   ├── binance/         # Binance testnet integration
│   │   │   ├── logging/         # Trade logging
│   │   │   └── validators/      # Validation rules (min duration, trades)
│   │   └── package.json
│   │
│   └── llm-research/            # LLM research & improvement loop
│       ├── src/
│       │   ├── strategy-generator/   # Strategy creation from prompts
│       │   ├── improvement-loop/     # Autonomous optimization
│       │   ├── metric-evaluator/     # Compare metrics & decide on changes
│       │   └── git-manager/          # Git commit/reset for versions
│       └── package.json
│
├── migrations/                  # Database migrations (Supabase)
│   ├── 001_initial_schema.sql
│   ├── 002_strategy_tables.sql
│   ├── 003_backtest_tables.sql
│   ├── 004_paper_trading_tables.sql
│   └── 005_trade_logs.sql
│
├── docker-compose.yml           # Local development setup
├── .env.example
├── package.json                 # Root package.json (monorepo)
├── tsconfig.json
├── turbo.json                   # Turborepo config
├── README.md
└── PROJECT_ARCHITECTURE.md      # This file
```

## Data Models

### 1. Strategy
```typescript
{
  id: UUID;
  name: string;                    // e.g., "BTC 15m RSI Mean Reversion"
  description: string;
  symbol: string;                  // BTCUSDT, ETHUSDT, etc.
  timeframe: string;               // 5m, 15m, 1h, 4h, 1d
  market_type: "spot" | "futures";
  leverage: number;                // 1 for spot, 1-5 for futures
  
  // Strategy Rules (from LLM)
  entry_rules: JSON;              // Condition logic for entry
  exit_rules: JSON;               // SL, TP, exit conditions
  position_sizing: JSON;          // Risk per trade, max positions
  
  // Lifecycle
  status: "draft" | "backtested" | "optimized" | "paper_trading" | "approved" | "disabled";
  version: number;                // Auto-increment for history tracking
  
  // Metadata
  created_at: timestamp;
  updated_at: timestamp;
  created_by: UUID;               // User ID (admin)
  
  // Git version control
  git_commit_hash: string;        // Track strategy version in git
}
```

### 2. Backtest Run
```typescript
{
  id: UUID;
  strategy_id: UUID;
  version: number;
  
  // Test Period
  window: "12m" | "6m" | "3m";
  start_date: date;
  end_date: date;
  
  // Results
  total_trades: number;
  win_rate: number;               // 0-1
  profit_factor: number;          // gross_profit / gross_loss
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;           // 0-1
  avg_r_r: number;               // average risk/reward
  total_return: number;           // 0-1
  
  // Quality Metrics
  out_of_sample_sharpe: number;   // For walk-forward validation
  overfitting_score: number;      // in_sample_sharpe / out_of_sample_sharpe
  
  // Trade Details
  trades: Trade[];
  
  // Metadata
  created_at: timestamp;
  test_duration_minutes: number;
}
```

### 3. Paper Trading Session
```typescript
{
  id: UUID;
  strategy_id: UUID;
  start_date: timestamp;
  end_date: timestamp | null;
  status: "active" | "completed" | "failed";
  
  // Trade Results
  trades: Trade[];
  total_trades: number;
  win_rate: number;
  max_drawdown: number;
  sharpe_ratio: number;
  
  // Validation Status
  meets_min_trades: boolean;       // >= 30
  meets_min_duration: boolean;     // >= 14 days
  passes_stability_checks: boolean;
  
  // Links
  strategy_id: UUID;
  created_at: timestamp;
}
```

### 4. Trade (used by both backtest & paper trading)
```typescript
{
  id: UUID;
  strategy_id: UUID;
  session_id: UUID;               // Paper trading session or backtest run
  
  // Symbol & Market
  symbol: string;
  timeframe: string;
  market_type: "spot" | "futures";
  leverage: number;
  
  // Entry
  direction: "long" | "short";
  entry_price: number;
  entry_time: timestamp;
  entry_conditions: JSON;         // Snapshot of indicators at entry
  
  // Levels
  stop_loss: number;
  take_profit: number;
  
  // Exit
  exit_price: number;
  exit_time: timestamp;
  exit_reason: "stop_loss" | "take_profit" | "manual" | "timeout";
  
  // Results
  pnl_percent: number;
  pnl_absolute: number;
  r_r_actual: number;
  max_favorable_excursion: number;
  max_adverse_excursion: number;
  duration_minutes: number;
  
  // Logging
  created_at: timestamp;
}
```

### 5. Strategy Optimization Run
```typescript
{
  id: UUID;
  strategy_id: UUID;
  
  // Parameter Grid
  parameters_tested: number;      // How many parameter combinations
  best_parameters: JSON;
  best_sharpe: number;
  
  // Optimization Method
  method: "grid_search" | "bayesian" | "genetic";
  
  // Results
  improvements: Array<{
    parameter_name: string;
    old_value: any;
    new_value: any;
    sharpe_change: number;
  }>;
  
  created_at: timestamp;
  duration_minutes: number;
}
```

## Workflow: From Prompt to Live Trading

### Phase 1: DISCOVERY
1. Admin provides prompt: "Create a 15m momentum strategy for BTC using RSI + MACD"
2. LLM Research layer calls Claude API
3. Claude generates:
   - Entry rules (e.g., "RSI < 30 AND MACD histogram positive")
   - Exit rules (e.g., "RSI > 70 OR SL hit")
   - Position sizing (e.g., "2% risk per trade, max 5 concurrent")
4. Strategy created with status = "draft"
5. Git commit: "Create BTC 15m momentum strategy v1"

### Phase 2: BACKTESTING (Autoresearch Loop)
1. Backtest Engine pulls historical data from TradingView MCP
2. Runs on 12-month window
3. Result: Sharpe 1.2, max drawdown 15%, win rate 52%
4. LLM Research layer analyzes:
   - "Drawdown is high. Try tightening stop loss by 10%"
   - Updates strategy_config.json
   - Runs backtest again
5. Result: Sharpe 1.35 ✓ Keep it! Git commit & advance
6. Continues until no improvement or admin stops

### Phase 3: VALIDATION
1. Walk-forward analysis (rolling 3-month windows)
2. Out-of-sample testing (last 3 months held out)
3. Overfitting detection (compare in-sample vs out-of-sample Sharpe)
4. If passes → status = "backtested"

### Phase 4: OPTIMIZATION
1. Parameter sensitivity analysis (grid search or Bayesian)
2. Test variations of SL, TP, timeframes, confirmations
3. LLM suggests refinements based on metrics
4. Best version recorded → status = "optimized"

### Phase 5: PAPER TRADING (14+ days, 30+ trades)
1. Real-time signals from TradingView MCP
2. Execute on Binance testnet (paper money)
3. Every trade logged with full context
4. Monitor: drawdown, stability, win rate
5. After 14 days & 30+ trades → status = "paper_trading"

### Phase 6: ADMIN REVIEW & PROMOTION
1. Dashboard shows: 47 trades, 58% win rate, Sharpe 1.31
2. Compare backtest vs paper trading metrics
3. Check for red flags (overfitting, degradation)
4. Decision: Approve → "approved" | Extend Testing | Re-optimize | Disable

### Phase 7: BITIQ INTEGRATION
1. Approved strategy → Bitiq signal pipeline
2. Live execution on real account with risk limits
3. Performance tracking & attribution

## Key Services & APIs

### Backtest Engine API
```
POST /api/backtest/run
{
  strategy_id: UUID,
  version: number,
  window: "12m" | "6m" | "3m"
}
Response: BacktestRun with all metrics

POST /api/backtest/walk-forward-validate
{
  strategy_id: UUID
}
Response: WalkForwardResult with rolling window Sharpe ratios
```

### Strategy Registry API
```
POST /api/strategies
{ name, description, symbol, timeframe, ... }
Response: Strategy with status = "draft"

PATCH /api/strategies/:id
{ entry_rules, exit_rules, position_sizing, ... }
Response: Updated Strategy

GET /api/strategies/:id/history
Response: List of all versions and backtest results

PATCH /api/strategies/:id/status
{ status: "backtested" | "optimized" | "paper_trading" | "approved" }
Response: Updated Strategy
```

### Paper Trading API
```
POST /api/paper-trading/start
{
  strategy_id: UUID,
  paper_account_id: UUID
}
Response: PaperTradingSession { status = "active" }

GET /api/paper-trading/sessions/:id
Response: PaperTradingSession with trades array

POST /api/paper-trading/sessions/:id/evaluate
Response: Evaluation { meets_min_trades, meets_min_duration, passes_stability }
```

### LLM Research API
```
POST /api/research/auto-improve
{
  strategy_id: UUID,
  max_iterations: number,
  target_metric: "sharpe_ratio" | "profit_factor"
}
Response: { iterations_completed, best_sharpe, improvements_made }

POST /api/research/suggest-improvements
{
  strategy_id: UUID,
  backtest_id: UUID
}
Response: List of suggested parameter changes with reasoning
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [x] Project setup (monorepo, dependencies)
- [x] Database schema (Supabase migrations)
- [x] Data models (TypeScript types)
- [x] Core utilities & helpers
- [ ] Setup CI/CD pipeline

### Phase 2: Core Engines (Week 2-3)
- [ ] Backtest Engine (OHLCV simulation, metrics calculation)
- [ ] TradingView MCP Integration (data fetching, caching)
- [ ] Paper Trading Simulator (Binance testnet mock)
- [ ] Walk-forward validator & overfitting detector

### Phase 3: LLM Integration (Week 4)
- [ ] Strategy Generator (Claude API prompts)
- [ ] Autoresearch Loop (improvement loop logic)
- [ ] Git Version Control (commit/reset for strategy versions)
- [ ] Metric Evaluator (compare & decide on changes)

### Phase 4: Strategy Registry (Week 4-5)
- [ ] Strategy CRUD API
- [ ] Version history tracking
- [ ] Status lifecycle management
- [ ] Performance history queries

### Phase 5: Admin Dashboard (Week 5-6)
- [ ] Strategy list & detail pages
- [ ] Backtest result visualization
- [ ] Paper trading session monitoring
- [ ] Admin approval workflow
- [ ] Trade inspection/debugging

### Phase 6: Deployment & Polish (Week 6-7)
- [ ] Supabase integration & migrations
- [ ] Vercel deployment (frontend)
- [ ] Railway deployment (backend + Python services)
- [ ] Environment configuration
- [ ] Performance testing & optimization
- [ ] Documentation & deployment guide

## Success Criteria

✅ **Discovery:** LLM can generate valid strategy rules from natural language prompts
✅ **Backtesting:** Engine accurately simulates trades with proper position sizing
✅ **Autoresearch:** Loop improves Sharpe ratio through parameter optimization
✅ **Paper Trading:** Real-time signals execute on Binance testnet
✅ **Validation:** Walk-forward analysis detects overfitting
✅ **Admin Review:** Dashboard shows all metrics, enables promotion decisions
✅ **Integration:** Approved strategies feed into Bitiq signal pipeline

## Next Steps

1. Initialize monorepo structure (npm workspaces / turborepo)
2. Create Supabase migration scripts
3. Build core data models & TypeScript types
4. Start with Backtest Engine implementation
5. Integrate TradingView MCP for data fetching
6. Build Paper Trading Simulator
7. Implement LLM Research Loop
8. Create Admin Dashboard
9. Deploy and test end-to-end

---

**Ready to begin? I'll start with Phase 1: Foundation - Project setup & database schema.**
