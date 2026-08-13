# Bitiq Lab v2 - Deployment Guide

## Railway Deployment

> Redeploy note (2026-08-13): Phase 3 (`POST /api/research/run`) is on `main`.
> If the `bitiqlab-v2` backend Railway service failed with
> `failed to start workflow: context deadline exceeded`, trigger a fresh
> GitHub → Railway deploy of that service only. No application code change
> is required for that infrastructure start failure.

This monorepo contains 4 services that need to be deployed to Railway:

### Services

1. **Frontend** (port 3000)
   - Next.js React dashboard
   - Dockerfile: `Dockerfile.frontend`

2. **Signal & Backtest Service** (port 4001)
   - Signal generation and strategy backtesting
   - Dockerfile: `Dockerfile.signal-service`
   - Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRADINGVIEW_MCP_URL`

3. **Trade Execution Service** (port 4002)
   - Trade execution and monitoring on Binance testnet
   - Dockerfile: `Dockerfile.trade-service`
   - Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BINANCE_TESTNET_API_KEY`, `BINANCE_TESTNET_API_SECRET`

4. **Analysis & Scoring Service** (port 4003)
   - Trade analysis and strategy scoring
   - Dockerfile: `Dockerfile.analysis-service`
   - Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`

## Deployment Steps

### Option 1: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create a new project
railway init

# Create services for each Dockerfile
railway service new --dockerfile Dockerfile.frontend
railway service new --dockerfile Dockerfile.signal-service
railway service new --dockerfile Dockerfile.trade-service
railway service new --dockerfile Dockerfile.analysis-service

# Set environment variables for each service
# (Use Railway dashboard or railway env command)

# Deploy
railway up
```

### Option 2: Railway Dashboard

1. Go to https://railway.app
2. Create a new project
3. Create 4 services, each pointing to this repo with custom Dockerfile:
   - `Dockerfile.frontend` (exposed on port 3000)
   - `Dockerfile.signal-service` (internal port 4001)
   - `Dockerfile.trade-service` (internal port 4002)
   - `Dockerfile.analysis-service` (internal port 4003)
4. Set environment variables for each service from `.env.example` files
5. Deploy

## Environment Variables

Set these in Railway for each service:

**All Services:**
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
- `NODE_ENV`: `production`

**Signal Service:**
- `TRADINGVIEW_MCP_URL`: TradingView MCP endpoint

**Trade Service:**
- `BINANCE_TESTNET_API_KEY`: Binance testnet API key
- `BINANCE_TESTNET_API_SECRET`: Binance testnet API secret

**Analysis Service:**
- `ANTHROPIC_API_KEY`: Claude API key

## Local Testing with Docker Compose

```bash
# Create .env file with all variables
cp .env.example .env

# Build and run all services
docker-compose up --build

# Access services:
# - Frontend: http://localhost:3000
# - Signal Service: http://localhost:4001
# - Trade Service: http://localhost:4002
# - Analysis Service: http://localhost:4003
```

## Port Mapping

- Frontend: 3000 (public)
- Signal & Backtest: 4001 (internal)
- Trade Execution: 4002 (internal)
- Analysis & Scoring: 4003 (internal)

Only the frontend should be exposed publicly. Services communicate via internal Railway networking.

## Health Checks

Each service includes a health endpoint:
- `/api/health` - GET request returns service status

Configure Railway health checks to use these endpoints for better reliability.
