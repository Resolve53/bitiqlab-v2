-- Run AFTER 007_user_profiles.sql succeeds.
-- Links a user you already created in Supabase Authentication → Users.
--
-- 1. Supabase Dashboard → Authentication → Users → copy the user's UUID
-- 2. Replace the placeholders below and run this script once.

INSERT INTO public.profiles (id, username, display_name)
VALUES (
  'PASTE-USER-UUID-HERE',  -- e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890
  'admin',                 -- username you will type on /login (lowercase recommended)
  'Admin'
)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name;
