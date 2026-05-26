-- Add cv_summary column to store structured extraction of the raw CV text.
-- Populated by the summarize-cv Trigger.dev task after upload; used by evaluate-jobs
-- instead of the full cv_text to reduce token usage in AI scoring calls.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cv_summary jsonb;
