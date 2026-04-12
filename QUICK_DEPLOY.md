# ⚡ Quick Deployment Guide (5 Minutes)

**TL;DR:** Deploy to Vercel + Railway + Supabase in 15 minutes.

## 🚀 The 5-Step Process

### Step 1: Create Supabase Project (3 min)

1. Go to https://supabase.com → Create Project
2. Fill in project name & password
3. Wait 5 minutes for setup
4. Copy these values from Settings → API:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

### Step 2: Apply Database Migrations (2 min)

In Supabase dashboard:
1. Click "SQL Editor"
2. Click "New Query"
3. Copy content from `migrations/001_initial_schema.sql`
4. Execute
5. Repeat for `002_paper_trading_tables.sql` and `003_audit_and_admin_tables.sql`

### Step 3: Deploy API to Railway (3 min)

1. Go to https://railway.app → Create Project
2. Select "Deploy from GitHub"
3. Choose `bitiqlab-v2` repo
4. Set Root Directory: `packages/api`
5. Add environment variables:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ANTHROPIC_API_KEY=sk-ant-xxx
   TRADINGVIEW_MCP_URL=http://localhost:8000
   NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app
   ```
6. Click "Deploy"
7. **Save the Railway URL** (you'll need it for frontend)

### Step 4: Deploy Frontend to Vercel (2 min)

1. Go to https://vercel.com → Add Project
2. Select `bitiqlab-v2` repo
3. Set Root Directory: `packages/web`
4. Add environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app
   NEXT_PUBLIC_SITE_URL=https://your-vercel-url.vercel.app
   ```
5. Click "Deploy"

### Step 5: Verify Deployment (1 min)

```bash
# Test API
curl https://your-railway-url.up.railway.app/api/health

# Visit dashboard
# https://your-vercel-url.vercel.app
```

---

## 📋 What You Need Before Starting

- ✅ GitHub account (with this repo connected)
- ✅ Vercel account (connect with GitHub)
- ✅ Railway account (connect with GitHub)
- ✅ Supabase account
- ✅ Anthropic API key (`sk-ant-xxx`)

---

## 🔑 Environment Variables Needed

### Vercel (Frontend)
```env
NEXT_PUBLIC_API_URL=https://your-railway-api.up.railway.app
NEXT_PUBLIC_SITE_URL=https://your-vercel-url.vercel.app
```

### Railway (Backend)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=sk-ant-xxx
TRADINGVIEW_MCP_URL=http://localhost:8000
TRADINGVIEW_MCP_API_KEY=test-key
NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app
```

---

## ❓ Common Mistakes to Avoid

❌ **Don't** copy `NEXT_PUBLIC_API_URL` into Vercel as the same value as Railway  
✅ **Do** use your Railway API URL in Vercel's `NEXT_PUBLIC_API_URL`

❌ **Don't** deploy `packages/api` to Vercel directly  
✅ **Do** deploy it to Railway, and `packages/web` to Vercel

❌ **Don't** forget to apply database migrations  
✅ **Do** run all 3 migration SQL scripts in Supabase

❌ **Don't** commit `.env` files  
✅ **Do** use platform environment variables (Vercel & Railway dashboards)

---

## 🧪 Test After Deployment

### Test 1: API Health
```bash
curl https://your-railway-url.up.railway.app/api/health
# Should return: {"status":"ok",...}
```

### Test 2: Create Strategy
```bash
curl -X POST https://your-railway-url.up.railway.app/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test","symbol":"BTCUSDT","timeframe":"1h",
    "market_type":"spot","entry_rules":{"conditions":"RSI<30"},
    "exit_rules":{"stop_loss_percent":-2},"created_by":"test"
  }'
```

### Test 3: Dashboard
Visit https://your-vercel-url.vercel.app and check if metrics load.

---

## 🔗 URLs to Keep

Save these after deployment:

```
Vercel Frontend:    https://your-vercel-url.vercel.app
Railway Backend:    https://your-railway-url.up.railway.app
Supabase Console:   https://app.supabase.com/project/your-project
```

---

## 📞 If Something Goes Wrong

| Problem | Solution |
|---------|----------|
| Vercel build fails | Check `npm run build` works locally |
| Railway API errors | Check environment variables in Railway dashboard |
| Frontend can't reach API | Verify `NEXT_PUBLIC_API_URL` is correct in Vercel |
| Database errors | Confirm migrations were applied in Supabase |

---

## ✅ Success Checklist

- [ ] Supabase project created
- [ ] Database migrations applied
- [ ] Railway API deployed
- [ ] Vercel frontend deployed
- [ ] API health check passes
- [ ] Dashboard loads
- [ ] Can create a strategy
- [ ] Environment variables set in both services

---

**That's it! Your Bitiq Lab is now live! 🎉**

For detailed setup, see `VERCEL_SETUP.md`

Last Updated: April 2026
