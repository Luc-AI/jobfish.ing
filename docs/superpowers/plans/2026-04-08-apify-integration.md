# Apify Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder Apify code in the pipeline with working `fantastic-jobs` actor calls that aggregate user preferences, call both APIs in parallel, normalize the shared output schema, and feed new jobs into Supabase.

**Architecture:** `src/trigger/lib/apify.ts` contains all Apify logic as pure/testable functions. `src/trigger/scrape-jobs.ts` is the Trigger.dev scheduled task that orchestrates the full scrape → upsert → trigger-evaluate flow. Both actors share identical output schemas, so one normalizer handles both. Input is built at runtime from aggregated active user preferences.

**Tech Stack:** TypeScript, Trigger.dev SDK (`@trigger.dev/sdk`), native `fetch`, Supabase service client, Vitest

**Prerequisites:** Foundation plan complete. `src/lib/supabase/service.ts` exports `createServiceClient()`. `src/trigger/evaluate-jobs.ts` exports `evaluateJobsTask`. `APIFY_API_TOKEN` added to `.env.local` and Trigger.dev env vars.

> **Replaces:** Task 3 and Task 4 in `docs/superpowers/plans/2026-04-01-pipeline.md`. Skip those tasks.

---

## File Map

| File | Responsibility |
|---|---|
| `src/trigger/lib/apify.ts` | All Apify logic: location map, input builder, HTTP caller, normalizer, scrapeAll orchestrator |
| `src/test/apify.test.ts` | Unit tests for `normalizeFantasticJob`, `buildApifyInput`, `toApifyLocation` |
| `src/trigger/scrape-jobs.ts` | Trigger.dev scheduled task: preferences → scrapeAll → upsert → trigger evaluate-jobs |

---

## Task 1: Apify helper library

**Files:**
- Create: `src/trigger/lib/apify.ts`
- Create: `src/test/apify.test.ts`

### Step 1: Write failing tests

