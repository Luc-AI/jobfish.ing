# Company discovery from the Apify fallback job

**Date:** 2026-05-30
**Status:** Approved design, ready for implementation plan

## Goal

After each run of the Apify fallback scrape, determine which companies among the
newly fetched jobs are **not yet known** to the Supabase database (which is
otherwise fed from the Jobich API). Register any genuinely new company in a
canonical `companies` registry and send a dedicated daily email listing the
newly discovered companies.

## Background / current state

- Company is currently only a `text` column (`jobs.company`) on the `jobs`
  table. There is **no** dedicated companies entity.
- `jobs` is fed from the Jobich API via `src/trigger/sync-jobs.ts` (upsert on
  `url`).
- The Apify fallback job (`src/trigger/scrape-apify-fallback.ts`) is a scheduled
  task (cron `0 6 * * *`, Europe/Berlin) that runs two Apify actors (LinkedIn +
  career site), normalizes results, inserts them into the `apify_fallback_jobs`
  table, and already sends a jobs-summary email to `heer.luca@gmail.com` via
  Resend.
- Normalized Apify rows already expose a `company` field (extracted from
  `organization` / `company` / `company_name`). See `src/trigger/lib/apify.ts`.
- Supabase is accessed from trigger jobs via the service-role client in
  `src/lib/supabase/service.ts`.
- Resend is configured via `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
  (default `jobs@jobfish.ing`).

## Decisions (from brainstorming)

1. **Data model:** a canonical `companies` registry table (not a lightweight
   log, not notify-only).
2. **Matching:** normalized match — lowercase, trim, strip common legal suffixes
   and punctuation, collapse whitespace.
3. **Notification:** a **separate** dedicated daily email (distinct from the
   existing jobs-summary email).
4. **Jobich-side registration:** yes — `sync-jobs.ts` also registers companies,
   to keep the baseline honest.
5. **Empty days:** skip the email when zero new companies were discovered.

## Architecture

### 1. `companies` table (new migration)

```sql
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- original-cased display name as first seen
  name_normalized text not null unique,-- normalization key (see below)
  first_seen_source text not null,     -- 'jobich' | 'apify_linkedin' | 'apify_career_site'
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sample_job_url text                  -- one example job URL, for the email link
);
create index companies_first_seen_at_idx on companies (first_seen_at);
```

Add the table to `src/lib/supabase/types.ts` (`Database` typing) following the
existing pattern for `jobs` / `apify_fallback_jobs`.

### 2. Normalization helper — `src/lib/companies/normalize.ts`

Pure, unit-tested function `normalizeCompanyName(raw: string): string`:

1. Return `''` for nullish/blank input (callers skip empty results).
2. Lowercase and trim.
3. Strip a trailing legal suffix token: `gmbh, ag, llc, inc, ltd, sa, sàrl,
   sarl, co, corp, plc, bv, oy, aps, oyj, kg, ohg, se`. Match as a
   whole trailing token, optionally preceded by a comma.
4. Strip punctuation (keep letters/numbers/spaces, including accented letters).
5. Collapse internal whitespace to single spaces; trim again.

Example outcomes:

| Input                       | Normalized           |
| --------------------------- | -------------------- |
| `Google LLC`                | `google`             |
| `Google`                    | `google`             |
| `Google Switzerland GmbH`   | `google switzerland` |
| `ACME, Inc.`                | `acme`               |
| `acme ag`                   | `acme`               |

### 3. Registry upsert helper — `src/lib/companies/registry.ts`

A reusable function used by both ingest paths so logic stays in one place:

```ts
type CompanyObservation = {
  name: string            // raw company name
  source: string          // 'jobich' | 'apify_linkedin' | 'apify_career_site'
  sampleJobUrl?: string
}

