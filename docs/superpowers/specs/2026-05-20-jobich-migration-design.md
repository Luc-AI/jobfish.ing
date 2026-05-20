# Design: Replace Apify with Jobich Partner API

**Date:** 2026-05-20
**Status:** Approved — ready for implementation planning

---

## Overview

Replace Apify (pay-per-result scraping) with the Jobich Partner API (`jobich.ch`), a curated database of ~15K active Swiss jobs refreshed daily. The switch eliminates per-result cost constraints, enables proper delta-based sync, and introduces per-user pre-filtering before AI evaluation — reducing unnecessary AI calls significantly.

**Scope:** Swiss jobs only. Intentional for launch.

---

## Architecture

```
sync-jobs (hourly, Trigger.dev scheduled)
  └─ GET /api/v1/jobs/changes?since=<last_synced_at>
  └─ upsert added jobs → jobs table (HTML stripped on ingest)
  └─ soft-delete removed jobs (is_active = false)
  └─ store server_time → sync_state.last_synced_at
  └─ if new jobs exist → trigger evaluate-jobs(newJobIds)

evaluate-jobs (triggered by sync-jobs)
  └─ fetch new jobs by IDs
  └─ fetch all active users + preferences
  └─ FOR each user:
       candidate_jobs = pre_filter(new_jobs, user.prefs)
       FOR each candidate_job:
         → AI evaluate → store job_evaluation

notify-users (daily 8am Europe/Zurich, unchanged)
  └─ collect unevaluated evaluations above threshold
  └─ send email digest via Resend
```

**Key changes vs. today:**
- One delta sync call replaces two Apify actor calls
- Evaluation loop inverted: per-user first, jobs second
- Pre-filter gates before AI (no Apify-era "evaluate everything" waste)
- `sync_state` table holds the delta cursor
- Jobs soft-deleted instead of accumulating stale data

---

## Pre-filter Logic

Applied per user before any AI call. Two hard exclusion gates only:

```
candidate_jobs = new_jobs WHERE:
  1. job.company NOT IN user.excluded_companies
  2. job.industry NOT IN user.excluded_industries
     (jobs with industry = NULL or "Other" always pass through)
```

**Why only exclusions, not inclusions:**
- Inclusion filters (target roles, target industries) risk false negatives due to
  multilingual Swiss job titles (French/German) and inconsistent Jobich industry
  classification. The AI handles these naturally.
- Exclusion filters are safe — a user who blocks "Pharma" will never want a Pharma job
  regardless of title language or industry label edge cases.

**AI context (soft signals, not hard gates):**
`target_roles`, `target_industries`, `locations`, `remote_type` are all passed to the
evaluation prompt as preference context. The AI scores accordingly.

---

## Database Schema

### Migration 0007 — clean slate + schema update

