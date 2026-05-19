# Bitiq Lab v2 - Monorepo Structure

## Overview

**bitiqlab-v2** is a monorepo containing the entire Bitiq Lab platform in a single repository. All services are built and deployed from this one repo.

```
bitiqlab-v2/ (single repository)
├── frontend/                              Next.js dashboard
│   ├── src/pages/
│   │   ├── dashboard.tsx                 Overview page
│   │   ├── live-signals.tsx              All active signals
│   │   ├── active-trades.tsx             Open positions
│   │   ├── trade-history.tsx             Closed trades
│   │   ├── strategies.tsx                Strategy list
│   │   ├── on-chain.tsx                  Fear & Greed, whale activity
│   │   ├── calendar.tsx                  Economic calendar
│   │   ├── backtest.tsx                  Backtest engine
│   │   └── research-agent.tsx            AI research agent
│   └── src/components/MainLayout.tsx     Navigation sidebar
│
├── packages/                              Backend microservices
│   ├── signal-and-backtest-service/      Signal generation, backtesting (port 4001)
│   ├── trade-execution-service/          Trade execution, monitoring (port 4002)
│   └── analysis-scoring-service/         Trade analysis, scoring (port 4003)
│
├── Dockerfile.frontend                   Build frontend service
├── Dockerfile.signal-service             Build signal service
├── Dockerfile.trade-service              Build trade service
├── Dockerfile.analysis-service           Build analysis service
│
├── docker-compose.yml                    Local development setup
├── DEPLOYMENT.md                         Railway deployment guide
└── MONOREPO_STRUCTURE.md                 This file

```

## Service Deployment

### Railway Configuration

All 4 services are deployed from **bitiqlab-v2** repository:

| Service | Dockerfile | Port | Type | Environment |
|---------|-----------|------|------|-------------|
| Frontend | `Dockerfile.frontend` | 3000 | Public | NEXT_PUBLIC_API_URL |
| Signal Service | `Dockerfile.signal-service` | 4001 | Internal | SUPABASE_URL, TRADINGVIEW_MCP_URL |
| Trade Service | `Dockerfile.trade-service` | 4002 | Internal | SUPABASE_URL, BINANCE_TESTNET_* |
| Analysis Service | `Dockerfile.analysis-service` | 4003 | Internal | SUPABASE_URL, ANTHROPIC_API_KEY |

### DO NOT Use Separate Repos

❌ **Wrong:** Multiple separate repositories
- bitiqlab-backend
- bitiqlab-frontend
- bitiqlab-services

✅ **Correct:** Single monorepo with multiple services
- bitiqlab-v2 (contains everything)

## Local Development

```bash
# Run all services locally with docker-compose
docker-compose up --build

# Services available at:
# - Frontend: http://localhost:3000
# - Signal: http://localhost:4001/api/health
# - Trade: http://localhost:4002/api/health
# - Analysis: http://localhost:4003/api/health
```

## Railway Deployment

See `DEPLOYMENT.md` for detailed Railway setup instructions.

Each service in Railway:
1. Points to the **bitiqlab-v2** repository
2. Uses the specific Dockerfile (e.g., `Dockerfile.signal-service`)
3. Has its own environment variables
4. Runs independently on its assigned port

## Benefits of Monorepo

- 🔗 **Single source of truth** - one repo, one git history
- 📦 **Shared dependencies** - consistent versions across services
- 🚀 **Easier deployment** - deploy all from one place
- 🔄 **Easy refactoring** - changes across services in one commit
- 📝 **Clear structure** - obvious where everything lives

## Migration Note

If you have old separate repos (bitiqlab-backend, etc.), **delete them from Railway** and use only **bitiqlab-v2**.
