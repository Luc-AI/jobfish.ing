# Apify Fallback Source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily scheduled Trigger.dev task that calls two Apify actors, logs results to a new Supabase table, and emails a summary to `heer.luca@gmail.com`.

**Architecture:** One scheduled task posts hardcoded JSON payloads to two Apify `run-sync-get-dataset-items` endpoints in parallel via `Promise.allSettled`, normalizes each item into a few searchable columns plus a `raw` jsonb blob, bulk-inserts into a new `apify_fallback_jobs` table, then sends a Resend HTML email. No dedup, no app-facing surfacing.

**Tech Stack:** Trigger.dev v4 (`schedules.task`), Supabase service-role client, Resend SDK, Vitest for unit tests.

**Related spec:** [docs/superpowers/specs/2026-05-28-apify-fallback-source-design.md](../specs/2026-05-28-apify-fallback-source-design.md)

---

## Task 0: Branch off `develop`

**Files:** none

- [ ] **Step 1: Create and switch to the feature branch**

```bash
git checkout develop
git pull --rebase
git checkout -b feature/apify-fallback-source
```

Expected: clean checkout on `feature/apify-fallback-source`.

---

## Task 1: Supabase migration for `apify_fallback_jobs`

**Files:**
- Create: `supabase/migrations/0015_apify_fallback_jobs.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0015_apify_fallback_jobs.sql` with this exact content:

```sql
-- supabase/migrations/0015_apify_fallback_jobs.sql
-- Internal-only log of jobs returned by the daily Apify fallback scrape.
-- Not exposed via API or RLS to client roles — service role only.

CREATE TABLE IF NOT EXISTS public.apify_fallback_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL CHECK (source IN ('linkedin', 'career_site')),
  fetched_at  timestamptz NOT NULL,
  title       text,
  company     text,
  location    text,
  url         text,
  raw         jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apify_fallback_jobs_fetched_at_idx
  ON public.apify_fallback_jobs (fetched_at DESC);

ALTER TABLE public.apify_fallback_jobs ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service role bypasses RLS,
-- anon/authenticated have zero access.
```

- [ ] **Step 2: Apply locally and verify the table exists**

```bash
npx supabase db reset --linked 2>/dev/null || npx supabase migration up
npx supabase db diff -f apify_fallback_jobs_check --schema public 2>&1 | head -5
```

Expected: migration applies cleanly; the new table is visible in Supabase Studio (`http://127.0.0.1:54323` if running locally) under `public.apify_fallback_jobs`.

If `supabase` CLI is not configured locally, skip and rely on the staging deploy to apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0015_apify_fallback_jobs.sql
git commit -m "feat: add apify_fallback_jobs table for daily fallback scrape"
```

---

## Task 2: Document `APIFY_API_TOKEN` in `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the line**

Append to `.env.example` (use `Edit` to insert near other third-party token vars; if no obvious anchor, append at end):

```
# Apify management token for the daily fallback scrape (scrape-apify-fallback task).
APIFY_API_TOKEN=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: document APIFY_API_TOKEN in .env.example"
```

---

## Task 3: Apify lib — payloads + client + normalizer (TDD)

**Files:**
- Create: `src/trigger/lib/apify.ts`
- Create: `src/test/apify-lib.test.ts`

The lib has zero Trigger.dev SDK imports — it's a pure HTTP client + pure pure-function normalizer. This is what the unit tests exercise.

### Step 1: Write the failing tests

Create `src/test/apify-lib.test.ts` with this exact content:

```ts
// src/test/apify-lib.test.ts
import { describe, expect, it } from 'vitest'
import { firstString, normalizeItem } from '@/trigger/lib/apify'

describe('firstString', () => {
  it('returns the first non-empty string match by candidate key order', () => {
    const obj = { a: '', b: 'hello', c: 'world' }
    expect(firstString(obj, ['a', 'b', 'c'])).toBe('hello')
  })

  it('skips missing keys', () => {
    expect(firstString({ b: 'hi' }, ['a', 'b'])).toBe('hi')
  })

  it('flattens string arrays by joining with ", "', () => {
    expect(firstString({ k: ['Zurich', 'Bern'] }, ['k'])).toBe('Zurich, Bern')
  })

  it('filters non-string entries out of arrays', () => {
    expect(firstString({ k: ['Zurich', 42, null, 'Bern'] }, ['k'])).toBe('Zurich, Bern')
  })

  it('returns null when no key has a usable value', () => {
    expect(firstString({ a: null, b: '', c: [] }, ['a', 'b', 'c'])).toBe(null)
  })

  it('returns null for an empty object', () => {
    expect(firstString({}, ['a', 'b'])).toBe(null)
  })
})

describe('normalizeItem', () => {
  it('normalizes a LinkedIn-shaped item', () => {
    const item = {
      title: 'Product Manager',
      organization: 'Acme AG',
      locations_derived: ['Zurich, Switzerland'],
      url: 'https://linkedin.com/jobs/123',
      description_text: 'long description',
      extra: 'ignored',
    }
    const row = normalizeItem('linkedin', item, '2026-05-28T04:00:00.000Z')
    expect(row).toEqual({
      source: 'linkedin',
      fetched_at: '2026-05-28T04:00:00.000Z',
      title: 'Product Manager',
      company: 'Acme AG',
      location: 'Zurich, Switzerland',
      url: 'https://linkedin.com/jobs/123',
      raw: item,
    })
  })

  it('normalizes a career-site-shaped item with fallback keys', () => {
    const item = {
      job_title: 'Product Owner',
      company_name: 'Foo GmbH',
      location: 'Zurich',
      job_url: 'https://careers.foo.com/abc',
    }
    const row = normalizeItem('career_site', item, '2026-05-28T04:00:00.000Z')
    expect(row.title).toBe('Product Owner')
    expect(row.company).toBe('Foo GmbH')
    expect(row.location).toBe('Zurich')
    expect(row.url).toBe('https://careers.foo.com/abc')
    expect(row.source).toBe('career_site')
  })

  it('returns null fields when extraction misses but always keeps raw', () => {
    const item = { weird_unknown_field: 'x' }
    const row = normalizeItem('linkedin', item, '2026-05-28T04:00:00.000Z')
    expect(row.title).toBe(null)
    expect(row.company).toBe(null)
    expect(row.location).toBe(null)
    expect(row.url).toBe(null)
    expect(row.raw).toEqual(item)
  })

  it('falls back to external_apply_url when url is missing', () => {
    const item = {
      title: 'X',
      organization: 'Y',
      external_apply_url: 'https://apply.example.com/x',
    }
    const row = normalizeItem('linkedin', item, '2026-05-28T04:00:00.000Z')
    expect(row.url).toBe('https://apply.example.com/x')
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm vitest run src/test/apify-lib.test.ts`

Expected: FAIL — `Failed to resolve import "@/trigger/lib/apify"`.

### Step 3: Create the apify lib

Create `src/trigger/lib/apify.ts` with this exact content:

