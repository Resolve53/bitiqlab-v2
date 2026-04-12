# Vercel Deployment Setup

Complete guide to deploy Bitiq Lab to Vercel (Vercel for frontend + Railway for backend).

## 🎯 Architecture

```
Your Domain
    ↓
Vercel (Frontend)
    ↓
Railway (Backend API)
    ↓
Supabase (Database)
```

## Step 1: Prepare Your GitHub Repository

### 1.1 Ensure Code is Committed

```bash
# Check status
git status

# Everything should be clean
# If not, commit remaining changes
git add -A
git commit -m "Ready for Vercel deployment"
git push origin claude/automated-strategy-finder-iQMVo
```

### 1.2 Create GitHub Token (if needed)

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `workflow`
4. Copy token (you'll need this for Vercel)

---

## Step 2: Set Up Supabase (Database)

This is required before Vercel deployment.

### 2.1 Create Supabase Project

1. Go to https://supabase.com
2. Click "New Project"
3. Fill in:
   - Project name: `bitiqlab-prod`
   - Database password: (generate strong password)
   - Region: (choose closest to you)
4. Click "Create new project" and wait ~5 minutes

### 2.2 Get Your Credentials

Once project is ready:

1. Go to Project Settings → API
2. Copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2.3 Apply Database Migrations

1. In Supabase, go to SQL Editor
2. Click "New Query"
3. Copy content from `migrations/001_initial_schema.sql`
4. Paste and execute
5. Repeat for `002_paper_trading_tables.sql` and `003_audit_and_admin_tables.sql`

Or use Supabase CLI:

```bash
npm install -g supabase

supabase login

supabase link --project-ref your-project-ref

supabase db push
```

---

## Step 3: Deploy Backend to Railway

This provides your API endpoint.

### 3.1 Create Railway Account

1. Go to https://railway.app
2. Sign up with GitHub
3. Authorize Railway

### 3.2 Create New Project

1. Click "New Project"
2. Select "Deploy from GitHub"
3. Authorize and select `bitiqlab-v2` repo

### 3.3 Configure Backend

1. Set Root Directory: `packages/api`
2. Add Environment Variables:

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# LLM
ANTHROPIC_API_KEY=sk-ant-xxx

# TradingView (optional for now)
TRADINGVIEW_MCP_URL=http://localhost:8000
TRADINGVIEW_MCP_API_KEY=test-key

# API
NEXT_PUBLIC_API_URL=https://your-railway-api.up.railway.app
```

3. Click "Deploy"
4. Wait for build to complete
5. Get your Railway API URL from the deployment settings

**Save your Railway API URL** - you'll need it for frontend.

---

## Step 4: Deploy Frontend to Vercel

### 4.1 Create Vercel Account

1. Go to https://vercel.com
2. Sign up with GitHub
3. Authorize Vercel

### 4.2 Import Project

1. Click "Add New..." → "Project"
2. Search for `bitiqlab-v2`
3. Click "Import"

### 4.3 Configure Project Settings

**Root Directory:** Select `packages/web`

### 4.4 Set Environment Variables

In "Environment Variables" section, add:

```env
NEXT_PUBLIC_API_URL=https://your-railway-api.up.railway.app
NEXT_PUBLIC_SITE_URL=https://your-vercel-app.vercel.app
```

Replace:
- `your-railway-api.up.railway.app` with your Railway API URL
- `your-vercel-app.vercel.app` with your Vercel domain

### 4.5 Deploy

Click "Deploy" and wait for build to complete.

Once deployment finishes:
- Your dashboard is live at the Vercel URL
- Backend API is running on Railway
- Database is hosted on Supabase

---

## Step 5: Verify Everything Works

### 5.1 Test API Health

```bash
# Replace with your Railway URL
curl https://your-railway-api.up.railway.app/api/health

# Should return:
# {"status":"ok","version":"0.1.0","timestamp":"..."}
```

### 5.2 Test Frontend

1. Visit your Vercel URL in browser
2. You should see the Bitiq Lab dashboard
3. Metrics should be loading

### 5.3 Create a Test Strategy

1. Click "New Strategy" in dashboard
2. Fill in details
3. Submit

Or use API:

```bash
curl -X POST https://your-railway-api.up.railway.app/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Strategy",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "market_type": "spot",
    "entry_rules": {"conditions": "RSI < 30"},
    "exit_rules": {"stop_loss_percent": -2},
    "created_by": "test"
  }'
