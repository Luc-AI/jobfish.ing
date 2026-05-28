# Apify Fallback Job Source — Design

**Date:** 2026-05-28
**Status:** Approved
**Author:** Luca (with Claude)

## Goal

Add a second, internal-only source of job data to complement the primary `jobich` feed. Apify's free tier offers two actors (LinkedIn job search + career-site ATS scraping) that we can call once per day to discover jobs the primary source may have missed.

This source is **not user-facing**. It feeds a daily email and a log table that I review manually. Whether to promote items into the main `jobs` pipeline is a later decision.

## Non-goals

- Not exposing these jobs in the dashboard or app.
- Not deduping against the existing `jobs` table.
- Not running any ML evaluation or categorization on the results.
- Not building a Google Sheets / Drive integration (we use Supabase instead).

## Scope

Single Trigger.dev scheduled task that:

1. POSTs two saved input payloads to the two Apify run-sync endpoints in parallel.
2. Inserts every returned item into a new Supabase table `apify_fallback_jobs`.
3. Emails a summary list to `heer.luca@gmail.com` via Resend.

That is the entire feature.

## Architecture

### Files

| File | Purpose |
|---|---|
| `src/trigger/scrape-apify-fallback.ts` | The scheduled task. Calls the lib, persists, emails. |
| `src/trigger/lib/apify.ts` | Thin client: actor IDs, payload constants, fetch wrapper. |
| `supabase/migrations/<ts>_apify_fallback_jobs.sql` | Creates the table + RLS. |
| `.env.example` | Documents `APIFY_TOKEN`. |

### Schedule

```ts
schedules.task({
  id: 'scrape-apify-fallback',
  cron: { pattern: '0 6 * * *', timezone: 'Europe/Berlin' },
  // ...
})
```

`Europe/Berlin` handles CET/CEST transitions automatically — task always fires at 06:00 local Zurich/Berlin time.

### Apify client (`src/trigger/lib/apify.ts`)

Exports:

- `APIFY_ACTORS` — record of actor slug → endpoint path.
- `LINKEDIN_PAYLOAD` and `CAREER_SITE_PAYLOAD` constants (the JSONs the user provided).
- `runActor(actorSlug, payload)` → calls `https://api.apify.com/v2/actors/<slug>/run-sync-get-dataset-items?token=<env>`, returns the parsed dataset array.

Token comes from `process.env.APIFY_TOKEN`. The function throws on non-2xx so the task can catch per-actor failures.

### Task flow (`src/trigger/scrape-apify-fallback.ts`)

```ts
export const scrapeApifyFallbackTask = schedules.task({
  id: 'scrape-apify-fallback',
  cron: { pattern: '0 6 * * *', timezone: 'Europe/Berlin' },
  retry: { maxAttempts: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000 },
  run: async () => {
    const fetchedAt = new Date().toISOString()
    const results = await Promise.allSettled([
      runActor('fantastic-jobs~advanced-linkedin-job-search-api', LINKEDIN_PAYLOAD)
        .then(items => ({ source: 'linkedin' as const, items })),
      runActor('fantastic-jobs~career-site-job-listing-api', CAREER_SITE_PAYLOAD)
        .then(items => ({ source: 'career_site' as const, items })),
    ])

    const rows: ApifyFallbackRow[] = []
    const errors: { source: string; message: string }[] = []

    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const item of r.value.items) {
          rows.push(normalizeItem(r.value.source, item, fetchedAt))
        }
      } else {
        const source = /* derived from order */
        errors.push({ source, message: String(r.reason) })
        Sentry.captureException(r.reason, { tags: { task: 'scrape-apify-fallback', source } })
      }
    }

    if (rows.length > 0) {
      const supabase = createServiceClient()
      const { error } = await supabase.from('apify_fallback_jobs').insert(rows)
      if (error) Sentry.captureException(error)
    }

    await sendSummaryEmail({ rows, errors, fetchedAt })

    return { inserted: rows.length, errors: errors.length }
  },
})
```