```ts
// src/trigger/lib/apify.ts
// Thin HTTP client + pure-function normalizer for the daily fallback scrape.
// No Trigger.dev SDK imports — this file is unit-testable in isolation.

export type ApifySource = 'linkedin' | 'career_site'

export interface ApifyFallbackRow {
  source: ApifySource
  fetched_at: string
  title: string | null
  company: string | null
  location: string | null
  url: string | null
  raw: Record<string, unknown>
}

export const APIFY_ACTORS: Record<ApifySource, string> = {
  linkedin: 'fantastic-jobs~advanced-linkedin-job-search-api',
  career_site: 'fantastic-jobs~career-site-job-listing-api',
}

export const LINKEDIN_PAYLOAD = {
  aiHasSalary: false,
  aiVisaSponsorshipFilter: false,
  descriptionType: 'text',
  directApply: false,
  excludeATSDuplicate: false,
  externalApplyUrl: false,
  includeAi: true,
  limit: 100,
  locationExclusionSearch: ['Germany', 'Italy', 'France', 'Austria'],
  locationSearch: ['Zurich'],
  noDirectApply: false,
  populateAiRemoteLocation: false,
  populateAiRemoteLocationDerived: false,
  populateExternalApplyURL: true,
  recruiterOnly: false,
  remote: false,
  removeAgency: false,
  timeRange: '24h',
  titleSearch: [
    'HR:*',
    'Organisationsentwicklung:*',
    'Product Manager',
    'Product Owner',
    'Produktmanager',
  ],
} as const

export const CAREER_SITE_PAYLOAD = {
  aiExperienceLevelFilter: ['0-2', '2-5', '5-10'],
  aiHasSalary: false,
  aiVisaSponsorshipFilter: false,
  aiWorkArrangementFilter: ['On-site', 'Hybrid', 'Remote OK'],
  descriptionType: 'text',
  includeAi: true,
  includeLinkedIn: true,
  limit: 100,
  locationExclusionSearch: ['Italy', 'Germany', 'France', 'Austria'],
  locationSearch: ['Zurich'],
  populateAiRemoteLocation: false,
  populateAiRemoteLocationDerived: false,
  'remote only (legacy)': false,
  removeAgency: false,
  timeRange: '24h',
  titleSearch: [
    'Product Manager',
    'Product Owner',
    'Produktmanager',
    'HR:*',
    'Organisationsentwicklung:*',
  ],
} as const

/**
 * Walks candidate keys in order, returns the first non-empty string value.
 * Arrays of strings are joined with ", " (non-strings dropped).
 */
export function firstString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.length > 0) return v
    if (Array.isArray(v)) {
      const joined = v.filter((x): x is string => typeof x === 'string' && x.length > 0).join(', ')
      if (joined.length > 0) return joined
    }
  }
  return null
}

const TITLE_KEYS = ['title', 'job_title'] as const
const COMPANY_KEYS = ['organization', 'company', 'company_name'] as const
const LOCATION_KEYS = [
  'locations_derived',
  'location',
  'locations_raw',
  'cities_derived',
] as const
const URL_KEYS = ['url', 'job_url', 'external_apply_url'] as const

export function normalizeItem(
  source: ApifySource,
  item: Record<string, unknown>,
  fetchedAt: string,
): ApifyFallbackRow {
  return {
    source,
    fetched_at: fetchedAt,
    title: firstString(item, TITLE_KEYS),
    company: firstString(item, COMPANY_KEYS),
    location: firstString(item, LOCATION_KEYS),
    url: firstString(item, URL_KEYS),
    raw: item,
  }
}

/**
 * Calls an Apify actor's run-sync-get-dataset-items endpoint with the given input.
 * Returns the dataset items array. Throws on non-2xx or non-array responses
 * so the caller can isolate per-actor failures.
 */
export async function runActor(
  actorSlug: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error('APIFY_API_TOKEN is not set')

  const url = `https://api.apify.com/v2/actors/${actorSlug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Apify actor ${actorSlug} failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error(`Apify actor ${actorSlug} returned non-array response`)
  }
  return data as Record<string, unknown>[]
}
```

> **Note on the actor URL:** We use the `/v2/actors/<slug>/...` path to match the URLs you provided. Apify also accepts `/v2/acts/<slug>/...` — both resolve identically.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run src/test/apify-lib.test.ts`

Expected: PASS — all `firstString` and `normalizeItem` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/lib/apify.ts src/test/apify-lib.test.ts
git commit -m "feat: apify lib with payloads, runActor, and normalizer"
```

---

## Task 4: The scheduled task `scrape-apify-fallback`

**Files:**
- Create: `src/trigger/scrape-apify-fallback.ts`

This task has no unit test (matches the existing convention for thin task wrappers like `sync-jobs.ts`). The Trigger.dev dashboard's manual-run capability is the integration test.

### Step 1: Create the task file

Create `src/trigger/scrape-apify-fallback.ts` with this exact content:

```tsx
// src/trigger/scrape-apify-fallback.ts
import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import {
  APIFY_ACTORS,
  CAREER_SITE_PAYLOAD,
  LINKEDIN_PAYLOAD,
  normalizeItem,
  runActor,
  type ApifyFallbackRow,
  type ApifySource,
} from './lib/apify'