```

---

## Step 6: Custom Domain (Optional)

### 6.1 Add Domain to Vercel

1. Go to Vercel Project Settings
2. Domains → Add domain
3. Point DNS records to Vercel

### 6.2 Update Environment Variables

If using custom domain, update:
```env
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

---

## Step 7: Monitoring & Logs

### 7.1 Vercel Logs

1. Go to Vercel dashboard
2. Click your project
3. View "Deployments" tab for build logs
4. View "Functions" tab for runtime logs

### 7.2 Railway Logs

1. Go to Railway dashboard
2. Click your project
3. View logs in real-time

### 7.3 Supabase Logs

1. Go to Supabase dashboard
2. Database → Logs
3. View SQL queries and errors

---

## Troubleshooting

### Build Fails on Vercel

```bash
# Check local build
npm run build

# If it fails locally, fix it first
# Then push to GitHub
# Vercel will auto-redeploy
```

### API Not Responding

1. Check Railway logs
2. Verify environment variables are set
3. Check Supabase connection string
4. Verify ANTHROPIC_API_KEY is set

### Frontend Can't Reach API

1. Check `NEXT_PUBLIC_API_URL` is correct
2. Verify Railway API is running
3. Check browser console for errors
4. Test API directly: `curl https://your-api.url/api/health`

### Database Connection Issues

```bash
# Test Supabase connection
psql "postgresql://your-connection-string"

# In Supabase dashboard:
# Database → Connection → Verify credentials
```

---

## Environment Variables Checklist

### Vercel (Frontend)
- [ ] `NEXT_PUBLIC_API_URL` = Railway API URL
- [ ] `NEXT_PUBLIC_SITE_URL` = Vercel domain

### Railway (Backend)
- [ ] `SUPABASE_URL` = Supabase project URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = Supabase key
- [ ] `ANTHROPIC_API_KEY` = Claude API key
- [ ] `TRADINGVIEW_MCP_URL` = Your MCP endpoint (or dummy)
- [ ] `NEXT_PUBLIC_API_URL` = Railway domain

### Supabase
- [ ] Database created
- [ ] Migrations applied
- [ ] Service role key saved

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Build fails | Check `npm run build` locally first |
| API 500 error | Check Supabase credentials in Railway |
| Metrics not loading | Verify `NEXT_PUBLIC_API_URL` points to Railway |
| Database query fails | Confirm migrations were applied |
| CORS error | Railway backend is handling CORS |

---

## Security Checklist

- [ ] Never commit `.env` files
- [ ] Use Vercel & Railway environment variables
- [ ] Rotate API keys after deployment
- [ ] Set up Supabase RLS policies (later)
- [ ] Enable HTTPS (automatic with Vercel)
- [ ] Set strong database password
- [ ] Keep API keys secret

---

## Next Steps After Deployment

1. ✅ Verify all systems working
2. 🔑 Implement authentication (optional)
3. 📊 Monitor performance
4. 🚀 Create first strategy
5. 📈 Run backtest
6. 🤖 Generate from AI
7. 📋 Start paper trading

---

## Quick Reference

| Service | URL | Purpose |
|---------|-----|---------|
| **Vercel** | https://vercel.com | Frontend hosting |
| **Railway** | https://railway.app | Backend API hosting |
| **Supabase** | https://supabase.com | Database |
| **Your Frontend** | https://your-domain.vercel.app | Admin dashboard |
| **Your Backend** | https://your-api.up.railway.app | REST API |

---

## Support Links

- Vercel Docs: https://vercel.com/docs
- Railway Docs: https://docs.railway.app
- Supabase Docs: https://supabase.com/docs
- Next.js Docs: https://nextjs.org/docs

---

**Everything is configured and ready to deploy!**

Just follow the steps above and your Bitiq Lab will be live on Vercel + Railway + Supabase.

Last Updated: April 2026