// Returns the companies that were newly inserted by this call.
async function registerCompanies(
  supabase: ServiceClient,
  observations: CompanyObservation[],
): Promise<{ name: string; source: string; sampleJobUrl?: string }[]>
```

Behaviour:

1. Normalize each observation; drop blanks; de-duplicate within the batch by
   `name_normalized` (first occurrence wins for `name`/`source`/`sampleJobUrl`).
2. Query existing `companies` rows for the batch's `name_normalized` values.
3. For already-existing companies: bump `last_seen_at = now()`.
4. For new ones: insert with `first_seen_source = source`, `first_seen_at` and
   `last_seen_at = now()`, `sample_job_url = sampleJobUrl`.
5. Use an upsert on the unique `name_normalized` so concurrent runs / task
   retries never crash or double-insert. The "newly inserted" set is computed
   from the pre-insert existence check (intersected with the rows actually
   inserted) so retries don't re-report.
6. Return the newly inserted companies.

### 4. Apify fallback job changes — `src/trigger/scrape-apify-fallback.ts`

After the existing insert into `apify_fallback_jobs`:

1. Build `CompanyObservation[]` from this run's normalized rows, tagging
   `source` as `apify_linkedin` or `apify_career_site` per row, and
   `sampleJobUrl` from the row's `url`.
2. Call `registerCompanies(...)` → `newCompanies`.
3. If `newCompanies.length > 0`, send the dedicated discovery email (below).
4. Include the discovered count/list in the task's return value and logs.

The existing jobs-summary email is unchanged.

### 5. Jobich sync changes — `src/trigger/sync-jobs.ts`

After the existing job upsert, build `CompanyObservation[]` from the synced jobs
(`source = 'jobich'`, `sampleJobUrl` from job `url`) and call
`registerCompanies(...)`. Its return value is ignored here (no email on the
Jobich path). This keeps the baseline current so an Apify run never falsely
reports a company Jobich already knows.

### 6. Dedicated discovery email — `src/lib/email/company-discovery.tsx`

A new React Email component + a send helper, mirroring the existing email
helpers' structure and the Resend usage already in
`scrape-apify-fallback.ts`.

- **To:** `heer.luca@gmail.com` (same recipient as the existing summary; can be
  promoted to an env var later if desired — out of scope here).
- **From:** `RESEND_FROM_EMAIL` (default `jobs@jobfish.ing`).
- **Subject:** `Jobfish — N new compan{y|ies} discovered`.
- **Body:** one row per new company: display name, source label
  (LinkedIn / Career site), and a link to `sample_job_url` when present.
- **Sent only when** `newCompanies.length > 0` (empty-day suppression).
- Errors captured to Sentry and do not fail the task (consistent with the
  existing email error handling).

### Backfill

In the same migration (or a one-off script run once), seed `companies` from the
distinct existing `jobs.company` values with `first_seen_source = 'jobich'`,
`first_seen_at = now()`, normalized via the same rules. This must use the same
normalization as the runtime helper; if done in SQL, mirror the logic carefully,
otherwise prefer a small TS backfill script that imports
`normalizeCompanyName`. **Prefer the TS script** to guarantee identical
normalization.

## Data flow

```
Jobich API ──► sync-jobs.ts ──► upsert jobs
                           └──► registerCompanies(source=jobich)   [silent]

Apify actors ─► scrape-apify-fallback.ts ─► insert apify_fallback_jobs
                                       └──► registerCompanies(source=apify_*)
                                              └─► newCompanies
                                                    └─► (if >0) discovery email
```

## Error handling

- `registerCompanies` failures are caught and logged to Sentry; they must not
  abort the host task after jobs have already been written.
- Email send failures are caught and logged to Sentry; task still succeeds.
- Empty / null company names are skipped, never inserted.
- Upsert on `name_normalized` guarantees idempotency under retries.

## Testing

- **Unit:** `normalizeCompanyName` — suffix stripping, punctuation, accents,
  whitespace, blank input (table-driven, including the examples above).
- **Unit:** `registerCompanies` — batch de-dup, new-vs-existing partition,
  `last_seen_at` bump, idempotent re-run returns empty new-set
  (Supabase client mocked).
- **Component/render:** discovery email renders with 1 and N companies, and the
  source labels and sample links appear.
- Manual: trigger the Apify job in dev and confirm new companies are inserted
  and an email is produced only when there are discoveries.

## Out of scope (YAGNI)

- Fuzzy / trigram company matching.
- Joining `jobs` to `companies` via foreign key / backfilling `jobs.company_id`.
- A companies admin UI.
- Making the recipient configurable beyond the current hardcoded address.
```
