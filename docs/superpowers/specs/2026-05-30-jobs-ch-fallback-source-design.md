# Design: jobs.ch as a third Apify fallback source

**Date:** 2026-05-30
**Branch:** feature/jobs-ch-fallback-source
**Status:** Implemented

## Goal

Add jobs.ch as a third source to the daily Apify fallback scrape, fetching a
24h delta of knowledge-worker roles in Zurich. It runs alongside the existing
`linkedin` and `career_site` sources and lands in the same `apify_fallback_jobs`
table and daily summary email.

## Actor choice

`santamaria-automations/jobs-ch-scraper` — chosen over `unfenced-group/jobs-ch-scraper`
because it has a `publicationDate` 24h filter (essential for a daily delta),
strict canton resolution, a documented output schema, dedup across queries, and
a real track record (4.7 rating, 30 MAU) vs. the alternative's 0 reviews.

## Key constraint: separate Apify account / token

The jobs.ch actor lives under a **second Apify account**, so it needs a
**different API token** from the existing `linkedin`/`career_site` sources. This
is the main structural change: `runActor` must support a per-source token.

- New env var: `APIFY_API_TOKEN_JOBS_CH`.
  - Added to `.env.local` (local dev, gitignored).
  - **Must also be added to the Trigger.dev production env vars** (manual, by the
    user) — this task runs on Trigger.dev, not Vercel.
- Tokens are never written into committed source — only read from `process.env`.

## Changes

### 1. Database migration — `supabase/migrations/0017_apify_fallback_jobs_add_jobs_ch.sql`

The migration widens **two** CHECK constraints:

1. `apify_fallback_jobs.source` (migration 0015) — to accept `'jobs_ch'` rows.
2. `companies.first_seen_source` (migration 0016) — to accept `'apify_jobs_ch'`.

The second is required because company-discovery (now merged into `develop`)
feeds **every** fallback source into the company registry as
`apify_${source}` (`scrape-apify-fallback.ts`). Without it, jobs.ch rows would
fail company registration on every run. Migration number is **0017** — `0016`
is already taken by `companies.sql`, so reusing it would collide when develop
later merges to master.

### 2. `src/trigger/lib/apify.ts`

- Extend the union: `ApifySource = 'linkedin' | 'career_site' | 'jobs_ch'`.
- `APIFY_ACTORS.jobs_ch = 'santamaria-automations~jobs-ch-scraper'`.
- New per-source token-env map:
  ```ts
  export const APIFY_TOKEN_ENV: Record<ApifySource, string> = {
    linkedin: 'APIFY_API_TOKEN',
    career_site: 'APIFY_API_TOKEN',
    jobs_ch: 'APIFY_API_TOKEN_JOBS_CH',
  }
  ```
- `JOBS_CH_PAYLOAD` (exact body provided by user):
  ```ts
  export const JOBS_CH_PAYLOAD = {
    cantons: ['ZH'],
    includeJobDetails: true,
    maxConcurrency: 10,
    maxResultsPerQuery: 50,
    publicationDate: '1',
    searchQueries: ['Product Manager', 'Product Owner', 'Produktmanager', 'HR', 'Organisationsentwicklung'],
  } as const
  ```
  Note: the wildcard titles used by the other sources (`HR:*`,
  `Organisationsentwicklung:*`) become plain keywords — jobs.ch has no wildcard
  syntax; its semantic search handles broadening.
- Normalizer: jobs.ch's `title`/`company`/`location` already match existing
  candidate keys. Only the URL differs. Extend `URL_KEYS`:
  ```ts
  const URL_KEYS = ['url', 'job_url', 'external_apply_url', 'source_url', 'apply_url'] as const
  ```
- `runActor` signature becomes
  `runActor(actorSlug, payload, tokenEnvVar = 'APIFY_API_TOKEN')` — reads
  `process.env[tokenEnvVar]`, keeps its existing "not set" error (default keeps
  the existing test green; error message references the var name).

### 3. `src/trigger/scrape-apify-fallback.ts`

- Add `'jobs_ch'` to `sources` and `JOBS_CH_PAYLOAD` to `payloads`.
- Resolve the token per source via `APIFY_TOKEN_ENV[s]` when calling `runActor`.
- Replace the hardcoded `linkedin`/`career_site` email sections, counts, and log
  line with iteration over a `SOURCE_LABELS: Record<ApifySource, string>` map
  (`{ linkedin: 'LinkedIn', career_site: 'Career sites', jobs_ch: 'jobs.ch' }`).
  This removes the per-source duplication a third source would otherwise triple —
  a targeted cleanup justified by the change.

### 4. Tests — `src/test/apify-lib.test.ts`

TDD: add a failing `normalizeItem` test for a jobs.ch-shaped item (`source_url`
→ `url`, plus `title`/`company`/`location`), then add `source_url` to `URL_KEYS`
to make it green. The existing `external_apply_url` fallback test confirms key
ordering still holds.

### 5. Company registry (`src/lib/companies/`)

Company-discovery is merged into `develop` and the scrape task feeds all
fallback sources into the registry, so jobs.ch must flow through it cleanly:

- `registry.ts` — add `'apify_jobs_ch'` to the `CompanySource` union.
- `discovery-email.ts` — add an `apify_jobs_ch: 'jobs.ch'` label.

## Out of scope / non-changes

- No change to `runActor`'s HTTP logic (the generic client already handles any
  actor slug + array response).
- No change to the feed, notifications, or evaluation pipelines.

## Cost / risk

- Cost is trivial: `$0.05` actor start + a handful of jobs/day at 24h delta with
  details (~`$5`/1k detail pages). Effectively cents per day.
- Both jobs.ch actors are community-maintained (no SLA); per-source error
  isolation already exists via `Promise.allSettled`, so a jobs.ch failure won't
  break the other two sources or the summary email.
