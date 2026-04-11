-- supabase/migrations/0004_jobs_detail_columns.sql

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS date_posted        timestamptz    NULL,
  ADD COLUMN IF NOT EXISTS employment_type    text[]         NULL,
  ADD COLUMN IF NOT EXISTS work_arrangement   text           NULL,
  ADD COLUMN IF NOT EXISTS experience_level   text           NULL,
  ADD COLUMN IF NOT EXISTS job_language       text           NULL,
  ADD COLUMN IF NOT EXISTS working_hours      integer        NULL,
  ADD COLUMN IF NOT EXISTS source_domain      text           NULL,
  ADD COLUMN IF NOT EXISTS detail_facts       jsonb          NULL;