- [ ] Create `src/test/apify.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  normalizeFantasticJob,
  buildApifyInput,
  toApifyLocation,
} from '@/trigger/lib/apify'

describe('toApifyLocation', () => {
  it('maps known city to City, Country format', () => {
    expect(toApifyLocation('Zurich')).toBe('Zurich, Switzerland')
    expect(toApifyLocation('Berlin')).toBe('Berlin, Germany')
    expect(toApifyLocation('London')).toBe('London, United Kingdom')
  })

  it('returns the input unchanged for unknown locations', () => {
    expect(toApifyLocation('SomeUnknownCity')).toBe('SomeUnknownCity')
  })
})

describe('normalizeFantasticJob', () => {
  it('maps a full career site item to NormalizedJob', () => {
    const raw = {
      title: 'Head of Product',
      organization: 'Acme Corp',
      url: 'https://jobs.acme.com/head-of-product',
      source: 'greenhouse',
      description_text: 'We are looking for a Head of Product...',
      locations_derived: [{ city: 'Zurich', country: 'Switzerland' }],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job).not.toBeNull()
    expect(job!.title).toBe('Head of Product')
    expect(job!.company).toBe('Acme Corp')
    expect(job!.url).toBe('https://jobs.acme.com/head-of-product')
    expect(job!.source).toBe('greenhouse')
    expect(job!.description).toBe('We are looking for a Head of Product...')
    expect(job!.location).toBe('Zurich, Switzerland')
  })

  it('returns null when url is missing', () => {
    const raw = {
      title: 'Engineer',
      organization: 'Acme',
      locations_derived: [],
    }
    expect(normalizeFantasticJob(raw)).toBeNull()
  })

  it('returns null when title is missing', () => {
    const raw = {
      organization: 'Acme',
      url: 'https://jobs.acme.com/1',
      locations_derived: [],
    }
    expect(normalizeFantasticJob(raw)).toBeNull()
  })

  it('returns null when organization is missing', () => {
    const raw = {
      title: 'Engineer',
      url: 'https://jobs.acme.com/1',
      locations_derived: [],
    }
    expect(normalizeFantasticJob(raw)).toBeNull()
  })

  it('falls back to Remote when remote_derived is true and no derived location', () => {
    const raw = {
      title: 'Remote Engineer',
      organization: 'Acme',
      url: 'https://jobs.acme.com/2',
      source: 'lever',
      description_text: null,
      locations_derived: [],
      remote_derived: true,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.location).toBe('Remote')
  })

  it('falls back to locations_alt_raw when derived is empty and not remote', () => {
    const raw = {
      title: 'Engineer',
      organization: 'Acme',
      url: 'https://jobs.acme.com/3',
      source: 'workday',
      description_text: null,
      locations_derived: [],
      locations_alt_raw: ['Basel, Switzerland'],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.location).toBe('Basel, Switzerland')
  })
})

describe('buildApifyInput', () => {
  it('merges target_roles from all preferences into titleSearch', () => {
    const prefs = [
      { target_roles: ['Head of Product', 'VP Product'], locations: ['Zurich'], excluded_companies: [] },
      { target_roles: ['Head of Product', 'COO'], locations: ['Berlin'], excluded_companies: [] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.titleSearch).toContain('Head of Product')
    expect(input.titleSearch).toContain('VP Product')
    expect(input.titleSearch).toContain('COO')
    // deduped
    expect(input.titleSearch.filter(r => r === 'Head of Product').length).toBe(1)
  })

  it('maps and deduplicates locations, strips Remote', () => {
    const prefs = [
      { target_roles: ['Engineer'], locations: ['Zurich', 'Remote'], excluded_companies: [] },
      { target_roles: ['Engineer'], locations: ['Zurich', 'Berlin'], excluded_companies: [] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.locationSearch).toContain('Zurich, Switzerland')
    expect(input.locationSearch).toContain('Berlin, Germany')
    expect(input.locationSearch).not.toContain('Remote')
    expect(input.locationSearch.filter(l => l === 'Zurich, Switzerland').length).toBe(1)
  })

  it('sets aiWorkArrangementFilter when any user wants Remote', () => {
    const prefs = [
      { target_roles: ['Engineer'], locations: ['Remote'], excluded_companies: [] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.aiWorkArrangementFilter).toEqual(['Remote OK', 'Remote Solely'])
  })

  it('omits aiWorkArrangementFilter when no user wants Remote', () => {
    const prefs = [
      { target_roles: ['Engineer'], locations: ['Zurich'], excluded_companies: [] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.aiWorkArrangementFilter).toBeUndefined()
  })

  it('merges excluded_companies into organizationExclusionSearch', () => {
    const prefs = [
      { target_roles: ['Engineer'], locations: [], excluded_companies: ['Acme', 'BigCorp'] },
      { target_roles: ['Engineer'], locations: [], excluded_companies: ['Acme', 'MegaCorp'] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.organizationExclusionSearch).toContain('Acme')
    expect(input.organizationExclusionSearch).toContain('BigCorp')
    expect(input.organizationExclusionSearch).toContain('MegaCorp')
    expect(input.organizationExclusionSearch.filter(c => c === 'Acme').length).toBe(1)
  })

  it('includes fixed params on every call', () => {
    const prefs = [{ target_roles: ['Engineer'], locations: ['Zurich'], excluded_companies: [] }]
    const input = buildApifyInput(prefs)
    expect(input.timeRange).toBe('1h')
    expect(input.limit).toBe(200)
    expect(input.descriptionType).toBe('text')
    expect(input.includeAi).toBe(true)
    expect(input.removeAgency).toBe(true)
  })
})
```

### Step 2: Run tests to verify they fail

- [ ] Run:

```bash
cd .worktrees/develop && npm run test:run -- src/test/apify.test.ts
```

Expected: FAIL with "Cannot find module `@/trigger/lib/apify`"

### Step 3: Create `src/trigger/lib/apify.ts`

- [ ] Create the file:

```typescript
const CAREER_SITE_ENDPOINT =
  'https://api.apify.com/v2/acts/fantastic-jobs~career-site-job-listing-api/run-sync-get-dataset-items'

const LINKEDIN_ENDPOINT =
  'https://api.apify.com/v2/acts/fantastic-jobs~advanced-linkedin-job-search-api/run-sync-get-dataset-items'

// Maps user-entered city names to the "City, Country" format Apify expects.
// Extend this map as you add more locations to the preferences UI.
const LOCATION_MAP: Record<string, string> = {
  'Zurich': 'Zurich, Switzerland',
  'Geneva': 'Geneva, Switzerland',
  'Basel': 'Basel, Switzerland',
  'Bern': 'Bern, Switzerland',
  'Berlin': 'Berlin, Germany',
  'Munich': 'Munich, Germany',
  'Hamburg': 'Hamburg, Germany',
  'Frankfurt': 'Frankfurt, Germany',
  'London': 'London, United Kingdom',
  'Amsterdam': 'Amsterdam, Netherlands',
  'Paris': 'Paris, France',
  'Vienna': 'Vienna, Austria',
  'Stockholm': 'Stockholm, Sweden',
  'Barcelona': 'Barcelona, Spain',
  'Madrid': 'Madrid, Spain',
  'Lisbon': 'Lisbon, Portugal',
  'New York': 'New York, United States',
  'San Francisco': 'San Francisco, United States',
}

export interface NormalizedJob {
  title: string
  company: string
  location: string
  url: string
  source: string
  description: string | null
}

export interface ApifyInput {
  timeRange: string
  limit: number
  descriptionType: string
  includeAi: boolean
  removeAgency: boolean
  titleSearch: string[]
  locationSearch: string[]
  organizationExclusionSearch: string[]
  aiWorkArrangementFilter?: string[]
}

export interface UserPreference {
  target_roles: string[]
  locations: string[]
  excluded_companies: string[]
}

export function toApifyLocation(city: string): string {
  return LOCATION_MAP[city] ?? city
}

export function buildApifyInput(preferences: UserPreference[]): ApifyInput {
  const titleSearch = [...new Set(preferences.flatMap(p => p.target_roles ?? []))]

  const rawLocations = [...new Set(preferences.flatMap(p => p.locations ?? []))]
  const locationSearch = rawLocations
    .filter(l => l.toLowerCase() !== 'remote')
    .map(toApifyLocation)
    .filter((v, i, arr) => arr.indexOf(v) === i)

  const hasRemoteUsers = rawLocations.some(l => l.toLowerCase() === 'remote')
  const organizationExclusionSearch = [
    ...new Set(preferences.flatMap(p => p.excluded_companies ?? [])),
  ]

  return {
    timeRange: '1h',
    limit: 200,
    descriptionType: 'text',
    includeAi: true,
    removeAgency: true,
    titleSearch,
    locationSearch,
    organizationExclusionSearch,
    ...(hasRemoteUsers && { aiWorkArrangementFilter: ['Remote OK', 'Remote Solely'] }),
  }
}

export function normalizeFantasticJob(raw: Record<string, unknown>): NormalizedJob | null {
  const url = raw.url as string | undefined
  const title = raw.title as string | undefined
  const org = raw.organization as string | undefined

  if (!url || !title || !org) return null

  const derived = raw.locations_derived as Array<{ city?: string; country?: string }> | undefined
  let location = 'Unknown'

  if (derived?.[0]?.city && derived[0]?.country) {
    location = `${derived[0].city}, ${derived[0].country}`
  } else if (raw.remote_derived) {
    location = 'Remote'
  } else {
    location = (raw.locations_alt_raw as string[] | undefined)?.[0] ?? 'Unknown'
  }

  return {
    title,
    company: org,
    location,
    url,
    source: (raw.source as string | undefined) ?? 'unknown',
    description: (raw.description_text as string | undefined) ?? null,
  }
}

async function callApifyActor(
  endpoint: string,
  input: ApifyInput & { excludeATSDuplicate?: boolean }
): Promise<NormalizedJob[]> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error('APIFY_API_TOKEN is not set')

  const url = `${endpoint}?token=${token}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw new Error(`Apify error ${res.status}: ${await res.text()}`)
  }

  const items = (await res.json()) as Record<string, unknown>[]
  return items
    .map(normalizeFantasticJob)
    .filter((j): j is NormalizedJob => j !== null)
}

