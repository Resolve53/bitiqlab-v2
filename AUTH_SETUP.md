# Bitiq Lab — Username & password login

## Overview

- **Sign in** at `/login` with **username** + **password**
- **Sign out** from the sidebar (“Sign out”)
- Accounts live in **Supabase Auth**; usernames are stored in `public.profiles`

## 1. Supabase setup

1. Open your Supabase project → **SQL Editor** → run `migrations/007_user_profiles.sql`
2. **Authentication** → **Providers** → enable **Email**
3. For internal tools, you can disable “Confirm email” under Email provider settings

## 2. Environment variables

### Railway (backend `bitiqlab-v2`)

| Variable | Required | Notes |
|----------|----------|--------|
| `SUPABASE_URL` | Yes | Already used for DB |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Already used for DB |
| `SUPABASE_ANON_KEY` | Yes | **Add** from Supabase → Settings → API |
| `AUTH_REQUIRED` | Optional | `true` (default when keys set) forces API login |
| `ALLOW_PUBLIC_SIGNUP` | Optional | `true` to allow `/register` |
| `AUTH_BOOTSTRAP_SECRET` | Optional | One-time first-user creation (see below) |

### Vercel (frontend)

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_ALLOW_SIGNUP` | Optional | `true` to show “Create account” on login |
| `NEXT_PUBLIC_API_URL` | Yes | Railway URL (rewrites proxy `/api`) |

Redeploy **both** Railway and Vercel after changing env vars.

## 3. Create your first user

### Option A — Bootstrap API (recommended)

1. Set `AUTH_BOOTSTRAP_SECRET` on Railway to a long random string
2. Run once (replace values):

```bash
curl -X POST "https://bitiqlab-v2-production.up.railway.app/api/auth/bootstrap" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: YOUR_SECRET" \
  -d '{"username":"admin","password":"YourSecurePassword123!"}'
```

3. Remove or rotate `AUTH_BOOTSTRAP_SECRET` after success
4. Sign in at `https://your-app.vercel.app/login`

### Option B — Supabase Dashboard

1. **Authentication** → **Users** → **Add user** → set email + password
2. Copy the user **UUID**
3. SQL Editor:

```sql
INSERT INTO public.profiles (id, username, display_name)
VALUES ('PASTE-USER-UUID', 'admin', 'Admin');
```

3. Sign in with username `admin` and the password you set in Supabase

### Option C — Public registration

Set on Railway: `ALLOW_PUBLIC_SIGNUP=true`  
Set on Vercel: `NEXT_PUBLIC_ALLOW_SIGNUP=true`  
Users can register at `/register`.

## 4. TradingView webhook

`POST /api/paper-trading/tradingview-webhook` stays **public** (no login). Protect it with a shared secret in your TradingView alert URL if needed.

## 5. Disable auth (development only)

Railway: `AUTH_REQUIRED=false`  
APIs work without a token; the frontend still redirects to `/login` unless you skip `AuthProvider` locally.
