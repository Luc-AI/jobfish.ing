-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  cv_text text,
  threshold numeric(3,1) DEFAULT 7.0 CHECK (threshold >= 0 AND threshold <= 10),
  notifications_enabled boolean DEFAULT true,
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- PREFERENCES
-- ============================================================
CREATE TABLE public.preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  target_roles text[] DEFAULT '{}',
  industries text[] DEFAULT '{}',
  locations text[] DEFAULT '{}',
  excluded_companies text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON public.preferences FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- JOBS (shared, read-only for users)
-- ============================================================
CREATE TABLE public.jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  company text NOT NULL,
  location text,
  url text UNIQUE NOT NULL,
  source text NOT NULL,
  description text,
  scraped_at timestamptz DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read jobs"
  ON public.jobs FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- JOB EVALUATIONS (central table)
-- ============================================================
CREATE TABLE public.job_evaluations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  score numeric(3,1) NOT NULL CHECK (score >= 0 AND score <= 10),
  reasoning text,
  dimensions jsonb,
  notified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_id, user_id)
);

ALTER TABLE public.job_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own evaluations"
  ON public.job_evaluations FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- USER JOB ACTIONS
-- ============================================================
CREATE TYPE public.job_action_status AS ENUM ('saved', 'hidden', 'applied');

CREATE TABLE public.user_job_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  status public.job_action_status NOT NULL,
  applied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, job_id)
);

ALTER TABLE public.user_job_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own job actions"
  ON public.user_job_actions FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE PROFILE + PREFERENCES ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- UPDATED_AT HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_preferences_updated_at ON public.preferences;
CREATE TRIGGER set_preferences_updated_at
  BEFORE UPDATE ON public.preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