const TO_EMAIL = 'heer.luca@gmail.com'

export const scrapeApifyFallbackTask = schedules.task({
  id: 'scrape-apify-fallback',
  cron: { pattern: '0 6 * * *', timezone: 'Europe/Berlin' },
  retry: { maxAttempts: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000 },
  run: async () => {
    const fetchedAt = new Date().toISOString()
    const sources: ApifySource[] = ['linkedin', 'career_site']
    const payloads = { linkedin: LINKEDIN_PAYLOAD, career_site: CAREER_SITE_PAYLOAD }

    const settled = await Promise.allSettled(
      sources.map(s => runActor(APIFY_ACTORS[s], payloads[s])),
    )

    const rows: ApifyFallbackRow[] = []
    const errors: { source: ApifySource; message: string }[] = []

    settled.forEach((result, idx) => {
      const source = sources[idx]
      if (result.status === 'fulfilled') {
        for (const item of result.value) {
          rows.push(normalizeItem(source, item, fetchedAt))
        }
      } else {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
        errors.push({ source, message })
        Sentry.captureException(result.reason, {
          tags: { task: 'scrape-apify-fallback', source },
        })
      }
    })

    if (rows.length > 0) {
      const supabase = createServiceClient()
      const { error } = await supabase.from('apify_fallback_jobs').insert(rows)
      if (error) {
        Sentry.captureException(new Error(`apify_fallback_jobs insert failed: ${error.message}`))
      }
    }

    await sendSummaryEmail({ rows, errors, fetchedAt }).catch(err => {
      Sentry.captureException(err)
    })

    console.log(
      `scrape-apify-fallback: ${rows.length} jobs (linkedin: ${rows.filter(r => r.source === 'linkedin').length}, career_site: ${rows.filter(r => r.source === 'career_site').length}), errors: ${errors.length}`,
    )
    return { inserted: rows.length, errors: errors.length }
  },
})

interface SummaryArgs {
  rows: ApifyFallbackRow[]
  errors: { source: ApifySource; message: string }[]
  fetchedAt: string
}

async function sendSummaryEmail({ rows, errors, fetchedAt }: SummaryArgs) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY environment variable is not set')

  const resend = new Resend(apiKey)
  const dateLabel = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(fetchedAt))

  const subject = `Apify fallback — ${rows.length} jobs (${dateLabel})`

  const linkedinRows = rows.filter(r => r.source === 'linkedin')
  const careerRows = rows.filter(r => r.source === 'career_site')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px;">
      <h2 style="margin-bottom: 8px;">Apify fallback — ${dateLabel}</h2>
      <p style="color: #555; margin-top: 0;">${rows.length} jobs total · LinkedIn: ${linkedinRows.length} · Career sites: ${careerRows.length}</p>
      ${renderErrorBanner(errors)}
      ${renderSection('LinkedIn', linkedinRows)}
      ${renderSection('Career sites', careerRows)}
    </div>
  `

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
    to: TO_EMAIL,
    subject,
    html,
  })
}

function renderErrorBanner(errors: { source: ApifySource; message: string }[]): string {
  if (errors.length === 0) return ''
  const lines = errors
    .map(e => `<li><strong>${e.source}</strong>: ${escapeHtml(e.message)}</li>`)
    .join('')
  return `
    <div style="background:#fff4f4; border:1px solid #f5c2c2; padding:12px; border-radius:6px; margin: 12px 0;">
      <strong style="color:#a40000;">Actor failures</strong>
      <ul style="margin: 6px 0 0 18px;">${lines}</ul>
    </div>
  `
}

function renderSection(title: string, rows: ApifyFallbackRow[]): string {
  if (rows.length === 0) {
    return `<h3 style="margin-top: 20px;">${title}</h3><p style="color:#777;">(no jobs returned)</p>`
  }
  const items = rows
    .map(r => {
      const t = r.title ?? '(no title)'
      const titleHtml = r.url
        ? `<a href="${escapeAttr(r.url)}">${escapeHtml(t)}</a>`
        : escapeHtml(t)
      const company = escapeHtml(r.company ?? '(no company)')
      const loc = escapeHtml(r.location ?? '(no location)')
      return `<li>${titleHtml} — ${company} — ${loc}</li>`
    })
    .join('')
  return `<h3 style="margin-top: 20px;">${title}</h3><ul style="line-height: 1.6;">${items}</ul>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`

Expected: PASS — no type errors. If errors appear, fix imports/types in the new file.

- [ ] **Step 3: Run the full vitest suite (sanity)**

Run: `pnpm test:run`

Expected: PASS — all existing tests still green and the new `apify-lib.test.ts` passes.

- [ ] **Step 4: Commit**

```bash
git add src/trigger/scrape-apify-fallback.ts
git commit -m "feat: daily Apify fallback scrape task with email summary"
```

---

## Task 5: Local smoke test via the Trigger.dev dev CLI

**Files:** none

The cron only fires in production for the latest deployment, so we test by triggering manually.

- [ ] **Step 1: Make sure `APIFY_API_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and Supabase service env vars are present locally**

