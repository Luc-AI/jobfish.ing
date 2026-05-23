ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS instant_alert_threshold float8;

ALTER TABLE job_evaluations
  ADD COLUMN IF NOT EXISTS instant_alerted_at timestamptz;