export async function scrapeAll(preferences: UserPreference[]): Promise<NormalizedJob[]> {
  const baseInput = buildApifyInput(preferences)

  const [careerSiteResult, linkedInResult] = await Promise.allSettled([
    callApifyActor(CAREER_SITE_ENDPOINT, baseInput),
    callApifyActor(LINKEDIN_ENDPOINT, { ...baseInput, excludeATSDuplicate: true }),
  ])

  const jobs: NormalizedJob[] = []

  if (careerSiteResult.status === 'fulfilled') {
    jobs.push(...careerSiteResult.value)
  } else {
    console.error('Career site actor failed:', careerSiteResult.reason)
  }

  if (linkedInResult.status === 'fulfilled') {
    jobs.push(...linkedInResult.value)
  } else {
    console.error('LinkedIn actor failed:', linkedInResult.reason)
  }

  return jobs
}
```

### Step 4: Run tests to verify they pass

- [ ] Run:

```bash
cd .worktrees/develop && npm run test:run -- src/test/apify.test.ts
```

Expected: all tests pass.

### Step 5: Commit

- [ ] Run:

```bash
cd .worktrees/develop && git add src/trigger/lib/apify.ts src/test/apify.test.ts && git commit -m "feat: add Apify scraping helpers for fantastic-jobs actors"
```

---

## Task 2: `scrape-jobs` Trigger.dev task

**Files:**
- Create: `src/trigger/scrape-jobs.ts`

> **Note:** This replaces Task 4 in `docs/superpowers/plans/2026-04-01-pipeline.md`. Do NOT also complete that task.

### Step 1: Create `src/trigger/scrape-jobs.ts`

- [ ] Create the file:

```typescript
import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { scrapeAll, type NormalizedJob } from './lib/apify'
import { evaluateJobsTask } from './evaluate-jobs'

export const scrapeJobsTask = schedules.task({
  id: 'scrape-jobs',
  cron: '0 * * * *', // every hour
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async () => {
    const supabase = createServiceClient()

    // Fetch all active users' preferences to build Apify input
    const { data: preferences, error: prefsError } = await supabase
      .from('preferences')
      .select('target_roles, locations, excluded_companies')

    if (prefsError) {
      Sentry.captureException(prefsError)
      throw new Error(`Failed to fetch preferences: ${prefsError.message}`)
    }

    if (!preferences || preferences.length === 0) {
      console.log('No user preferences found. Skipping scrape.')
      return { newJobIds: [] }
    }

    // Scrape both actors in parallel using aggregated preferences
    const jobs: NormalizedJob[] = await scrapeAll(preferences)
    console.log(`Scraped ${jobs.length} jobs from Apify`)

    if (jobs.length === 0) {
      return { newJobIds: [] }
    }

    // Upsert into jobs table — ON CONFLICT (url) DO NOTHING handles deduplication
    const { data: insertedJobs, error: insertError } = await supabase
      .from('jobs')
      .upsert(
        jobs.map(j => ({
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          source: j.source,
          description: j.description,
        })),
        { onConflict: 'url', ignoreDuplicates: true }
      )
      .select('id')

    if (insertError) {
      Sentry.captureException(insertError)
      throw new Error(`Failed to upsert jobs: ${insertError.message}`)
    }

    const newJobIds = (insertedJobs ?? []).map(j => j.id)
    console.log(`Inserted ${newJobIds.length} new jobs`)

    if (newJobIds.length === 0) {
      return { newJobIds: [] }
    }

    // Trigger evaluate-jobs with the new job IDs
    const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
    if (!result.ok) {
      Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
    }

    return { newJobIds }
  },
})
```

### Step 2: Verify TypeScript compiles

- [ ] Run:

```bash
cd .worktrees/develop && npx tsc --noEmit
```

Expected: no errors. If you see "Cannot find module `@/trigger/evaluate-jobs`", that file exists from the pipeline plan — check that Task 2 of the original pipeline plan has been completed first.

### Step 3: Add `APIFY_API_TOKEN` to `.env.local`

- [ ] Open `.env.local` and add:

```
APIFY_API_TOKEN=<your token from apify.com/account/integrations>
```

> Get a fresh token from the Apify dashboard — do not reuse a token that has been shared in plain text.

### Step 4: Verify the task is detected by Trigger.dev

- [ ] In one terminal, start the Trigger.dev dev server:

```bash
cd .worktrees/develop && npm run trigger:dev
```

Expected: the CLI lists `scrape-jobs` as a detected scheduled task.

### Step 5: Run a manual test from the Trigger.dev dashboard

- [ ] Open the Trigger.dev dashboard → Tasks → `scrape-jobs` → Test → Run with empty payload `{}`

Expected: task runs, calls Apify (may return 0 new jobs if no new jobs in the last 1h), completes without error. Check the Trigger.dev run logs for `Scraped N jobs from Apify` and `Inserted N new jobs`.

### Step 6: Commit

- [ ] Run:

```bash
cd .worktrees/develop && git add src/trigger/scrape-jobs.ts && git commit -m "feat: add scrape-jobs scheduled task with fantastic-jobs Apify actors"
```
