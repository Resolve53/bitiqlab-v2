# Bitiq Lab - Autonomous Trading Strategy Research Platform

An enterprise-grade system for discovering, testing, optimizing, and validating trading strategies through autonomous LLM-powered research, backtesting, and paper trading.

## 📋 Overview

Bitiq Lab is a comprehensive trading strategy laboratory that automates the entire research-to-production pipeline:

1. **Discovery** - Natural language prompts generate strategy ideas
2. **Backtesting** - Rigorous validation on historical data
3. **Auto-Research** - Autonomous optimization loop improves strategies
4. **Paper Trading** - Real-time validation on Binance testnet
5. **Promotion** - Admin review and approval for live trading

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Admin Interface (Bitiq)                    │
│           Natural language strategy prompts                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│          LLM Research Layer (Claude API)                      │
│  ├─ Strategy Generator                                       │
│  ├─ Auto-Improvement Loop (Autoresearch Pattern)            │
│  └─ Git Version Control (commit/reset)                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│     Backtest Engine (12mo/6mo/3mo windows)                   │
│  ├─ Walk-Forward Validation (avoid overfitting)             │
│  ├─ Out-of-Sample Testing                                    │
│  ├─ Metrics Calculation (Sharpe, Sortino, etc)              │
│  └─ Equity Curve Tracking                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│     Paper Trading Engine (14+ days, 30+ trades)              │
│  ├─ Real-time signal execution                               │
│  ├─ Binance testnet integration                              │
│  ├─ Trade logging with full context                          │
│  └─ Validation checks                                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│          Admin Dashboard & Decision Layer                     │
│  ├─ Backtest result visualization                            │
│  ├─ Paper trading monitoring                                 │
│  ├─ Comparison: backtest vs paper trading                    │
│  └─ Approval workflow for live trading                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Bitiq Integration (Live Trading)                 │
│     Approved strategies → signal pipeline → live execution   │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Project Structure

```
bitiqlab-v2/
├── packages/
│   ├── core/                    # Shared types & utilities
│   ├── api/                     # Next.js backend API
│   ├── web/                     # Admin dashboard
│   ├── backtest-engine/         # Backtesting engine
│   ├── tradingview-mcp/         # TradingView MCP integration (external repo)
│   ├── paper-trading/           # Paper trading simulator
│   └── autoresearch/            # ML research & optimization (external repo)
│
├── migrations/                  # Database schema (Supabase)
├── PROJECT_ARCHITECTURE.md      # Detailed system design
└── README.md                    # This file
```

## 🚀 Key Components

### 1. **Core Package** (`@bitiqlab/core`)
Shared types, models, and utilities used across all packages:
- `Strategy` - Trading strategy definition
- `BacktestRun` - Backtest results with metrics
- `Trade` - Individual trade record
- `PaperTradingSession` - Paper trading campaign
- Utility functions for metrics calculation

### 2. **Backtest Engine** (`@bitiqlab/backtest-engine`)
Simulates strategy execution on historical data:
- `BacktestExecutor` - Trades simulation with realistic order execution
- `WalkForwardValidator` - Rolling window validation to detect overfitting
- `OutOfSampleValidator` - Holdout last N months for validation
- Metrics calculation: Sharpe, Sortino, Drawdown, Win Rate, etc.

### 3. **Strategy Registry** (Database + API)
Tracks all strategies through their lifecycle:
- Draft → Backtested → Optimized → Paper Trading → Approved
- Version history and git commit tracking
- Performance metrics snapshot at each stage

