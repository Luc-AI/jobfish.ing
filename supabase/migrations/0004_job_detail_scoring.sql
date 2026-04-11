-- supabase/migrations/0004_job_detail_scoring.sql

-- Wipe all existing evaluations (clean break — dimension keys are changing)
TRUNCATE TABLE public.job_evaluations;

-- Add detailed_reasoning column
ALTER TABLE public.job_evaluations
  ADD COLUMN IF NOT EXISTS detailed_reasoning jsonb NULL;