```sql
-- Clean slate (Apify data incompatible with Jobich structure)
TRUNCATE user_job_actions, job_evaluations, jobs RESTART IDENTITY CASCADE;

-- jobs: add Jobich fields
ALTER TABLE jobs
  ADD COLUMN external_id    UUID        UNIQUE,       -- Jobich stable UUID (delta key)
  ADD COLUMN is_active      BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN remote_type    TEXT        NULL,          -- "Remote" | "Hybrid" | "Onsite"
  ADD COLUMN industry       TEXT        NULL,          -- from Jobich
  ADD COLUMN job_updated_at TIMESTAMPTZ NULL;          -- Jobich's last-confirmed-active

-- jobs: drop Apify-only columns that have no Jobich equivalent
ALTER TABLE jobs
  DROP COLUMN work_arrangement;   -- replaced by remote_type

-- jobs: fix date_posted type (was timestamptz, Jobich only provides a date; data truncated above so safe)
ALTER TABLE jobs
  ALTER COLUMN date_posted TYPE DATE USING NULL;

-- jobs: rename scraped_at → synced_at to reflect new source
ALTER TABLE jobs
  RENAME COLUMN scraped_at TO synced_at;

-- jobs: keep for future data sources (nullable, not populated by Jobich)
-- employment_type text[], experience_level text, job_language text,
-- working_hours integer, source_domain text, detail_facts jsonb
-- These columns are retained as-is.

-- Indexes
CREATE INDEX ON jobs (external_id) WHERE is_active = true;
CREATE INDEX ON jobs (is_active);

-- preferences: rename industries → target_industries, add excluded_industries
ALTER TABLE preferences
  RENAME COLUMN industries TO target_industries;

ALTER TABLE preferences
  ADD COLUMN excluded_industries TEXT[] DEFAULT '{}';

-- Sync cursor (single-row table, key = 'jobich')
CREATE TABLE sync_state (
  key            TEXT PRIMARY KEY DEFAULT 'jobich',
  last_synced_at TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### jobs table — final field list

| Column | Type | Source | Notes |
|---|---|---|---|
| `id` | `uuid PK` | generated | internal |
| `external_id` | `uuid UNIQUE NOT NULL` | `data[].id` | Jobich UUID — delta sync key |
| `title` | `text NOT NULL` | `data[].title` | |
| `company` | `text NOT NULL` | `data[].company` | |
| `location` | `text` | `data[].location` | raw string — no normalisation |
| `remote_type` | `text` | `data[].remote_type` | Remote / Hybrid / Onsite |
| `description` | `text` | `data[].description` | **HTML stripped on ingest** |
| `url` | `text UNIQUE NOT NULL` | `data[].url` | apply link |
| `date_posted` | `date NULL` | `data[].posted_at` | NULL when not valid ISO date |
| `job_updated_at` | `timestamptz` | `data[].updated_at` | always valid — use for sorting |
| `source` | `text NOT NULL` | `data[].source` | "Workday (Richemont)" etc. |
| `industry` | `text` | `data[].industry` | "IT & Software", "Other" etc. |
| `is_active` | `boolean DEFAULT true` | — | soft delete flag |
| `synced_at` | `timestamptz DEFAULT now()` | — | renamed from `scraped_at` — when we last ingested this job |
| `employment_type` | `text[]` | — | reserved, NULL for now |
| `experience_level` | `text` | — | reserved, NULL for now |
| `job_language` | `text` | — | reserved, NULL for now |
| `working_hours` | `integer` | — | reserved, NULL for now |
| `source_domain` | `text` | — | reserved, NULL for now |
| `detail_facts` | `jsonb` | — | reserved, NULL for now |

**`date_posted` fallback:** Use `COALESCE(date_posted, job_updated_at::date)` at query
time for recency sorting. Never fabricate dates in storage.

### preferences table — changed fields

| Column | Change | Notes |
|---|---|---|
| `target_industries` | renamed from `industries` | soft signal — passed to AI prompt |
| `excluded_industries` | new `text[] DEFAULT '{}'` | hard pre-filter gate |

---

## New / Modified / Deleted Files

### Create
- `src/trigger/lib/jobich.ts` — Jobich API client, normaliser, HTML stripper
- `src/trigger/sync-jobs.ts` — replaces scrape-jobs + scrape-jobs-initial

### Modify
- `src/trigger/evaluate-jobs.ts` — invert loop, add pre-filter, update preference fields
- `src/trigger/lib/evaluate.ts` — update `EvaluationInput`: `industries` → `target_industries`
- `src/lib/supabase/types.ts` — regenerate or manually update types
- `src/lib/supabase/queries.ts` — add `is_active = true` filter, update field names
- `src/components/features/preferences-form.tsx` — rename industries field, add excluded_industries UI
- `src/components/features/onboarding-wizard.tsx` — same UI updates
- `src/app/(app)/preferences/actions.ts` — update save action field names
- `src/app/api/onboarding/complete/route.ts` — update field names

### Delete
- `src/trigger/lib/apify.ts`
- `src/trigger/scrape-jobs.ts`
- `src/trigger/scrape-jobs-initial.ts`

### Environment variables
- Remove: `APIFY_API_TOKEN`
- Add: `JOBICH_API_KEY=sk_val_1b8edbe27f5b3a42883b0e436a09fb1c`

---

## Jobich API Client (`src/trigger/lib/jobich.ts`)

Responsibilities:
- `fetchDelta(since: string)` — calls `/api/v1/jobs/changes?since=<since>`, returns `{ added, updated, removed, server_time }`
- `normalizeJobichJob(raw)` — maps Jobich fields to `NormalizedJob`, strips HTML from description, parses `date_posted` (null on failure)
- Type definitions: `JobichJob`, `DeltaResponse`, `NormalizedJob`

HTML stripping: plain string replacement (strip tags). No external dependency needed — a single regex or lightweight utility is sufficient.

---

## sync-jobs Task

Replaces both `scrape-jobs.ts` (hourly scheduled) and `scrape-jobs-initial.ts` (per-user onboarding trigger).

**Scheduled run (hourly):**
1. Read `last_synced_at` from `sync_state`. If no row exists, use `now() - 24h` as bootstrap.
2. Call `fetchDelta(last_synced_at)`
3. Upsert `added` jobs by `external_id` (ON CONFLICT DO UPDATE description, title, etc.)
4. Soft-delete `removed` jobs: `UPDATE jobs SET is_active = false WHERE external_id = ANY(removedIds)`
5. Store `server_time` → `sync_state.last_synced_at`
6. If `added.length > 0`: trigger `evaluate-jobs({ jobIds: newIds })`

**Backfill (new user):** On onboarding completion, trigger `evaluate-jobs({ userIds: [newUserId] })` with no `jobIds` — evaluate-jobs handles the "no jobIds" case by fetching the 100 most recent active jobs.

---

## evaluate-jobs Task (restructured)

**Payload:** `{ jobIds?: string[], userIds?: string[] }`

```
1. Fetch jobs (by jobIds if provided, else 100 most recent active jobs)
2. Fetch active users with complete profiles
   (filter to userIds if provided)