`Promise.allSettled` is fine here — neither call is `triggerAndWait` or `wait`, just normal HTTP, so the Trigger.dev "never wrap in Promise.all" rule does not apply.

### Normalization

Each actor returns items with slightly different keys. The normalizer extracts a best-effort `title`, `company`, `location`, `url` from each item and keeps the full raw object:

```ts
function normalizeItem(
  source: 'linkedin' | 'career_site',
  item: Record<string, unknown>,
  fetchedAt: string,
): ApifyFallbackRow {
  return {
    source,
    fetched_at: fetchedAt,
    title: firstString(item, ['title', 'job_title']),
    company: firstString(item, ['organization', 'company', 'company_name']),
    location: firstString(item, [
      'locations_derived', 'location', 'locations_raw', 'cities_derived',
    ]),
    url: firstString(item, ['url', 'job_url', 'external_apply_url']),
    raw: item,
  }
}
```

`firstString` walks the candidate keys, returns the first non-empty string value (flattens arrays by joining with `, `). Returns `null` if none match. The exact key lists will be tuned against the first run's actual output.

### Database

```sql
create table apify_fallback_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('linkedin', 'career_site')),
  fetched_at timestamptz not null,
  title text,
  company text,
  location text,
  url text,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

create index apify_fallback_jobs_fetched_at_idx on apify_fallback_jobs (fetched_at desc);

alter table apify_fallback_jobs enable row level security;
-- No policies: service role bypasses RLS; anon/authenticated have zero access.
```

No unique constraint — full daily snapshot. If a run partially fails we still keep what we got.

### Email

Sent via the existing Resend client. Plain HTML (no React Email template — internal-only, kept minimal).

- **From:** same sender already used by digests.
- **To:** `heer.luca@gmail.com`.
- **Subject:** `Apify fallback — N jobs (YYYY-MM-DD)` where N is total rows and the date is `fetchedAt` in Europe/Berlin.
- **Body structure:**
  - If `errors.length > 0`: a short red note listing which actor(s) failed.
  - Two sections (`LinkedIn`, `Career sites`) each with a `<ul>` of `Title — Company — Location` items. Title links to `url` when present.
  - Empty section gets `(no jobs returned)`.

### Secrets

- `APIFY_TOKEN` — new env var. Added to Vercel (preview + prod) and the Trigger.dev project. Documented in `.env.example`.
- The token Luca pasted in chat (`apify_api_vlc...`) should be rotated in the Apify dashboard since it was shared in plaintext. Mentioned as a post-merge follow-up.

## Error handling

| Failure mode | Behavior |
|---|---|
| One actor 5xx / timeout | Other actor's results still saved + emailed. Sentry captures the failure. Email shows error banner. |
| Both actors fail | Email still sent with both error lines and zero rows. Task returns `{ inserted: 0, errors: 2 }`. |
| Supabase insert fails | Sentry captures. Email still sent (it doesn't depend on the insert). Task does not retry — next-day run is the recovery. |
| Resend send fails | Trigger.dev retry (`maxAttempts: 2`) covers it. After exhaustion, Sentry has the trace. |

## Testing

- Unit tests for `normalizeItem` covering both actor shapes (use fixtures captured from a real run).
- Unit test for `firstString` with array/string/null inputs.
- No integration test against live Apify — too flaky/costly. The task is small enough that a manual first-run check from the Trigger.dev dashboard is acceptable verification.

## Open questions / follow-ups

- After first real run, tune the `firstString` candidate keys based on actual returned fields.
- If the LinkedIn actor returns >100 useful items per day, consider lifting `"limit": 100` or moving to multiple title-bucket runs.
- Decision on whether to promote items into the main `jobs` pipeline is deferred — out of scope here.

## Rollout

1. Land the migration in develop, run it locally, verify table exists.
2. Add `APIFY_TOKEN` to Vercel + Trigger.dev environments.
3. Deploy to staging, trigger the task manually from the Trigger.dev dashboard once, confirm email lands and rows appear.
4. Merge to master; the cron then takes over.
5. Rotate the Apify token (follow-up).
