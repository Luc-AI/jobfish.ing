# Company Discovery from Apify Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each Apify fallback scrape, register any company not already known to the DB into a canonical `companies` table, and email a daily list of newly discovered companies.

**Architecture:** A normalized-name `companies` registry table is the source of truth for "known companies". A pure `normalizeCompanyName` helper and a shared `registerCompanies(supabase, observations)` helper (idempotent upsert on `name_normalized`) are called from both ingest paths — `sync-jobs` (jobich, silent) and `scrape-apify-fallback` (which then emails only the newly inserted companies). A one-off `backfill-companies` Trigger.dev task seeds the registry from existing `jobs.company` values so the baseline is correct before the first discovery run.

**Tech Stack:** Trigger.dev v4, Supabase service-role client, Resend SDK, Vitest.

**Related spec:** [docs/superpowers/specs/2026-05-30-company-discovery-design.md](../specs/2026-05-30-company-discovery-design.md)

**Branch:** `feature/company-discovery` (already created off `origin/develop`; the design doc is already committed on it).

---

## Task 1: `companies` table migration + Supabase types

**Files:**
- Create: `supabase/migrations/0016_companies.sql`
- Modify: `src/lib/supabase/types.ts:57` (insert a new table block after the `apify_fallback_jobs` block, before `job_evaluations`)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0016_companies.sql`:

```sql
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
```

- [ ] **Step 2: Add the `companies` table to the `Database` type**

In `src/lib/supabase/types.ts`, immediately after the closing `}` of the `apify_fallback_jobs` block (line 57, before `job_evaluations:`), insert:

```ts
      companies: {
        Row: {
          id: string
          name: string
          name_normalized: string
          first_seen_source: string
          first_seen_at: string
          last_seen_at: string
          sample_job_url: string | null
        }
        Insert: {
          id?: string
          name: string
          name_normalized: string
          first_seen_source: string
          first_seen_at?: string
          last_seen_at?: string
          sample_job_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          name_normalized?: string
          first_seen_source?: string
          first_seen_at?: string
          last_seen_at?: string
          sample_job_url?: string | null
        }
        Relationships: []
      }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors introduced; the table is referenced by later tasks).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0016_companies.sql src/lib/supabase/types.ts
git commit -m "feat: add companies registry table and types"
```

---

## Task 2: `normalizeCompanyName` helper

**Files:**
- Create: `src/lib/companies/normalize.ts`
- Test: `src/test/company-normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/company-normalize.test.ts`:

```ts
// src/test/company-normalize.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeCompanyName } from '@/lib/companies/normalize'

