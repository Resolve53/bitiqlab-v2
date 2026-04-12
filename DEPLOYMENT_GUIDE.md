# Bitiq Lab Deployment Guide

Complete guide for deploying Bitiq Lab to production.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Users (Browser)                       │
└────────────┬────────────────────────────────┬────────────┘
             │                                │
      ┌──────▼─────────┐            ┌────────▼──────────┐
      │  Vercel        │            │  Railway         │
      │  (Frontend)    │            │  (Backend)       │
      │  Next.js Web   │            │  Next.js API     │
      │  @bitiqlab/web │            │  @bitiqlab/api   │
      └──────┬─────────┘            └────────┬──────────┘
             │                                │
             └────────────┬───────────────────┘
                          │
                   ┌──────▼──────────┐
                   │  Supabase       │
                   │  (Database)     │
                   │  PostgreSQL     │
                   │  + RLS Policies │
                   └─────────────────┘
```

## Prerequisites

- Node.js 18+ installed
- Git configured
- Vercel account (for frontend deployment)
- Railway account (for backend deployment)
- Supabase account (for database)
- Anthropic API key (Claude)
- TradingView MCP endpoint
- Binance API keys (for testnet)

## Step 1: Local Setup & Testing

### 1.1 Install Dependencies

```bash
npm install
```

### 1.2 Build All Packages

```bash
npm run build
```

### 1.3 Configure Environment Variables

Create `.env.local` in repository root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Anthropic/Claude
ANTHROPIC_API_KEY=sk-ant-xxx

# TradingView MCP
TRADINGVIEW_MCP_URL=https://your-tradingview-mcp.com
TRADINGVIEW_MCP_API_KEY=your_mcp_key

# Binance Testnet
BINANCE_TESTNET_API_KEY=your_testnet_key
BINANCE_TESTNET_API_SECRET=your_testnet_secret

# Frontend Config
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 1.4 Run Locally

**Terminal 1 - Backend API:**
```bash
cd packages/api
npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 - Frontend Dashboard:**
```bash
cd packages/web
npm run dev
# Runs on http://localhost:3000
```

### 1.5 Test API Endpoints

```bash
# Health check
curl http://localhost:3001/api/health

# Dashboard metrics
curl http://localhost:3001/api/dashboard/metrics

# List strategies
curl http://localhost:3001/api/strategies
```

## Step 2: Database Setup (Supabase)

### 2.1 Create Supabase Project

1. Go to https://supabase.com
2. Create new project
3. Save project URL and keys
4. Wait for database to be ready

### 2.2 Run Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push

# Verify migrations
supabase db list
```

Or manually run SQL migrations:

1. Go to Supabase dashboard
2. Open SQL Editor
3. Copy content from `migrations/001_initial_schema.sql`
4. Execute
5. Repeat for `002_paper_trading_tables.sql` and `003_audit_and_admin_tables.sql`

### 2.3 Set Up RLS Policies (Future)

```sql
-- Example: Strategies table
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own strategies"
  ON strategies FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Users can create strategies"
  ON strategies FOR INSERT
  WITH CHECK (created_by = auth.uid());
```

## Step 3: Deploy to Vercel (Frontend)

### 3.1 Push to GitHub

```bash
git remote add origin https://github.com/your-username/bitiqlab-v2.git
git branch -M main
git push -u origin main
```

### 3.2 Create Vercel Project

1. Go to https://vercel.com
2. Import Git repository
3. Select `packages/web` as root directory
4. Configure environment variables:
   - `NEXT_PUBLIC_API_URL=https://your-railway-api.com`
   - `NEXT_PUBLIC_SITE_URL=https://your-vercel-app.com`
5. Deploy

### 3.3 Configure Domain (Optional)

1. Go to Vercel dashboard
2. Settings → Domains
3. Add custom domain
4. Update DNS records

## Step 4: Deploy to Railway (Backend)

### 4.1 Create Railway Project

1. Go to https://railway.app
2. Create new project
3. Select "Deploy from GitHub"
4. Connect your repository

### 4.2 Configure Environment Variables

In Railway dashboard, add:

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# API
NEXT_PUBLIC_API_URL=https://your-railway-api.com

# LLM
ANTHROPIC_API_KEY=sk-ant-xxx

# TradingView
TRADINGVIEW_MCP_URL=https://your-tradingview-mcp.com
TRADINGVIEW_MCP_API_KEY=your_mcp_key

