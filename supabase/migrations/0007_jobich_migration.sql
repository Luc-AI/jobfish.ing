-- supabase/migrations/0007_jobich_migration.sql

-- Clean slate: Apify data is incompatible with Jobich structure
TRUNCATE user_job_actions, job_evaluations, jobs CASCADE;

-- jobs: add Jobich-specific columns
ALTER TABLE jobs
  ADD COLUMN external_id    UUID        UNIQUE,
  ADD COLUMN is_active      BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN remote_type    TEXT        NULL,
  ADD COLUMN industry       TEXT        NULL,
  ADD COLUMN job_updated_at TIMESTAMPTZ NULL;

-- jobs: drop Apify-only column replaced by remote_type
ALTER TABLE jobs
  DROP COLUMN work_arrangement;

-- jobs: fix date_posted type (was timestamptz, Jobich provides date only; safe after TRUNCATE)
ALTER TABLE jobs
  ALTER COLUMN date_posted TYPE DATE USING NULL;

-- jobs: rename scraped_at → synced_at
ALTER TABLE jobs
  RENAME COLUMN scraped_at TO synced_at;

-- Indexes for delta sync lookups and feed filtering
CREATE INDEX ON jobs (external_id) WHERE is_active = true;
CREATE INDEX ON jobs (is_active);

-- preferences: rename industries inclusion list → target_industries
ALTER TABLE preferences
  RENAME COLUMN industries TO target_industries;

-- preferences: add exclusion list (analogous to excluded_companies)
ALTER TABLE preferences
  ADD COLUMN excluded_industries TEXT[] DEFAULT '{}';

-- Cursor store: single row per source, key = 'jobich'
CREATE TABLE sync_state (
  key            TEXT PRIMARY KEY DEFAULT 'jobich',
  last_synced_at TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
