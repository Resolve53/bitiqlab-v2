# Bitiq Lab — Login (Supabase Auth)

## Simple setup (recommended)

1. **Supabase → Authentication → Users** → add user with **email + password**
2. **Railway** env (same Supabase project):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY` ← required for login
3. Redeploy **Railway** and **Vercel**
4. Open your app **`/login`** → sign in with that **email** and **password**

You do **not** need the `profiles` table or extra SQL for login.

---

## Optional: profiles / username

Only if you want a login alias like `admin` instead of email — run `migrations/007_user_profiles.sql` and link the user. Normal use is **email + password only**.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| Invalid email or password | Use the **exact email** from Supabase Auth (not only a display name). Reset password in Supabase → Users. |
| Auth not configured (503) | Add `SUPABASE_ANON_KEY` on Railway and redeploy. |
| Email not confirmed | Confirm user in Supabase or disable “Confirm email” under Email provider. |

---

## Environment variables

**Railway:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, optional `AUTH_REQUIRED=true`

**Vercel:** `NEXT_PUBLIC_API_URL` (Railway URL; rewrites proxy `/api`)
