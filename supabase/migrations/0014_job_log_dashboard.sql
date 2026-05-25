-- supabase/migrations/0014_job_log_dashboard.sql
-- Schema additions for the job-log dashboard feature:
--   1. job_evaluations.read_at         — track when a user first views an evaluation
--   2. preferences.last_dashboard_visit_at — used for "new since last visit" badge logic
--   3. preferences.score_threshold     — per-user minimum score to show in the dashboard
--   4. job_evaluations.chips           — AI-generated keyword chips for quick scanning
--   5. Rename enum value 'hidden' → 'dismissed' in job_action_status

-- 1. Mark when the user read/viewed an evaluation
ALTER TABLE public.job_evaluations
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- 2. Track the user's last dashboard visit for "new since last visit" logic
ALTER TABLE public.preferences
  ADD COLUMN IF NOT EXISTS last_dashboard_visit_at timestamptz;

-- 3. Per-user minimum score threshold for the dashboard feed (default 7.0)
ALTER TABLE public.preferences
  ADD COLUMN IF NOT EXISTS score_threshold numeric(4,1) DEFAULT 7.0;

-- 4. AI-generated keyword chips for at-a-glance job scanning
ALTER TABLE public.job_evaluations
  ADD COLUMN IF NOT EXISTS chips jsonb;

-- 5. Rename 'hidden' → 'dismissed' in the job_action_status enum
--    Postgres supports this directly without a data migration.
ALTER TYPE public.job_action_status RENAME VALUE 'hidden' TO 'dismissed';
