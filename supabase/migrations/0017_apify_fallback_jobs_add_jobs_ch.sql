-- supabase/migrations/0017_apify_fallback_jobs_add_jobs_ch.sql
-- Add jobs.ch as a third Apify fallback source.
-- Widens two CHECK constraints to accept the new source value:
--   1. apify_fallback_jobs.source        -> 'jobs_ch'      (the scraped rows)
--   2. companies.first_seen_source       -> 'apify_jobs_ch' (company discovery
--      feeds every fallback source into the registry)

ALTER TABLE public.apify_fallback_jobs
  DROP CONSTRAINT IF EXISTS apify_fallback_jobs_source_check;
ALTER TABLE public.apify_fallback_jobs
  ADD CONSTRAINT apify_fallback_jobs_source_check
  CHECK (source IN ('linkedin', 'career_site', 'jobs_ch'));

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_first_seen_source_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_first_seen_source_check
  CHECK (first_seen_source IN ('jobich', 'apify_linkedin', 'apify_career_site', 'apify_jobs_ch'));
