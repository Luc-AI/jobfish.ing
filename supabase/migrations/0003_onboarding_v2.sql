-- Add name fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

-- Add remote preference to preferences
ALTER TABLE public.preferences
  ADD COLUMN IF NOT EXISTS remote_preference text DEFAULT 'hybrid'
    CHECK (remote_preference IN ('on-site', 'hybrid', 'remote-ok', 'remote-solely'));
