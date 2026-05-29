-- supabase/migrations/0015_apify_fallback_jobs.sql
-- Internal-only log of jobs returned by the daily Apify fallback scrape.
-- Not exposed via API or RLS to client roles — service role only.

CREATE TABLE IF NOT EXISTS public.apify_fallback_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL CHECK (source IN ('linkedin', 'career_site')),
  fetched_at  timestamptz NOT NULL,
  title       text,
  company     text,
  location    text,
  url         text,
  raw         jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apify_fallback_jobs_fetched_at_idx
  ON public.apify_fallback_jobs (fetched_at DESC);

ALTER TABLE public.apify_fallback_jobs ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service role bypasses RLS,
-- anon/authenticated have zero access.
