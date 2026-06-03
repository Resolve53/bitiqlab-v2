-- User profiles linked to Supabase Auth (auth.users)
-- Run in Supabase SQL editor after enabling Email auth in Authentication settings.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_username_lower_unique UNIQUE (lower(username))
);

CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Resolve login username -> auth email (used by backend with service role)
CREATE OR REPLACE FUNCTION public.profile_email_for_username(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE lower(p.username) = lower(trim(p_username))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.profile_email_for_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_email_for_username(TEXT) TO service_role;
