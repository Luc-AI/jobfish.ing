-- supabase/migrations/0016_companies.sql
-- Canonical registry of companies seen across all job sources.
-- Seeded from existing jobs.company (jobich baseline), then extended by the
-- daily Apify fallback scrape. Service-role only — not exposed to client roles.

CREATE TABLE IF NOT EXISTS public.companies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  name_normalized   text NOT NULL UNIQUE,
  first_seen_source text NOT NULL CHECK (
    first_seen_source IN ('jobich', 'apify_linkedin', 'apify_career_site')
  ),
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  sample_job_url    text
);

CREATE INDEX IF NOT EXISTS companies_first_seen_at_idx
  ON public.companies (first_seen_at DESC);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service role bypasses RLS,
-- anon/authenticated have zero access.
