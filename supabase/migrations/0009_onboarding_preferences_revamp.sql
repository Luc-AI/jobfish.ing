ALTER TABLE preferences
  ADD COLUMN IF NOT EXISTS preferred_languages text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS company_sizes text[] NOT NULL DEFAULT '{}';