### 4. **Autoresearch Layer** (`@bitiqlab/autoresearch`)
Autonomous strategy discovery and optimization:
- Strategy generation from natural language prompts (Claude API)
- Autoresearch loop that iteratively improves strategies
- Metric-based decisions (keep if Sharpe improved, revert if not)
- Git integration for version control
- ML-based optimization using PyTorch (from Karpathy's autoresearch)

### 5. **Paper Trading Simulator** (`@bitiqlab/paper-trading`)
Real-time validation on Binance testnet:
- Signal execution and position management
- Trade logging with full execution context
- Validation checks (min 30 trades, 14 days)
- Comparison with backtest metrics

### 6. **Admin Dashboard** (`packages/web`)
Dashboard for strategy review and promotion:
- Strategy list with status and performance
- Backtest result visualization
- Paper trading monitoring
- Promotion workflow
- Trade inspection tools

## 🗄️ Database Schema

PostgreSQL (via Supabase) with tables for:
- **strategies** - Strategy definitions
- **strategy_versions** - Version history
- **backtest_runs** - Backtest results
- **trades** - Individual trades
- **paper_trading_sessions** - Paper trading records
- **walk_forward_results** - Validation results
- **optimization_runs** - Parameter optimization results
- **audit_logs** - Change tracking and audit trail

See `migrations/` folder for complete schema.

## 🔄 Workflow: Prompt to Live Trading

### Step 1: Discovery (Admin Prompt)
```
"Create a 15m momentum strategy for BTC using RSI + MACD"
↓
LLM generates entry/exit rules and position sizing
↓
Strategy created with status = "draft"
```

### Step 2: Backtesting (Autoresearch Loop)
```
Backtest on 12 months of historical data
↓
Sharpe: 1.2, Max DD: 15%, Win Rate: 52%
↓
LLM suggests: "Tighten stops by 10%"
↓
Retest → Sharpe: 1.35 ✓ Keep! Commit to git
↓
[Repeat until no improvement]
↓
Status: "backtested"
```

### Step 3: Validation
- Walk-forward analysis (rolling windows)
- Out-of-sample testing (last 3 months held out)
- Overfitting detection
- Status: "optimized" if passes

### Step 4: Paper Trading (14+ days, 30+ trades)
- Real-time signals from TradingView MCP
- Execute on Binance testnet
- Log every trade with context
- Status: "paper_trading"

### Step 5: Admin Review & Approval
- Compare backtest vs paper trading metrics
- Check for red flags (degradation, instability)
- Decision: Approve → "approved" | Reoptimize | Disable

### Step 6: Live Trading (Bitiq Integration)
- Approved strategy feeds into Bitiq signal pipeline
- Real account execution with risk limits
- Performance tracking

## 🛠️ Tech Stack

- **Frontend:** Next.js + React + Tailwind CSS
- **Backend:** Node.js + Express / Next.js API Routes
- **Database:** PostgreSQL (Supabase)
- **LLM:** Claude API (Anthropic)
- **Market Data:** TradingView MCP
- **Paper Trading:** Binance Testnet API
- **Hosting:** Vercel (frontend), Railway (backend), Supabase (database)
- **Monorepo:** Turborepo + npm workspaces

## 📚 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL (or Supabase account)
- Anthropic API key (Claude)
- Binance API keys (for testnet)

### Installation

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run in development mode
npm run dev

# Run tests
npm run test
```

### Environment Setup

Create `.env` file:
```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Anthropic/Claude
ANTHROPIC_API_KEY=your_anthropic_key

# Binance Testnet
BINANCE_TESTNET_API_KEY=your_binance_key
BINANCE_TESTNET_API_SECRET=your_binance_secret

# TradingView MCP
TRADINGVIEW_MCP_URL=your_mcp_url
```

## 📊 Key Metrics

All strategies are evaluated on:

- **Sharpe Ratio** - Risk-adjusted returns (primary metric)
- **Sortino Ratio** - Downside risk adjustment
- **Max Drawdown** - Largest peak-to-trough decline
- **Win Rate** - Percentage of profitable trades
- **Profit Factor** - Gross profit / Gross loss
- **R:R Ratio** - Average risk/reward per trade

### Validation Thresholds

- **Min Paper Trading Trades:** 30
- **Min Paper Trading Duration:** 14 days
- **Min Acceptable Sharpe:** 0.5
- **Max Acceptable Drawdown:** 20%
- **Overfitting Threshold:** 1.3× (in-sample vs out-of-sample)

## 🔐 Security & Risk Management

- **Position Sizing:** Risk per trade limited (default 2%)
- **Max Drawdown Limits:** Enforced at strategy level
- **Leverage Constraints:** 1x for spot, 1-5x for futures
- **Commission & Slippage:** Modeled in simulations
- **Audit Logging:** All strategy changes tracked
- **Admin Approval:** Required before going live

## 🧪 Testing Strategy

- **Unit Tests:** Component-level functionality
- **Integration Tests:** Component interactions
- **Backtest Validation:** Historical data testing
- **Paper Trading:** Real-time signal validation
- **Walk-Forward:** Multiple window validation

## 📖 Documentation

- `PROJECT_ARCHITECTURE.md` - Complete system design
- `packages/core/README.md` - Type definitions
- `packages/backtest-engine/README.md` - Backtesting guide
- `packages/autoresearch/README.md` - Autoresearch and ML optimization
- `VERCEL_SETUP.md` - Deployment guide
- `API_ENDPOINTS.md` - REST API reference

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/strategy-xyz`
2. Commit changes: `git commit -m "Add strategy XYZ"`
3. Push to branch: `git push origin feature/strategy-xyz`
4. Create pull request

## 📝 License

Proprietary - Bitiq Lab

## 📞 Support

For questions or issues, contact the development team.

---

**Status:** Active Development  
**Last Updated:** April 2026  
**Maintained by:** Bitiq Lab Team