describe('normalizeCompanyName', () => {
  it.each([
    ['Google LLC', 'google'],
    ['Google', 'google'],
    ['Google Switzerland GmbH', 'google switzerland'],
    ['ACME, Inc.', 'acme'],
    ['acme ag', 'acme'],
    ['Foo Co Ltd', 'foo'],
    ['  Spaced   Out   AG ', 'spaced out'],
    ['Zürich Insurance SA', 'zürich insurance'],
  ])('normalizes %j -> %j', (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected)
  })

  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeCompanyName(null)).toBe('')
    expect(normalizeCompanyName(undefined)).toBe('')
    expect(normalizeCompanyName('   ')).toBe('')
  })

  it('does not strip a suffix that is the only token', () => {
    expect(normalizeCompanyName('SA')).toBe('sa')
  })

  it('preserves internal digits and letters', () => {
    expect(normalizeCompanyName('3M Company')).toBe('3m')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/company-normalize.test.ts`
Expected: FAIL — cannot resolve `@/lib/companies/normalize`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/companies/normalize.ts`:

```ts
// src/lib/companies/normalize.ts
// Pure normalization for company-name matching. Lowercases, strips punctuation
// and trailing legal-form suffixes, and collapses whitespace.

const LEGAL_SUFFIXES = new Set([
  'gmbh', 'ag', 'llc', 'inc', 'ltd', 'limited', 'sa', 'sarl', 'sàrl',
  'co', 'corp', 'corporation', 'plc', 'bv', 'oy', 'oyj', 'aps', 'kg',
  'ohg', 'se', 'srl', 'spa', 'nv',
])

export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return ''
  // Lowercase, replace any non-letter/non-digit/non-space with a space,
  // then collapse whitespace. Unicode-aware so accented letters survive.
  let s = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return ''

  const tokens = s.split(' ')
  // Strip trailing legal-form tokens (handles "Foo Co Ltd" -> "foo"),
  // but never reduce to zero tokens.
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop()
  }
  return tokens.join(' ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/company-normalize.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/companies/normalize.ts src/test/company-normalize.test.ts
git commit -m "feat: add normalizeCompanyName helper"
```

---

## Task 3: `registerCompanies` registry helper

**Files:**
- Create: `src/lib/companies/registry.ts`
- Test: `src/test/company-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/company-registry.test.ts`:

```ts
// src/test/company-registry.test.ts
import { describe, expect, it, vi } from 'vitest'
import { registerCompanies } from '@/lib/companies/registry'

function makeMockClient({ existing = [] as string[] } = {}) {
  const selectIn = vi.fn(async () => ({
    data: existing.map(name_normalized => ({ name_normalized })),
    error: null,
  }))
  const updateIn = vi.fn(async () => ({ error: null }))
  const upsert = vi.fn(async () => ({ error: null }))
  const from = vi.fn((table: string) => {
    if (table !== 'companies') throw new Error(`Unexpected table: ${table}`)
    return {
      select: () => ({ in: selectIn }),
      update: () => ({ in: updateIn }),
      upsert,
    }
  })
  return { client: { from } as any, from, selectIn, updateIn, upsert }
}

describe('registerCompanies', () => {
  it('returns [] and makes no calls for empty observations', async () => {
    const m = makeMockClient()
    const result = await registerCompanies(m.client, [])
    expect(result).toEqual([])
    expect(m.from).not.toHaveBeenCalled()
  })

  it('skips observations whose name normalizes to empty', async () => {
    const m = makeMockClient()
    const result = await registerCompanies(m.client, [
      { name: '   ', source: 'jobich' },
    ])
    expect(result).toEqual([])
    expect(m.from).not.toHaveBeenCalled()
  })

  it('inserts companies not already present and returns them', async () => {
    const m = makeMockClient({ existing: [] })
    const result = await registerCompanies(m.client, [
      { name: 'Acme AG', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' },
    ])
    expect(result).toEqual([
      { name: 'Acme AG', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' },
    ])
    expect(m.upsert).toHaveBeenCalledTimes(1)
    const [rows, opts] = m.upsert.mock.calls[0]
    expect(rows[0]).toMatchObject({
      name: 'Acme AG',
      name_normalized: 'acme',
      first_seen_source: 'apify_linkedin',
      sample_job_url: 'https://x/1',
    })
    expect(opts).toMatchObject({ onConflict: 'name_normalized', ignoreDuplicates: true })
  })

  it('dedupes within the batch by normalized name (first wins)', async () => {
    const m = makeMockClient({ existing: [] })
    const result = await registerCompanies(m.client, [
      { name: 'Acme AG', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' },
      { name: 'ACME, Inc.', source: 'apify_career_site', sampleJobUrl: 'https://x/2' },
    ])
    expect(result).toEqual([
      { name: 'Acme AG', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' },
    ])
  })

  it('does not re-insert existing companies, bumps last_seen, returns []', async () => {
    const m = makeMockClient({ existing: ['acme'] })
    const result = await registerCompanies(m.client, [
      { name: 'Acme AG', source: 'apify_linkedin' },
    ])
    expect(result).toEqual([])
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.updateIn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/company-registry.test.ts`
Expected: FAIL — cannot resolve `@/lib/companies/registry`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/companies/registry.ts`:

```ts
// src/lib/companies/registry.ts
// Shared, idempotent company-registry upsert used by both ingest paths.
import type { createServiceClient } from '@/lib/supabase/service'
import { normalizeCompanyName } from './normalize'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface CompanyObservation {
  name: string
  source: string // 'jobich' | 'apify_linkedin' | 'apify_career_site'
  sampleJobUrl?: string | null
}

export interface NewCompany {
  name: string
  source: string
  sampleJobUrl: string | null
}

/**
 * Registers each observed company. Existing companies (matched on normalized
 * name) get their last_seen_at bumped; genuinely new ones are inserted.
 * Returns only the newly inserted companies. Idempotent under retries via an
 * upsert on the unique name_normalized.
 */
export async function registerCompanies(
  supabase: ServiceClient,
  observations: CompanyObservation[],
): Promise<NewCompany[]> {
  // 1. Normalize + dedupe within the batch (first occurrence wins).
  const byNorm = new Map<string, NewCompany>()
  for (const obs of observations) {
    const normalized = normalizeCompanyName(obs.name)
    if (!normalized) continue
    if (!byNorm.has(normalized)) {
      byNorm.set(normalized, {
        name: obs.name.trim(),
        source: obs.source,
        sampleJobUrl: obs.sampleJobUrl ?? null,
      })
    }
  }
  if (byNorm.size === 0) return []

  const normalizedKeys = [...byNorm.keys()]

  // 2. Which of these already exist?
  const { data: existing, error: selectError } = await supabase
    .from('companies')
    .select('name_normalized')
    .in('name_normalized', normalizedKeys)
  if (selectError) throw new Error(`companies select failed: ${selectError.message}`)

  const existingSet = new Set((existing ?? []).map(r => r.name_normalized))
  const nowIso = new Date().toISOString()

  // 3. Bump last_seen_at for the ones we already know.
  const existingKeys = normalizedKeys.filter(k => existingSet.has(k))
  if (existingKeys.length > 0) {
    const { error: bumpError } = await supabase
      .from('companies')
      .update({ last_seen_at: nowIso })
      .in('name_normalized', existingKeys)
    if (bumpError) throw new Error(`companies last_seen bump failed: ${bumpError.message}`)
  }

  // 4. Insert the new ones.
  const newKeys = normalizedKeys.filter(k => !existingSet.has(k))
  if (newKeys.length === 0) return []

  const rows = newKeys.map(k => {
    const c = byNorm.get(k)!
    return {
      name: c.name,
      name_normalized: k,
      first_seen_source: c.source,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      sample_job_url: c.sampleJobUrl,
    }
  })

  const { error: insertError } = await supabase
    .from('companies')
    .upsert(rows, { onConflict: 'name_normalized', ignoreDuplicates: true })
  if (insertError) throw new Error(`companies insert failed: ${insertError.message}`)

  return newKeys.map(k => byNorm.get(k)!)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/company-registry.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/companies/registry.ts src/test/company-registry.test.ts
git commit -m "feat: add registerCompanies registry helper"
```

---

## Task 4: Shared HTML-escape util + discovery email builder

**Files:**
- Create: `src/lib/html-escape.ts`
- Create: `src/lib/companies/discovery-email.ts`
- Test: `src/test/company-discovery-email.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/company-discovery-email.test.ts`:

```ts
// src/test/company-discovery-email.test.ts
import { describe, expect, it } from 'vitest'
import { buildDiscoveryEmail } from '@/lib/companies/discovery-email'

describe('buildDiscoveryEmail', () => {
  it('uses singular subject for one company', () => {
    const { subject } = buildDiscoveryEmail(
      [{ name: 'Acme', source: 'apify_linkedin', sampleJobUrl: null }],
      '2026-05-30',
    )
    expect(subject).toBe('Jobfish — 1 new company discovered (2026-05-30)')
  })

  it('uses plural subject for multiple companies', () => {
    const { subject } = buildDiscoveryEmail(
      [
        { name: 'Acme', source: 'apify_linkedin', sampleJobUrl: null },
        { name: 'Nimbus', source: 'apify_career_site', sampleJobUrl: null },
      ],
      '2026-05-30',
    )
    expect(subject).toBe('Jobfish — 2 new companies discovered (2026-05-30)')
  })

  it('renders a friendly source label and a link when a sample url exists', () => {
    const { html } = buildDiscoveryEmail(
      [{ name: 'Acme', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' }],
      '2026-05-30',
    )
    expect(html).toContain('Acme')
    expect(html).toContain('LinkedIn')
    expect(html).toContain('href="https://x/1"')
  })

  it('escapes company names', () => {
    const { html } = buildDiscoveryEmail(
      [{ name: 'A & B <Co>', source: 'apify_career_site', sampleJobUrl: null }],
      '2026-05-30',
    )
    expect(html).toContain('A &amp; B &lt;Co&gt;')
    expect(html).toContain('Career site')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/company-discovery-email.test.ts`
Expected: FAIL — cannot resolve `@/lib/companies/discovery-email`.

- [ ] **Step 3: Write the shared escape util**

Create `src/lib/html-escape.ts`:

```ts
// src/lib/html-escape.ts
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}
```

- [ ] **Step 4: Write the discovery email module**

Create `src/lib/companies/discovery-email.ts`:

```ts
// src/lib/companies/discovery-email.ts
import { Resend } from 'resend'
import { escapeAttr, escapeHtml } from '@/lib/html-escape'
import type { NewCompany } from './registry'

const TO_EMAIL = 'heer.luca@gmail.com'

const SOURCE_LABELS: Record<string, string> = {
  apify_linkedin: 'LinkedIn',
  apify_career_site: 'Career site',
  jobich: 'Jobich',
}

export function buildDiscoveryEmail(
  companies: NewCompany[],
  dateLabel: string,
): { subject: string; html: string } {
  const n = companies.length
  const noun = n === 1 ? 'company' : 'companies'
  const subject = `Jobfish — ${n} new ${noun} discovered (${dateLabel})`

  const items = companies
    .map(c => {
      const label = SOURCE_LABELS[c.source] ?? c.source
      const name = escapeHtml(c.name)
      const nameHtml = c.sampleJobUrl
        ? `<a href="${escapeAttr(c.sampleJobUrl)}">${name}</a>`
        : name
      return `<li>${nameHtml} <span style="color:#777;">— ${escapeHtml(label)}</span></li>`
    })
    .join('')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px;">
      <h2 style="margin-bottom: 8px;">${n} new ${noun} discovered</h2>
      <p style="color:#555; margin-top:0;">${dateLabel} · found by the Apify fallback scrape and not yet in the database.</p>
      <ul style="line-height: 1.6;">${items}</ul>
    </div>
  `
  return { subject, html }
}

/** Sends the discovery email. No-op when there are no new companies. */
export async function sendDiscoveryEmail(
  companies: NewCompany[],
  dateLabel: string,
): Promise<void> {
  if (companies.length === 0) return
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY environment variable is not set')

  const resend = new Resend(apiKey)
  const { subject, html } = buildDiscoveryEmail(companies, dateLabel)
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
    to: TO_EMAIL,
    subject,
    html,
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/company-discovery-email.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/html-escape.ts src/lib/companies/discovery-email.ts src/test/company-discovery-email.test.ts
git commit -m "feat: add company discovery email builder"
```

---

## Task 5: Wire discovery into the Apify fallback task

**Files:**
- Modify: `src/trigger/scrape-apify-fallback.ts`

- [ ] **Step 1: Add imports**

In `src/trigger/scrape-apify-fallback.ts`, after the existing import block (after line 14), add:

```ts
import { registerCompanies, type CompanyObservation } from '@/lib/companies/registry'
import { sendDiscoveryEmail } from '@/lib/companies/discovery-email'
import { escapeAttr, escapeHtml } from '@/lib/html-escape'
```

- [ ] **Step 2: Add a shared Berlin-date helper and reuse it**

Replace the `dateLabel` computation inside `sendSummaryEmail` (lines 84-90):

```ts
  // en-CA happens to format dates as YYYY-MM-DD.
  const dateLabel = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(fetchedAt))
```

with:

```ts
  const dateLabel = formatBerlinDate(fetchedAt)
```

Then add this helper near the bottom of the file (e.g. just above `function escapeHtml`, which you will delete in Step 4):

```ts
// en-CA happens to format dates as YYYY-MM-DD.
function formatBerlinDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}
```

- [ ] **Step 3: Insert the registration + discovery-email block**

In the `run` function, between the `apify_fallback_jobs` insert block and the `sendSummaryEmail` call (i.e. after line 57, before line 59), insert:

```ts
    try {
      const supabase = createServiceClient()
      const observations: CompanyObservation[] = rows
        .filter(r => r.company)
        .map(r => ({
          name: r.company as string,
          source: `apify_${r.source}`,
          sampleJobUrl: r.url,
        }))
      const newCompanies = await registerCompanies(supabase, observations)
      if (newCompanies.length > 0) {
        await sendDiscoveryEmail(newCompanies, formatBerlinDate(fetchedAt))
      }
      console.log(`scrape-apify-fallback: ${newCompanies.length} new companies discovered`)
    } catch (err) {
      console.error(
        `scrape-apify-fallback: company discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      Sentry.captureException(err)
    }
```

- [ ] **Step 4: Remove the now-duplicated local escape helpers**

Delete the local `escapeHtml` (lines 146-152) and `escapeAttr` (lines 154-156) functions from `src/trigger/scrape-apify-fallback.ts`. They are now imported from `@/lib/html-escape` (added in Step 1) and used by `renderSection` / `renderErrorBanner` unchanged.

- [ ] **Step 5: Typecheck and run related tests**

Run: `npx tsc --noEmit && npx vitest run src/test/apify-lib.test.ts`
Expected: PASS. (There is no dedicated trigger test for this file; `apify-lib.test.ts` covers the helpers it imports.)

- [ ] **Step 6: Commit**

```bash
git add src/trigger/scrape-apify-fallback.ts
git commit -m "feat: register + email newly discovered companies in apify fallback"
```

---

## Task 6: Register jobich companies in sync-jobs (silent)

**Files:**
- Modify: `src/trigger/sync-jobs.ts`
- Modify: `src/test/sync-jobs.test.ts` (mock must accept the new `companies` table)

- [ ] **Step 1: Update the test mock to handle the `companies` table**

In `src/test/sync-jobs.test.ts`, inside `makeMockSupabase`'s `mockFrom.mockImplementation`, add a branch for `companies` before the final `throw` (after the `jobs` branch, around line 70):

```ts
    if (table === 'companies') {
      return {
        select: () => ({ in: async () => ({ data: [], error: null }) }),
        update: () => ({ in: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      }
    }
```

- [ ] **Step 2: Run the existing sync-jobs tests (still green before the change)**

Run: `npx vitest run src/test/sync-jobs.test.ts`
Expected: PASS (the new branch is harmless until the source change lands).

- [ ] **Step 3: Add the import**

In `src/trigger/sync-jobs.ts`, after line 7, add:

```ts
import { registerCompanies, type CompanyObservation } from '@/lib/companies/registry'
```

- [ ] **Step 4: Register companies after the jobs upsert**

In `src/trigger/sync-jobs.ts`, immediately after `newJobIds = (inserted ?? []).map(j => j.id)` (line 78), still inside the `if (delta.added.length > 0)` block, insert:

```ts
      try {
        const observations: CompanyObservation[] = deduped
          .filter(j => j.company)
          .map(j => ({ name: j.company, source: 'jobich', sampleJobUrl: j.url }))
        await registerCompanies(supabase, observations)
      } catch (err) {
        Sentry.captureException(err)
      }
```

- [ ] **Step 5: Run the tests to verify they still pass**

Run: `npx vitest run src/test/sync-jobs.test.ts`
Expected: PASS (registration runs against the mocked `companies` table; existing assertions unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/trigger/sync-jobs.ts src/test/sync-jobs.test.ts
git commit -m "feat: register jobich companies in sync-jobs"
```

---

## Task 7: One-off `backfill-companies` Trigger.dev task

Seeds the registry from existing `jobs.company` values so the first Apify
discovery run does not report companies that jobich already knows. Run once
from the Trigger.dev dashboard after deploy; idempotent, so safe to re-run.

**Files:**
- Create: `src/trigger/backfill-companies.ts`

- [ ] **Step 1: Write the task**

Create `src/trigger/backfill-companies.ts`:

```ts
// src/trigger/backfill-companies.ts
// One-off seed of the companies registry from existing jobs.company values.
// Trigger manually from the dashboard. Idempotent (upsert ignores duplicates).
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { registerCompanies, type CompanyObservation } from '@/lib/companies/registry'

export const backfillCompaniesTask = task({
  id: 'backfill-companies',
  run: async () => {
    const supabase = createServiceClient()
    const pageSize = 1000
    let from = 0
    let scanned = 0
    let inserted = 0

    for (;;) {
      const { data, error } = await supabase
        .from('jobs')
        .select('company, url')
        .not('company', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw new Error(`backfill-companies select failed: ${error.message}`)
      if (!data || data.length === 0) break

      const observations: CompanyObservation[] = data
        .filter(r => r.company)
        .map(r => ({ name: r.company as string, source: 'jobich', sampleJobUrl: r.url }))
      const newOnes = await registerCompanies(supabase, observations)

      scanned += data.length
      inserted += newOnes.length
      if (data.length < pageSize) break
      from += pageSize
    }

    console.log(`backfill-companies: scanned ${scanned} jobs, inserted ${inserted} companies`)
    await Sentry.flush(2000)
    return { scanned, inserted }
  },
})
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/trigger/backfill-companies.ts
git commit -m "feat: one-off backfill-companies task to seed registry"
```

---

## Task 8: Full verification

- [ ] **Step 1: Lint, typecheck, full test suite**

Run:
```bash
npx tsc --noEmit
npm run lint
npx vitest run
```
Expected: all PASS. Pay attention that `sync-jobs.test.ts`, `apify-lib.test.ts`, and the three new `company-*` test files are green.

- [ ] **Step 2: Push and open PR to `develop`**

```bash
git push -u origin feature/company-discovery
gh pr create --base develop --title "feat: company discovery from Apify fallback" \
  --body "Registers companies seen by the Apify fallback (and jobich sync) into a new companies table and emails newly discovered ones daily. See docs/superpowers/specs/2026-05-30-company-discovery-design.md"
```

---

## Post-merge / deploy runbook (manual, not code)

1. Apply migration `0016_companies.sql` to the Supabase project.
2. Deploy Trigger.dev (`npm run trigger:deploy`) so `backfill-companies` and the
   updated tasks are in the latest deployment.
3. From the Trigger.dev dashboard, run `backfill-companies` **once** to seed the
   baseline. Confirm the returned `inserted` count looks sane.
4. The next `scrape-apify-fallback` run (06:00 Europe/Berlin) will then email
   only genuinely new companies; days with zero discoveries send no email.

---

## File summary

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0016_companies.sql` | `companies` registry table (service-role only) |
| `src/lib/supabase/types.ts` | `companies` table typing |
| `src/lib/companies/normalize.ts` | Pure name normalization |
| `src/lib/companies/registry.ts` | Idempotent `registerCompanies` upsert helper |
| `src/lib/html-escape.ts` | Shared `escapeHtml` / `escapeAttr` |
| `src/lib/companies/discovery-email.ts` | Discovery email HTML builder + Resend send |
| `src/trigger/scrape-apify-fallback.ts` | Calls registry + discovery email after scrape |
| `src/trigger/sync-jobs.ts` | Silently registers jobich companies |
| `src/trigger/backfill-companies.ts` | One-off baseline seed task |