# Features
ENABLE_AUTO_RESEARCH=true
ENABLE_PAPER_TRADING=true
```

### 4.3 Configure Build Settings

1. Root directory: `packages/api`
2. Build command: `npm run build`
3. Start command: `npm start`
4. Port: `3001`

### 4.4 Deploy

Click "Deploy" and wait for build to complete.

## Step 5: Connect Frontend to Backend

Update `packages/web/.env.production`:

```env
NEXT_PUBLIC_API_URL=https://your-railway-api.com
```

Redeploy frontend to Vercel.

## Step 6: Post-Deployment Verification

### 6.1 Test API Health

```bash
curl https://your-railway-api.com/api/health
```

### 6.2 Check Dashboard

Visit: `https://your-vercel-app.com`

### 6.3 Test Core Functionality

1. Create a strategy via API
2. List strategies
3. Run backtest
4. Generate strategy from AI
5. Start paper trading

## Step 7: Monitoring & Maintenance

### 7.1 Set Up Logging

Add to `packages/api/.env`:

```env
LOG_LEVEL=info
ENABLE_SENTRY=true
SENTRY_DSN=https://your-sentry-dsn
```

### 7.2 Monitor Performance

- Vercel Analytics dashboard
- Railway logs and metrics
- Supabase monitoring

### 7.3 Backup Strategy

- Enable automated Supabase backups
- Export data regularly
- Keep git history clean

## Step 8: Scaling Considerations

### 8.1 Database Optimization

```sql
-- Create indexes for common queries
CREATE INDEX idx_strategies_status ON strategies(status);
CREATE INDEX idx_backtest_runs_strategy_id ON backtest_runs(strategy_id);
CREATE INDEX idx_trades_session_id ON trades(session_id);
```

### 8.2 API Rate Limiting

Implement in `packages/api/src/middleware/rateLimit.ts`:

```typescript
import { RateLimiter } from "@/lib/utils";

export const limiter = new RateLimiter(
  60000,  // 1 minute window
  100     // 100 requests per minute
);
```

### 8.3 Worker Jobs

Deploy background jobs for:
- Long-running backtests
- Autoresearch loops
- Paper trading monitoring

## Troubleshooting

### Build Fails

```bash
# Clear cache and rebuild
npm run clean
npm install
npm run build
```

### Database Connection Issues

```bash
# Verify Supabase credentials
supabase status --project-ref your-project-ref

# Check connection string
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### API Not Responding

```bash
# Check Railway logs
railway logs

# Test locally
cd packages/api && npm run dev
```

### Frontend Can't Reach API

1. Verify `NEXT_PUBLIC_API_URL` is set correctly
2. Check CORS configuration
3. Test API endpoint directly in browser
4. Check Railway deployment logs

## Security Checklist

- [ ] Environment variables not in git
- [ ] `.env.local` added to `.gitignore`
- [ ] Database RLS policies enabled
- [ ] API authentication implemented
- [ ] HTTPS enforced
- [ ] Rate limiting enabled
- [ ] Audit logging enabled
- [ ] Sensitive keys rotated
- [ ] Database backups configured
- [ ] Error logging configured

## Performance Optimization

### 1. Database Queries

```typescript
// Use select() to limit fields
db.strategies.select('id, name, status, current_sharpe');

// Use pagination
db.strategies.select('*', { count: 'exact' }).limit(20).offset(0);
```

### 2. Caching Strategy

```typescript
// Cache dashboard metrics
cache.set('dashboard-metrics', metrics, 300000); // 5 minutes
```

### 3. Compression

Enable gzip in Next.js config:

```javascript
const nextConfig = {
  compress: true,
};
```

## Maintenance Tasks

### Weekly
- Review logs for errors
- Monitor API usage
- Check database size

### Monthly
- Update dependencies
- Review security patches
- Analyze performance metrics

### Quarterly
- Full system audit
- Capacity planning
- Disaster recovery drill

## Support & Monitoring

### Monitoring Services

- **Vercel Analytics** - Frontend performance
- **Railway Metrics** - Backend performance
- **Supabase Monitoring** - Database health
- **Sentry** (optional) - Error tracking

### Useful Links

- Vercel: https://vercel.com/dashboard
- Railway: https://railway.app
- Supabase: https://app.supabase.com
- Sentry: https://sentry.io

## Next Steps

1. Deploy frontend to Vercel
2. Deploy backend to Railway
3. Set up monitoring
4. Configure CI/CD pipelines
5. Plan for scaling
6. Implement authentication
7. Add advanced features

---

**Deployment Status:** Ready for production  
**Last Updated:** April 2026  
**Version:** 0.1.0