```bash
grep -E "^(APIFY_API_TOKEN|RESEND_API_KEY|RESEND_FROM_EMAIL|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" .env.local | wc -l
```

Expected: `5`. If lower, pull missing values: `npx vercel env pull .env.local --yes`.

- [ ] **Step 2: Run Trigger.dev in dev mode**

```bash
npx trigger.dev@latest dev
```

Leave running in a side terminal. Wait until it prints `scrape-apify-fallback` in the registered tasks list.

- [ ] **Step 3: Trigger the task manually from the dashboard**

Open the dev environment in the Trigger.dev dashboard → Tasks → `scrape-apify-fallback` → **Test** → run with empty payload `{}`.

- [ ] **Step 4: Verify outputs**

- Trigger.dev dashboard: run completes with `{ inserted: N, errors: 0 or M }`.
- Supabase Studio (`select count(*), source from apify_fallback_jobs group by source;`): N rows with the expected source split.
- Inbox at `heer.luca@gmail.com`: subject `Apify fallback — N jobs (YYYY-MM-DD)` with both sections rendered.

If LinkedIn returns shapes whose fields don't match our `TITLE_KEYS`/`COMPANY_KEYS`/`LOCATION_KEYS`/`URL_KEYS`, the `raw` column captures everything — open one row, inspect the actual keys, and extend the candidate lists in `src/trigger/lib/apify.ts`. Re-run.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feature/apify-fallback-source
gh pr create --base develop --title "feat: apify fallback job source (daily cron)" --body "$(cat <<'EOF'
## Summary
- Daily Trigger.dev cron at 06:00 Europe/Berlin that POSTs to two Apify actors (LinkedIn search + career-site ATS), logs results to `apify_fallback_jobs`, and emails a summary to heer.luca@gmail.com.
- Internal-only — no app-facing UI, no entry into the main `jobs` pipeline.
- Spec: `docs/superpowers/specs/2026-05-28-apify-fallback-source-design.md`

## Test plan
- [ ] Migration applies cleanly in staging
- [ ] Manual run from Trigger.dev dashboard inserts rows into `apify_fallback_jobs`
- [ ] Summary email lands at heer.luca@gmail.com
- [ ] Per-actor failure handling: temporarily break one actor slug, confirm the other still saves + email shows the error banner

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope

- Promoting Apify-fallback jobs into the main `jobs` table — future decision.
- Google Drive / Sheets export — explicitly replaced by the Supabase table.
- Dedup across days — explicit non-goal (full snapshot per day).
- React Email template for the summary — kept as plain inline HTML since this is internal.

## Post-merge follow-ups

- Rotate the Apify token in the Apify dashboard (was shared in plaintext during planning).
- After the first real run, tune the candidate key lists in `src/trigger/lib/apify.ts` against actual returned fields.