3. FOR each user:
   a. Fetch user preferences
   b. Pre-filter jobs:
      - exclude jobs where company IN excluded_companies
      - exclude jobs where industry IN excluded_industries
        (pass through if industry is NULL or "Other")
   c. FOR each candidate job:
      - Build evaluation prompt (pass target_roles, target_industries,
        locations as soft signals)
      - Call AI (OpenRouter, unchanged)
      - Store job_evaluation
      - On error: log + Sentry, continue (don't abort batch)
```

---

## notify-users Task

No structural changes. Minor update: remove `SOURCE_LABELS` map entries for Apify sources
(linkedin, jobs.ch) and replace with a generic fallback — Jobich source strings like
"Workday (Richemont)" are already human-readable.

---

## UI Changes

**Preferences form + Onboarding wizard:**
- Rename "Industries" field label → "Preferred Industries" (field: `target_industries`)
- Add new field "Industries to avoid" (field: `excluded_industries`)
- Both use the same multi-select component pattern

**Dashboard / Job detail:**
- Filter all job queries to `is_active = true`
- Remove any UI that referenced `detail_facts`, `work_arrangement`, `experience_level`
  (these columns are now NULL and were not displayed as structured data in the UI)
- Use `COALESCE(date_posted, job_updated_at::date)` for date display

---

## Backlog (out of scope for this release)

1. **Handle `updated` jobs** from delta sync — re-sync description, optionally re-evaluate
2. **Role keyword pre-filter** — language mismatch risk with French/German titles. Workaround: users add multilingual role keywords as separate entries (e.g. "Enterprise Architect" + "Architecte d'entreprise")
3. **`remote_type` pre-filter** — defer until scaling requires it

---

## Out of Scope

- Non-Swiss job sources
- Per-user delta sync / search queries (rejected: rate limit risk)
- Re-evaluation of updated jobs (backlogged)
- Description storage as HTML (stripped on ingest — plain text only)
