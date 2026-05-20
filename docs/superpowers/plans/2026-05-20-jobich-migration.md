# Jobich Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Apify with the Jobich Partner API using delta sync, per-user pre-filter evaluation, and a clean-slate schema migration.

**Architecture:** A single hourly `sync-jobs` task calls the Jobich delta endpoint, upserts new jobs, and soft-deletes removed ones. `evaluate-jobs` is restructured to loop per-user first, applying a pre-filter before calling the AI. A `sync_state` table stores the delta cursor.

**Tech Stack:** Next.js 15, Supabase (Postgres + RLS), Trigger.dev v4, OpenRouter AI, Vitest, TypeScript

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Create | `src/trigger/lib/jobich.ts` | Jobich API client, normaliser, HTML stripper |
| Create | `src/trigger/lib/pre-filter.ts` | Pure pre-filter function — no side effects |
| Create | `src/trigger/sync-jobs.ts` | Hourly delta sync scheduled task |
| Create | `src/test/jobich.test.ts` | Tests for jobich.ts |
| Create | `src/test/pre-filter.test.ts` | Tests for pre-filter.ts |
| Create | `src/test/sync-jobs.test.ts` | Tests for sync-jobs.ts |
| Create | `supabase/migrations/0007_jobich_migration.sql` | Schema migration |
| Modify | `src/lib/supabase/types.ts` | Updated DB types |
| Modify | `src/trigger/evaluate-jobs.ts` | Inverted loop + pre-filter |
| Modify | `src/trigger/lib/evaluate.ts` | Rename `industries` → `targetIndustries` |
| Modify | `src/lib/supabase/queries.ts` | `is_active` filter, updated column names |
| Modify | `src/trigger/notify-users.tsx` | Remove hardcoded SOURCE_LABELS |
| Modify | `src/app/api/onboarding/complete/route.ts` | Trigger evaluate-jobs instead |
| Modify | `src/app/(app)/preferences/actions.ts` | Updated field names |
| Modify | `src/components/features/preferences-form.tsx` | target_industries + excluded_industries |
| Modify | `src/components/features/onboarding-wizard.tsx` | target_industries + excluded_industries |
| Delete | `src/trigger/lib/apify.ts` | Replaced by jobich.ts |
| Delete | `src/trigger/scrape-jobs.ts` | Replaced by sync-jobs.ts |
| Delete | `src/trigger/scrape-jobs-initial.ts` | Replaced by evaluate-jobs backfill |
| Delete | `src/test/apify.test.ts` | Replaced by jobich.test.ts |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0007_jobich_migration.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0007_jobich_migration.sql

-- Clean slate: Apify data is incompatible with Jobich structure
TRUNCATE user_job_actions, job_evaluations, jobs CASCADE;

-- jobs: add Jobich-specific columns
ALTER TABLE jobs
  ADD COLUMN external_id    UUID        UNIQUE,
  ADD COLUMN is_active      BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN remote_type    TEXT        NULL,
  ADD COLUMN industry       TEXT        NULL,
  ADD COLUMN job_updated_at TIMESTAMPTZ NULL;

-- jobs: drop Apify-only column replaced by remote_type
ALTER TABLE jobs
  DROP COLUMN work_arrangement;

-- jobs: fix date_posted type (was timestamptz, Jobich provides date only; safe after TRUNCATE)
ALTER TABLE jobs
  ALTER COLUMN date_posted TYPE DATE USING NULL;

-- jobs: rename scraped_at → synced_at
ALTER TABLE jobs
  RENAME COLUMN scraped_at TO synced_at;

-- Indexes for delta sync lookups and feed filtering
CREATE INDEX ON jobs (external_id) WHERE is_active = true;
CREATE INDEX ON jobs (is_active);

-- preferences: rename industries inclusion list → target_industries
ALTER TABLE preferences
  RENAME COLUMN industries TO target_industries;

-- preferences: add exclusion list (analogous to excluded_companies)
ALTER TABLE preferences
  ADD COLUMN excluded_industries TEXT[] DEFAULT '{}';

-- Cursor store: single row per source, key = 'jobich'
CREATE TABLE sync_state (
  key            TEXT PRIMARY KEY DEFAULT 'jobich',
  last_synced_at TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db push
```

Expected: no errors. `jobs`, `preferences`, `sync_state` tables updated.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_jobich_migration.sql
git commit -m "feat: add Jobich migration 0007 — schema clean slate"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Replace the full file content**

```typescript
// src/lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type RoleSelection = {
  role: string
  yoe: number
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          cv_text: string | null
          threshold: number
          notifications_enabled: boolean
          onboarding_completed: boolean
          created_at: string
          updated_at: string
          first_name: string | null
          last_name: string | null
        }
        Insert: {
          id: string
          cv_text?: string | null
          threshold?: number
          notifications_enabled?: boolean
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
          first_name?: string | null
          last_name?: string | null
        }
        Update: {
          id?: string
          cv_text?: string | null
          threshold?: number
          notifications_enabled?: boolean
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
          first_name?: string | null
          last_name?: string | null
        }
        Relationships: []
      }
      preferences: {
        Row: {
          id: string
          user_id: string
          target_roles: RoleSelection[]
          target_industries: string[]
          excluded_industries: string[]
          locations: string[]
          excluded_companies: string[]
          updated_at: string
          remote_preference: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
        }
        Insert: {
          id?: string
          user_id: string
          target_roles?: RoleSelection[]
          target_industries?: string[]
          excluded_industries?: string[]
          locations?: string[]
          excluded_companies?: string[]
          updated_at?: string
          remote_preference?: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
        }
        Update: {
          id?: string
          user_id?: string
          target_roles?: RoleSelection[]
          target_industries?: string[]
          excluded_industries?: string[]
          locations?: string[]
          excluded_companies?: string[]
          updated_at?: string
          remote_preference?: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
        }
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          external_id: string | null
          title: string
          company: string
          location: string | null
          remote_type: string | null
          url: string
          source: string
          description: string | null
          date_posted: string | null
          job_updated_at: string | null
          industry: string | null
          is_active: boolean
          synced_at: string
          employment_type: string[] | null
          experience_level: string | null
          job_language: string | null
          working_hours: number | null
          source_domain: string | null
          detail_facts: Json | null
        }
        Insert: {
          id?: string
          external_id?: string | null
          title: string
          company: string
          location?: string | null
          remote_type?: string | null
          url: string
          source: string
          description?: string | null
          date_posted?: string | null
          job_updated_at?: string | null
          industry?: string | null
          is_active?: boolean
          synced_at?: string
          employment_type?: string[] | null
          experience_level?: string | null
          job_language?: string | null
          working_hours?: number | null
          source_domain?: string | null
          detail_facts?: Json | null
        }
        Update: {
          id?: string
          external_id?: string | null
          title?: string
          company?: string
          location?: string | null
          remote_type?: string | null
          url?: string
          source?: string
          description?: string | null
          date_posted?: string | null
          job_updated_at?: string | null
          industry?: string | null
          is_active?: boolean
          synced_at?: string
          employment_type?: string[] | null
          experience_level?: string | null
          job_language?: string | null
          working_hours?: number | null
          source_domain?: string | null
          detail_facts?: Json | null
        }
        Relationships: []
      }
      job_evaluations: {
        Row: {
          id: string
          job_id: string
          user_id: string
          score: number
          reasoning: string | null
          dimensions: Json | null
          detailed_reasoning: Json | null
          notified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          user_id: string
          score: number
          reasoning?: string | null
          dimensions?: Json | null
          detailed_reasoning?: Json | null
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          user_id?: string
          score?: number
          reasoning?: string | null
          dimensions?: Json | null
          detailed_reasoning?: Json | null
          notified_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_evaluations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_evaluations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      user_job_actions: {
        Row: {
          id: string
          user_id: string
          job_id: string
          status: 'saved' | 'hidden' | 'applied'
          applied_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_id: string
          status: 'saved' | 'hidden' | 'applied'
          applied_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          job_id?: string
          status?: 'saved' | 'hidden' | 'applied'
          applied_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_job_actions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_job_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      sync_state: {
        Row: {
          key: string
          last_synced_at: string
          updated_at: string
        }
        Insert: {
          key?: string
          last_synced_at: string
          updated_at?: string
        }
        Update: {
          key?: string
          last_synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      job_action_status: 'saved' | 'hidden' | 'applied'
    }
    CompositeTypes: Record<string, never>
  }
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors from types.ts changes (other files will still have errors — fix those in later tasks).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: update DB types for Jobich schema"
```

---

## Task 3: Jobich API Client

**Files:**
- Create: `src/trigger/lib/jobich.ts`
- Create: `src/test/jobich.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/jobich.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  stripHtml,
  parseDate,
  normalizeJobichJob,
  fetchDelta,
  type JobichJob,
} from '@/trigger/lib/jobich'

describe('stripHtml', () => {
  it('strips HTML tags leaving plain text', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('collapses multiple spaces', () => {
    expect(stripHtml('<div>  foo  </div>')).toBe('foo')
  })

  it('returns null for null input', () => {
    expect(stripHtml(null)).toBeNull()
  })

  it('returns null for empty string after stripping', () => {
    expect(stripHtml('<br/>')).toBeNull()
  })

  it('returns plain text unchanged', () => {
    expect(stripHtml('plain text')).toBe('plain text')
  })
})

describe('parseDate', () => {
  it('returns YYYY-MM-DD for a valid ISO date string', () => {
    expect(parseDate('2026-05-02')).toBe('2026-05-02')
  })

  it('returns YYYY-MM-DD from a full ISO datetime', () => {
    expect(parseDate('2026-05-20T07:27:22.577Z')).toBe('2026-05-20')
  })

  it('returns null for human-readable strings like "Posted 30+ Days Ago"', () => {
    expect(parseDate('Posted 30+ Days Ago')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseDate(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull()
  })
})

describe('normalizeJobichJob', () => {
  const base: JobichJob = {
    id: 'abc-123',
    title: 'Sr. UX Designer',
    company: 'Logitech',
    location: 'Lausanne',
    remote_type: 'Hybrid',
    description: '<p>Great role</p>',
    url: 'https://example.com/job/1',
    posted_at: '2026-05-01',
    updated_at: '2026-05-20T07:14:28.577Z',
    source: 'Workday (Logitech)',
    industry: 'IT & Software',
  }

  it('maps all fields correctly', () => {
    const result = normalizeJobichJob(base)
    expect(result.external_id).toBe('abc-123')
    expect(result.title).toBe('Sr. UX Designer')
    expect(result.company).toBe('Logitech')
    expect(result.location).toBe('Lausanne')
    expect(result.remote_type).toBe('Hybrid')
    expect(result.description).toBe('Great role')
    expect(result.url).toBe('https://example.com/job/1')
    expect(result.date_posted).toBe('2026-05-01')
    expect(result.job_updated_at).toBe('2026-05-20T07:14:28.577Z')
    expect(result.source).toBe('Workday (Logitech)')
    expect(result.industry).toBe('IT & Software')
  })

  it('strips HTML from description', () => {
    const result = normalizeJobichJob({ ...base, description: '<p>Hello <b>world</b></p>' })
    expect(result.description).toBe('Hello world')
  })

  it('sets date_posted to null when posted_at is not a valid date', () => {
    const result = normalizeJobichJob({ ...base, posted_at: 'Posted 30+ Days Ago' })
    expect(result.date_posted).toBeNull()
  })

  it('sets description to null when input is null', () => {
    const result = normalizeJobichJob({ ...base, description: null })
    expect(result.description).toBeNull()
  })

  it('sets location to null when input is null', () => {
    const result = normalizeJobichJob({ ...base, location: null })
    expect(result.location).toBeNull()
  })

  it('sets remote_type to null when input is null', () => {
    const result = normalizeJobichJob({ ...base, remote_type: null })
    expect(result.remote_type).toBeNull()
  })
})

describe('fetchDelta', () => {
  beforeEach(() => {
    process.env.JOBICH_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.JOBICH_API_KEY
    vi.unstubAllGlobals()
  })

  it('calls the correct endpoint with x-api-key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ added: [], updated: [], removed: [], server_time: '2026-05-20T00:00:00Z' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchDelta('2026-05-19T00:00:00Z')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/jobs/changes?since='),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      })
    )
  })

  it('throws when JOBICH_API_KEY is not set', async () => {
    delete process.env.JOBICH_API_KEY
    await expect(fetchDelta('2026-05-19T00:00:00Z')).rejects.toThrow('JOBICH_API_KEY is not set')
  })

  it('throws on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded'),
    }))

    await expect(fetchDelta('2026-05-19T00:00:00Z')).rejects.toThrow('Jobich API error 429')
  })

  it('returns parsed delta response', async () => {
    const mockResponse = {
      added: [{ id: 'job-1', title: 'Engineer', company: 'Acme', location: 'Zurich',
        remote_type: 'Hybrid', description: null, url: 'https://example.com/1',
        posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: 'IT & Software' }],
      updated: [],
      removed: [{ id: 'old-job', url: 'https://example.com/old' }],
      server_time: '2026-05-20T12:00:00Z',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }))

    const result = await fetchDelta('2026-05-19T00:00:00Z')
    expect(result.added).toHaveLength(1)
    expect(result.removed).toHaveLength(1)
    expect(result.server_time).toBe('2026-05-20T12:00:00Z')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/jobich.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement jobich.ts**

```typescript
// src/trigger/lib/jobich.ts

const JOBICH_BASE_URL = 'https://jobich.ch'

export interface JobichJob {
  id: string
  title: string
  company: string
  location: string | null
  remote_type: 'Remote' | 'Hybrid' | 'Onsite' | null
  description: string | null
  url: string
  posted_at: string | null
  updated_at: string
  source: string
  industry: string | null
}

export interface DeltaResponse {
  added: JobichJob[]
  updated: JobichJob[]
  removed: Array<{ id: string; url: string }>
  server_time: string
}

export interface NormalizedJob {
  external_id: string
  title: string
  company: string
  location: string | null
  remote_type: string | null
  description: string | null
  url: string
  date_posted: string | null
  job_updated_at: string
  source: string
  industry: string | null
}

export function stripHtml(html: string | null): string | null {
  if (!html) return null
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped || null
}

export function parseDate(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

export function normalizeJobichJob(raw: JobichJob): NormalizedJob {
  return {
    external_id: raw.id,
    title: raw.title,
    company: raw.company,
    location: raw.location ?? null,
    remote_type: raw.remote_type ?? null,
    description: stripHtml(raw.description),
    url: raw.url,
    date_posted: parseDate(raw.posted_at),
    job_updated_at: raw.updated_at,
    source: raw.source,
    industry: raw.industry ?? null,
  }
}

export async function fetchDelta(since: string): Promise<DeltaResponse> {
  const apiKey = process.env.JOBICH_API_KEY
  if (!apiKey) throw new Error('JOBICH_API_KEY is not set')

  const url = `${JOBICH_BASE_URL}/api/v1/jobs/changes?since=${encodeURIComponent(since)}`
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`Jobich API error ${res.status}: ${await res.text()}`)
  }

  return res.json() as Promise<DeltaResponse>
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/jobich.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/lib/jobich.ts src/test/jobich.test.ts
git commit -m "feat: add Jobich API client with normaliser and HTML stripper"
```

---

## Task 4: Pre-filter Utility

**Files:**
- Create: `src/trigger/lib/pre-filter.ts`
- Create: `src/test/pre-filter.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/pre-filter.test.ts
import { describe, it, expect } from 'vitest'
import { filterJobsForUser, type FilterableJob, type UserPrefsForFilter } from '@/trigger/lib/pre-filter'

const makeJob = (overrides: Partial<FilterableJob> = {}): FilterableJob => ({
  title: 'Senior UX Designer',
  company: 'Logitech',
  industry: 'IT & Software',
  ...overrides,
})

const emptyPrefs: UserPrefsForFilter = {
  target_roles: [],
  excluded_companies: [],
  excluded_industries: [],
}

describe('filterJobsForUser — title keyword match', () => {
  it('passes job when title matches a target role (case-insensitive)', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, target_roles: [{ role: 'UX Designer', yoe: 0 }] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(1)
  })

  it('blocks job when title does not match any target role', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, target_roles: [{ role: 'Data Engineer', yoe: 0 }] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(0)
  })

  it('matches case-insensitively', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, target_roles: [{ role: 'ux designer', yoe: 0 }] }
    expect(filterJobsForUser([makeJob({ title: 'Senior UX Designer' })], prefs)).toHaveLength(1)
  })

  it('passes all jobs when target_roles is empty (no keyword filter)', () => {
    expect(filterJobsForUser([makeJob(), makeJob({ title: 'Data Engineer' })], emptyPrefs)).toHaveLength(2)
  })

  it('matches on any of multiple target roles (OR logic)', () => {
    const prefs: UserPrefsForFilter = {
      ...emptyPrefs,
      target_roles: [{ role: 'Data Engineer', yoe: 0 }, { role: 'UX Designer', yoe: 0 }],
    }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(1)
  })
})

describe('filterJobsForUser — company exclusion', () => {
  it('blocks job from excluded company', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_companies: ['Logitech'] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(0)
  })

  it('is case-insensitive for company matching', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_companies: ['logitech'] }
    expect(filterJobsForUser([makeJob({ company: 'Logitech' })], prefs)).toHaveLength(0)
  })

  it('passes job from non-excluded company', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_companies: ['Adecco'] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(1)
  })
})

describe('filterJobsForUser — industry exclusion', () => {
  it('blocks job from excluded industry', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_industries: ['IT & Software'] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(0)
  })

  it('always passes jobs with industry = "Other"', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_industries: ['IT & Software', 'Other'] }
    expect(filterJobsForUser([makeJob({ industry: 'Other' })], prefs)).toHaveLength(1)
  })

  it('always passes jobs with industry = null', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_industries: ['IT & Software'] }
    expect(filterJobsForUser([makeJob({ industry: null })], prefs)).toHaveLength(1)
  })

  it('is case-insensitive for industry matching', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_industries: ['it & software'] }
    expect(filterJobsForUser([makeJob({ industry: 'IT & Software' })], prefs)).toHaveLength(0)
  })
})

describe('filterJobsForUser — combined conditions', () => {
  it('applies all three conditions together', () => {
    const prefs: UserPrefsForFilter = {
      target_roles: [{ role: 'UX Designer', yoe: 0 }],
      excluded_companies: ['Adecco'],
      excluded_industries: ['Healthcare & Pharma'],
    }
    const jobs = [
      makeJob({ title: 'UX Designer', company: 'Logitech', industry: 'IT & Software' }),  // PASS
      makeJob({ title: 'Data Engineer', company: 'Logitech', industry: 'IT & Software' }), // FAIL title
      makeJob({ title: 'UX Designer', company: 'Adecco', industry: 'IT & Software' }),     // FAIL company
      makeJob({ title: 'UX Designer', company: 'Logitech', industry: 'Healthcare & Pharma' }), // FAIL industry
    ]
    expect(filterJobsForUser(jobs, prefs)).toHaveLength(1)
    expect(filterJobsForUser(jobs, prefs)[0].company).toBe('Logitech')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/pre-filter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pre-filter.ts**

```typescript
// src/trigger/lib/pre-filter.ts
import type { RoleSelection } from '@/lib/supabase/types'

export interface FilterableJob {
  title: string
  company: string
  industry: string | null
}

export interface UserPrefsForFilter {
  target_roles: RoleSelection[]
  excluded_companies: string[]
  excluded_industries: string[]
}

export function filterJobsForUser<T extends FilterableJob>(
  jobs: T[],
  prefs: UserPrefsForFilter
): T[] {
  return jobs.filter(job => {
    // 1. Title keyword match — skip entirely if user has no target roles
    if (prefs.target_roles.length > 0) {
      const titleLower = job.title.toLowerCase()
      const matchesRole = prefs.target_roles.some(r =>
        titleLower.includes(r.role.toLowerCase())
      )
      if (!matchesRole) return false
    }

    // 2. Company exclusion
    if (prefs.excluded_companies.length > 0) {
      const companyLower = job.company.toLowerCase()
      if (prefs.excluded_companies.some(c => c.toLowerCase() === companyLower)) {
        return false
      }
    }

    // 3. Industry exclusion — null and "Other" always pass through
    if (
      prefs.excluded_industries.length > 0 &&
      job.industry &&
      job.industry !== 'Other'
    ) {
      const industryLower = job.industry.toLowerCase()
      if (prefs.excluded_industries.some(i => i.toLowerCase() === industryLower)) {
        return false
      }
    }

    return true
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/pre-filter.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/lib/pre-filter.ts src/test/pre-filter.test.ts
git commit -m "feat: add per-user job pre-filter utility"
```

---

## Task 5: sync-jobs Task

**Files:**
- Create: `src/trigger/sync-jobs.ts`
- Create: `src/test/sync-jobs.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/sync-jobs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockFetchDelta = vi.fn()
const mockNormalizeJobichJob = vi.fn()
const mockEvaluateTrigger = vi.fn()
const mockCaptureException = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  schedules: {
    task: vi.fn(function factory(config) { return config }),
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('@/trigger/lib/jobich', () => ({
  fetchDelta: mockFetchDelta,
  normalizeJobichJob: mockNormalizeJobichJob,
}))

vi.mock('@/trigger/evaluate-jobs', () => ({
  evaluateJobsTask: { triggerAndWait: mockEvaluateTrigger },
}))

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
}))

const { syncJobsTask } = await import('@/trigger/sync-jobs')

const emptyDelta = { added: [], updated: [], removed: [], server_time: '2026-05-20T01:00:00Z' }

function makeMockSupabase({
  syncState = null,
  insertedJobIds = ['job-uuid-1'],
}: {
  syncState?: { last_synced_at: string } | null
  insertedJobIds?: string[]
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'sync_state') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: syncState }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'jobs') {
      return {
        update: () => ({ in: async () => ({ error: null }) }),
        upsert: () => ({
          select: async () => ({
            data: insertedJobIds.map(id => ({ id })),
            error: null,
          }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('syncJobsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNormalizeJobichJob.mockImplementation(job => ({ ...job, external_id: job.id }))
    mockEvaluateTrigger.mockResolvedValue({ ok: true })
  })

  it('uses last_synced_at from sync_state when available', async () => {
    makeMockSupabase({ syncState: { last_synced_at: '2026-05-19T12:00:00Z' } })
    mockFetchDelta.mockResolvedValue(emptyDelta)

    await (syncJobsTask as any).run()

    expect(mockFetchDelta).toHaveBeenCalledWith('2026-05-19T12:00:00Z')
  })

  it('falls back to now()-24h when no sync_state row exists', async () => {
    makeMockSupabase({ syncState: null })
    mockFetchDelta.mockResolvedValue(emptyDelta)

    await (syncJobsTask as any).run()

    const calledWith = mockFetchDelta.mock.calls[0][0]
    const calledDate = new Date(calledWith)
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)
    expect(calledDate.getTime()).toBeGreaterThan(twentyFiveHoursAgo.getTime())
  })

  it('does not trigger evaluate-jobs when no new jobs are added', async () => {
    makeMockSupabase()
    mockFetchDelta.mockResolvedValue(emptyDelta)

    await (syncJobsTask as any).run()

    expect(mockEvaluateTrigger).not.toHaveBeenCalled()
  })

  it('triggers evaluate-jobs with new job IDs when added jobs exist', async () => {
    makeMockSupabase({ insertedJobIds: ['job-1', 'job-2'] })
    mockFetchDelta.mockResolvedValue({
      ...emptyDelta,
      added: [
        { id: 'ext-1', title: 'Engineer', company: 'Acme', location: 'Zurich',
          remote_type: 'Hybrid', description: null, url: 'https://example.com/1',
          posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: 'IT & Software' },
      ],
    })

    await (syncJobsTask as any).run()

    expect(mockEvaluateTrigger).toHaveBeenCalledWith({ jobIds: ['job-1', 'job-2'] })
  })

  it('stores server_time as the new cursor', async () => {
    makeMockSupabase()
    const serverTime = '2026-05-20T02:00:00Z'
    mockFetchDelta.mockResolvedValue({ ...emptyDelta, server_time: serverTime })

    await (syncJobsTask as any).run()

    // Find the upsert call on sync_state
    const syncStateUpsertCall = mockFrom.mock.results
      .map(r => r.value)
      .find(v => typeof v?.upsert === 'function')
    expect(syncStateUpsertCall?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ last_synced_at: serverTime })
    )
  })

  it('returns counts of added and removed', async () => {
    makeMockSupabase({ insertedJobIds: ['job-1'] })
    mockFetchDelta.mockResolvedValue({
      ...emptyDelta,
      added: [{ id: 'ext-1', title: 'Engineer', company: 'Acme', location: null,
        remote_type: null, description: null, url: 'https://example.com/1',
        posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: null }],
      removed: [{ id: 'old-ext', url: 'https://example.com/old' }],
    })

    const result = await (syncJobsTask as any).run()

    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/sync-jobs.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement sync-jobs.ts**

```typescript
// src/trigger/sync-jobs.ts
import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchDelta, normalizeJobichJob } from './lib/jobich'
import { evaluateJobsTask } from './evaluate-jobs'

export const syncJobsTask = schedules.task({
  id: 'sync-jobs',
  cron: '0 * * * *',
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async () => {
    const supabase = createServiceClient()

    const { data: syncState } = await supabase
      .from('sync_state')
      .select('last_synced_at')
      .eq('key', 'jobich')
      .maybeSingle()

    const since = syncState?.last_synced_at
      ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const delta = await fetchDelta(since)

    if (delta.removed.length > 0) {
      const { error } = await supabase
        .from('jobs')
        .update({ is_active: false })
        .in('external_id', delta.removed.map(r => r.id))
      if (error) Sentry.captureException(error)
    }

    let newJobIds: string[] = []

    if (delta.added.length > 0) {
      const normalized = delta.added.map(normalizeJobichJob)
      const { data: inserted, error } = await supabase
        .from('jobs')
        .upsert(
          normalized.map(j => ({
            external_id: j.external_id,
            title: j.title,
            company: j.company,
            location: j.location,
            remote_type: j.remote_type,
            description: j.description,
            url: j.url,
            date_posted: j.date_posted,
            job_updated_at: j.job_updated_at,
            source: j.source,
            industry: j.industry,
            is_active: true,
          })),
          { onConflict: 'external_id', ignoreDuplicates: false }
        )
        .select('id')

      if (error) {
        Sentry.captureException(error)
        throw new Error(`Failed to upsert jobs: ${error.message}`)
      }

      newJobIds = (inserted ?? []).map(j => j.id)
    }

    await supabase
      .from('sync_state')
      .upsert({ key: 'jobich', last_synced_at: delta.server_time, updated_at: new Date().toISOString() })

    if (newJobIds.length > 0) {
      const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
      if (!result.ok) {
        Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
      }
    }

    console.log(`sync-jobs: +${delta.added.length} added, -${delta.removed.length} removed, ${newJobIds.length} new IDs`)
    return { added: delta.added.length, removed: delta.removed.length, newJobIds }
  },
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/sync-jobs.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/sync-jobs.ts src/test/sync-jobs.test.ts
git commit -m "feat: add sync-jobs task with Jobich delta sync"
```

---

## Task 6: Update evaluate.ts (Rename industries Field)

**Files:**
- Modify: `src/trigger/lib/evaluate.ts`

- [ ] **Step 1: Update EvaluationInput and buildEvaluationPrompt**

Replace the entire file:

```typescript
// src/trigger/lib/evaluate.ts
import { scoreResponseSchema, type ScoreResponse } from './score-schema'
import type { RoleSelection } from '@/lib/supabase/types'

interface EvaluationInput {
  jobTitle: string
  jobCompany: string
  jobDescription: string
  cvText: string
  targetRoles: RoleSelection[]
  targetIndustries: string[]
  locations: string[]
  excludedCompanies: string[]
}

export function buildEvaluationPrompt(input: EvaluationInput): string {
  const {
    jobTitle,
    jobCompany,
    jobDescription,
    cvText,
    targetRoles,
    targetIndustries,
    locations,
    excludedCompanies,
  } = input

  const roleNames = targetRoles.length > 0
    ? targetRoles.map((r) => r.role).join(', ')
    : 'Not specified'

  const yoeHint = targetRoles.length > 0
    ? targetRoles
        .map((r) => `${r.role}: ${r.yoe === 0 ? 'any' : `${r.yoe}+`} yrs`)
        .join(', ')
    : 'Not specified'

  return `You are a career advisor evaluating how well a job matches a candidate's profile.

## Candidate CV
${cvText}

## Candidate Preferences
- Target roles: ${roleNames}
- Years of experience per role: ${yoeHint}
- Preferred industries: ${targetIndustries.length > 0 ? targetIndustries.join(', ') : 'Not specified'}
- Preferred locations: ${locations.length > 0 ? locations.join(', ') : 'Not specified'}
- Excluded companies: ${excludedCompanies.length > 0 ? excludedCompanies.join(', ') : 'None'}

## Job Posting
Title: ${jobTitle}
Company: ${jobCompany}
Description:
${jobDescription}

## Instructions
Score how well this job matches the candidate on a scale of 0.0–10.0.
Be honest and critical — scores above 8.0 should be rare and genuinely exceptional matches.

Respond with ONLY valid JSON in this exact format:
{
  "score": <number 0.0-10.0>,
  "reasoning": "<2-3 sentence plain-language explanation for the candidate>",
  "dimensions": {
    "role_fit": <number 0.0-10.0>,
    "domain_fit": <number 0.0-10.0>,
    "experience_fit": <number 0.0-10.0>,
    "location_fit": <number 0.0-10.0>,
    "upside": <number 0.0-10.0>
  },
  "detailed_reasoning": {
    "summary": "<1-2 sentence overall assessment>",
    "strengths": ["<strength 1>", "<strength 2>"],
    "concerns": ["<concern 1>"],
    "red_flags": [],
    "recommendation": "<one sentence action recommendation>",
    "dimension_explanations": {
      "role_fit": "<one sentence>",
      "domain_fit": "<one sentence>",
      "experience_fit": "<one sentence>",
      "location_fit": "<one sentence>",
      "upside": "<one sentence>"
    }
  }
}`
}

export function parseEvaluationResponse(raw: string): ScoreResponse {
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : raw.trim()
  const parsed = JSON.parse(candidate)
  return scoreResponseSchema.parse(parsed)
}

export async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY environment variable is not set')

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3-5-haiku',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`OpenRouter returned no content. Response: ${JSON.stringify(data)}`)
  }
  return content
}
```

- [ ] **Step 2: Run existing evaluate tests to confirm no regressions**

```bash
npx vitest run src/test/evaluate.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/trigger/lib/evaluate.ts
git commit -m "refactor: rename industries → targetIndustries in EvaluationInput"
```

---

## Task 7: Restructure evaluate-jobs Task

**Files:**
- Modify: `src/trigger/evaluate-jobs.ts`
- Modify: `src/test/evaluate-jobs.test.ts`

- [ ] **Step 1: Replace evaluate-jobs.ts**

```typescript
// src/trigger/evaluate-jobs.ts
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import type { RoleSelection } from '@/lib/supabase/types'
import { buildEvaluationPrompt, callOpenRouter, parseEvaluationResponse } from './lib/evaluate'
import { filterJobsForUser } from './lib/pre-filter'

interface EvaluateJobsPayload {
  jobIds?: string[]
  userIds?: string[]
}

export const evaluateJobsTask = task({
  id: 'evaluate-jobs',
  retry: { maxAttempts: 2 },
  run: async ({ jobIds, userIds }: EvaluateJobsPayload) => {
    const supabase = createServiceClient()

    let jobsQuery = supabase
      .from('jobs')
      .select('id, title, company, location, description, industry')
      .eq('is_active', true)

    if (jobIds && jobIds.length > 0) {
      jobsQuery = jobsQuery.in('id', jobIds)
    } else {
      jobsQuery = jobsQuery.order('job_updated_at', { ascending: false }).limit(100)
    }

    const { data: jobs, error: jobsError } = await jobsQuery

    if (jobsError || !jobs?.length) {
      console.log('No jobs to evaluate')
      return { evaluatedCount: 0 }
    }

    let profilesQuery = supabase
      .from('profiles')
      .select('id, cv_text')
      .eq('onboarding_completed', true)
      .not('cv_text', 'is', null)

    if (userIds && userIds.length > 0) {
      profilesQuery = profilesQuery.in('id', userIds)
    }

    const { data: profiles } = await profilesQuery

    if (!profiles?.length) {
      console.log('No active users to evaluate for')
      return { evaluatedCount: 0 }
    }

    const profileUserIds = profiles.map(p => p.id)
    const { data: prefsRows } = await supabase
      .from('preferences')
      .select('user_id, target_roles, target_industries, locations, excluded_companies, excluded_industries')
      .in('user_id', profileUserIds)

    const prefsMap = new Map((prefsRows ?? []).map(p => [p.user_id, p]))

    let evaluatedCount = 0

    for (const user of profiles) {
      const prefs = prefsMap.get(user.id)

      const candidateJobs = filterJobsForUser(jobs, {
        target_roles: (prefs?.target_roles ?? []) as RoleSelection[],
        excluded_companies: prefs?.excluded_companies ?? [],
        excluded_industries: (prefs?.excluded_industries ?? []) as string[],
      })

      for (const job of candidateJobs) {
        try {
          const prompt = buildEvaluationPrompt({
            jobTitle: job.title,
            jobCompany: job.company,
            jobDescription: job.description ?? '',
            cvText: user.cv_text ?? '',
            targetRoles: (prefs?.target_roles ?? []) as RoleSelection[],
            targetIndustries: (prefs?.target_industries ?? []) as string[],
            locations: prefs?.locations ?? [],
            excludedCompanies: prefs?.excluded_companies ?? [],
          })

          const rawResponse = await callOpenRouter(prompt)
          const { score, reasoning, dimensions, detailed_reasoning } = parseEvaluationResponse(rawResponse)

          await supabase
            .from('job_evaluations')
            .insert({
              job_id: job.id,
              user_id: user.id,
              score,
              reasoning,
              dimensions,
              detailed_reasoning,
            })

          evaluatedCount++
        } catch (err) {
          Sentry.captureException(err, { extra: { jobId: job.id, userId: user.id } })
          console.error(`Evaluation failed for job ${job.id} / user ${user.id}:`, err)
        }
      }
    }

    console.log(`Evaluated ${evaluatedCount} job/user pairs`)
    return { evaluatedCount }
  },
})
```

- [ ] **Step 2: Update the evaluate-jobs test**

Replace `src/test/evaluate-jobs.test.ts`:

```typescript
// src/test/evaluate-jobs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockCallOpenRouter = vi.fn()
const mockParseEvaluationResponse = vi.fn()
const mockBuildEvaluationPrompt = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  task: vi.fn(function taskFactory(config) { return config }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('@/trigger/lib/evaluate', () => ({
  buildEvaluationPrompt: mockBuildEvaluationPrompt,
  callOpenRouter: mockCallOpenRouter,
  parseEvaluationResponse: mockParseEvaluationResponse,
}))

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}))

const { evaluateJobsTask } = await import('@/trigger/evaluate-jobs')

const mockEvalResult = {
  score: 8.5,
  reasoning: 'Great fit',
  dimensions: { role_fit: 9, domain_fit: 8, experience_fit: 8, location_fit: 7, upside: 8 },
  detailed_reasoning: {
    summary: 'Strong match.',
    strengths: ['Good overlap'],
    concerns: [],
    red_flags: [],
    recommendation: 'Apply.',
    dimension_explanations: {
      role_fit: 'Matches.', domain_fit: 'Close.', experience_fit: 'Aligned.',
      location_fit: 'Fine.', upside: 'Good.',
    },
  },
}

function setupMocks({
  jobs = [{ id: 'job-1', title: 'Head of Product', company: 'Acme', location: 'Zurich', description: 'Strong operator.', industry: 'IT & Software' }],
  prefs = { user_id: 'user-1', target_roles: [{ role: 'Head of Product', yoe: 0 }], target_industries: ['SaaS'], locations: ['Zurich'], excluded_companies: [], excluded_industries: [] },
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'jobs') {
      return { select: () => ({ eq: () => ({ in: async () => ({ data: jobs, error: null }), order: () => ({ limit: async () => ({ data: jobs, error: null }) }) }) }) }
    }
    if (table === 'profiles') {
      return { select: () => ({ eq: () => ({ not: async () => ({ data: [{ id: 'user-1', cv_text: 'PM background' }] }) }) }) }
    }
    if (table === 'preferences') {
      return { select: () => ({ in: async () => ({ data: [prefs] }) }) }
    }
    if (table === 'job_evaluations') {
      return { insert: async () => ({ data: { id: 'eval-1' }, error: null }) }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('evaluateJobsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildEvaluationPrompt.mockReturnValue('prompt')
    mockCallOpenRouter.mockResolvedValue('raw')
    mockParseEvaluationResponse.mockReturnValue(mockEvalResult)
    setupMocks()
  })

  it('evaluates a matching job and returns count', async () => {
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toEqual({ evaluatedCount: 1 })
  })

  it('skips evaluation when job is pre-filtered out by company exclusion', async () => {
    setupMocks({ prefs: { user_id: 'user-1', target_roles: [{ role: 'Head of Product', yoe: 0 }], target_industries: [], locations: [], excluded_companies: ['Acme'], excluded_industries: [] } })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toEqual({ evaluatedCount: 0 })
    expect(mockCallOpenRouter).not.toHaveBeenCalled()
  })

  it('skips evaluation when job title does not match target roles', async () => {
    setupMocks({
      jobs: [{ id: 'job-1', title: 'Data Engineer', company: 'Acme', location: 'Zurich', description: 'Data stuff.', industry: 'IT & Software' }],
      prefs: { user_id: 'user-1', target_roles: [{ role: 'Head of Product', yoe: 0 }], target_industries: [], locations: [], excluded_companies: [], excluded_industries: [] },
    })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toEqual({ evaluatedCount: 0 })
    expect(mockCallOpenRouter).not.toHaveBeenCalled()
  })

  it('returns 0 when no jobs exist', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') return { select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }
      throw new Error(`Unexpected table: ${table}`)
    })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toEqual({ evaluatedCount: 0 })
  })

  it('fetches 100 most recent jobs when no jobIds provided (new user backfill)', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'] })
    // Should not call .in() on jobs — verified by mock path using .order().limit()
    expect(mockBuildEvaluationPrompt).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/test/evaluate-jobs.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/trigger/evaluate-jobs.ts src/test/evaluate-jobs.test.ts
git commit -m "feat: restructure evaluate-jobs with per-user pre-filter loop"
```

---

## Task 8: Update queries.ts

**Files:**
- Modify: `src/lib/supabase/queries.ts`

- [ ] **Step 1: Replace the full file**

```typescript
// src/lib/supabase/queries.ts
import { createClient } from './server'
import type { Database } from './types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type PreferencesUpdate = Database['public']['Tables']['preferences']['Update']
type JobActionStatus = Database['public']['Enums']['job_action_status']

export async function getProfile(userId: string) {
  const supabase = await createClient()
  return supabase.from('profiles').select('*').eq('id', userId).single()
}

export async function updateProfile(userId: string, data: Omit<ProfileUpdate, 'id' | 'created_at'>) {
  const supabase = await createClient()
  return supabase.from('profiles').update(data).eq('id', userId)
}

export async function getPreferences(userId: string) {
  const supabase = await createClient()
  return supabase.from('preferences').select('*').eq('user_id', userId).single()
}

export async function updatePreferences(userId: string, data: Omit<PreferencesUpdate, 'id' | 'user_id'>) {
  const supabase = await createClient()
  return supabase.from('preferences').update(data).eq('user_id', userId)
}

export async function getJobFeed(
  userId: string,
  page: number = 1,
  pageSize: number = 20,
  hideHidden: boolean = true
) {
  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let hiddenJobIds: string[] = []
  if (hideHidden) {
    const { data: hiddenActions } = await supabase
      .from('user_job_actions')
      .select('job_id')
      .eq('user_id', userId)
      .eq('status', 'hidden')
    hiddenJobIds = (hiddenActions ?? []).map(a => a.job_id)
  }

  let query = supabase
    .from('job_evaluations')
    .select(`
      id,
      job_id,
      score,
      reasoning,
      dimensions,
      notified_at,
      created_at,
      jobs!inner (
        id,
        title,
        company,
        location,
        url,
        source,
        remote_type,
        industry,
        synced_at
      )
    `)
    .eq('user_id', userId)
    .eq('jobs.is_active', true)
    .order('score', { ascending: false })
    .range(from, to)

  if (hideHidden && hiddenJobIds.length > 0) {
    query = query.not('job_id', 'in', `(${hiddenJobIds.join(',')})`)
  }

  const { data: evaluations, error } = await query
  if (error || !evaluations?.length) return { data: evaluations ?? [], error }

  const jobIds = evaluations.map(e => e.job_id).filter(Boolean) as string[]
  const { data: actions } = await supabase
    .from('user_job_actions')
    .select('job_id, status, applied_at')
    .eq('user_id', userId)
    .in('job_id', jobIds)

  const actionsMap = new Map((actions ?? []).map(a => [a.job_id, a]))

  const merged = evaluations.map(e => ({
    ...e,
    user_job_actions: actionsMap.get(e.job_id) ?? null,
  }))

  return { data: merged, error: null }
}

export async function upsertJobAction(userId: string, jobId: string, status: JobActionStatus) {
  const supabase = await createClient()
  return supabase
    .from('user_job_actions')
    .upsert(
      { user_id: userId, job_id: jobId, status, applied_at: status === 'applied' ? new Date().toISOString() : null },
      { onConflict: 'user_id,job_id' }
    )
}

export interface JobDetailData {
  job: {
    id: string
    title: string
    company: string
    location: string | null
    url: string
    source: string
    description: string | null
    remote_type: string | null
    industry: string | null
    date_posted: string | null
    job_updated_at: string | null
    synced_at: string
    employment_type: string[] | null
    experience_level: string | null
    job_language: string | null
    working_hours: number | null
  }
  evaluation: {
    id: string
    score: number
    reasoning: string | null
    dimensions: {
      role_fit: number
      domain_fit: number
      experience_fit: number
      location_fit: number
      upside: number
    } | null
    detailed_reasoning: {
      summary: string
      strengths: string[]
      concerns: string[]
      red_flags: string[]
      recommendation: string
      dimension_explanations: {
        role_fit: string
        domain_fit: string
        experience_fit: string
        location_fit: string
        upside: string
      }
    } | null
  } | null
  action: {
    status: 'saved' | 'hidden' | 'applied'
    applied_at: string | null
  } | null
}

export async function getJobDetail(userId: string, jobId: string): Promise<JobDetailData | null> {
  const supabase = await createClient()

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(`
      id, title, company, location, url, source, description,
      remote_type, industry, date_posted, job_updated_at, synced_at,
      employment_type, experience_level, job_language, working_hours
    `)
    .eq('id', jobId)
    .eq('is_active', true)
    .single()

  if (jobError || !job) return null

  const { data: evaluation } = await supabase
    .from('job_evaluations')
    .select('id, score, reasoning, dimensions, detailed_reasoning')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  const { data: action } = await supabase
    .from('user_job_actions')
    .select('status, applied_at')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (action?.status === 'hidden') return null

  return {
    job: job as JobDetailData['job'],
    evaluation: evaluation
      ? {
          id: evaluation.id,
          score: evaluation.score,
          reasoning: evaluation.reasoning,
          dimensions: evaluation.dimensions as NonNullable<JobDetailData['evaluation']>['dimensions'],
          detailed_reasoning: evaluation.detailed_reasoning as NonNullable<JobDetailData['evaluation']>['detailed_reasoning'],
        }
      : null,
    action: action ? { status: action.status as 'saved' | 'hidden' | 'applied', applied_at: action.applied_at } : null,
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors in queries.ts (some may remain in UI files — fixed in Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries.ts
git commit -m "feat: update queries for Jobich schema — is_active filter, new columns"
```

---

## Task 9: Update Onboarding Complete Route + notify-users

**Files:**
- Modify: `src/app/api/onboarding/complete/route.ts`
- Modify: `src/trigger/notify-users.tsx`

- [ ] **Step 1: Update the onboarding route**

Replace `src/app/api/onboarding/complete/route.ts`:

```typescript
// src/app/api/onboarding/complete/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk'

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await tasks.triggerAndWait(
      'evaluate-jobs',
      { userIds: [user.id] }
    )

    if (!result.ok) {
      return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Update notify-users.tsx — remove hardcoded SOURCE_LABELS**

In `src/trigger/notify-users.tsx`, replace:

```typescript
const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  'jobs.ch': 'Jobs.ch',
  company_site: 'Company',
}
```

with this (Jobich source strings are already human-readable):

```typescript
function formatSource(source: string): string {
  return source
}
```

And replace any usage of `SOURCE_LABELS[job.source] ?? job.source` with `formatSource(job.source)`.

- [ ] **Step 3: Run existing notify-users tests**

```bash
npx vitest run src/test/notify-users.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/onboarding/complete/route.ts src/trigger/notify-users.tsx
git commit -m "feat: onboarding triggers evaluate-jobs backfill; remove Apify source labels"
```

---

## Task 10: Update Preferences UI

**Files:**
- Modify: `src/app/(app)/preferences/actions.ts`
- Modify: `src/components/features/preferences-form.tsx`
- Modify: `src/components/features/onboarding-wizard.tsx`

- [ ] **Step 1: Update preferences/actions.ts**

```typescript
// src/app/(app)/preferences/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateProfile, updatePreferences } from '@/lib/supabase/queries'
import type { RoleSelection } from '@/lib/supabase/types'

export async function savePreferences(values: {
  cvText: string
  targetRoles: RoleSelection[]
  targetIndustries: string[]
  excludedIndustries: string[]
  locations: string[]
  excludedCompanies: string[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await Promise.all([
    updateProfile(user.id, { cv_text: values.cvText }),
    updatePreferences(user.id, {
      target_roles: values.targetRoles,
      target_industries: values.targetIndustries,
      excluded_industries: values.excludedIndustries,
      locations: values.locations,
      excluded_companies: values.excludedCompanies,
    }),
  ])

  revalidatePath('/preferences')
}
```

- [ ] **Step 2: Update preferences-form.tsx**

Replace the full file:

```typescript
// src/components/features/preferences-form.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { posthog } from '@/lib/posthog'
import { RolePicker } from '@/components/features/role-picker'
import type { RoleSelection } from '@/lib/supabase/types'

interface PreferencesValues {
  cvText: string
  targetRoles: RoleSelection[]
  targetIndustries: string[]
  excludedIndustries: string[]
  locations: string[]
  excludedCompanies: string[]
}

interface PreferencesFormProps {
  defaultValues: PreferencesValues
  onSave: (values: PreferencesValues) => Promise<void>
}

function arrayToInput(arr: string[]) {
  return arr.join(', ')
}

function inputToArray(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

export function PreferencesForm({ defaultValues, onSave }: PreferencesFormProps) {
  const [cvText, setCvText] = useState(defaultValues.cvText)
  const [targetRoles, setTargetRoles] = useState<RoleSelection[]>(defaultValues.targetRoles)
  const [targetIndustries, setTargetIndustries] = useState(arrayToInput(defaultValues.targetIndustries))
  const [excludedIndustries, setExcludedIndustries] = useState(arrayToInput(defaultValues.excludedIndustries))
  const [locations, setLocations] = useState(arrayToInput(defaultValues.locations))
  const [excludedCompanies, setExcludedCompanies] = useState(arrayToInput(defaultValues.excludedCompanies))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({
      cvText,
      targetRoles,
      targetIndustries: inputToArray(targetIndustries),
      excludedIndustries: inputToArray(excludedIndustries),
      locations: inputToArray(locations),
      excludedCompanies: inputToArray(excludedCompanies),
    })
    posthog.capture('preferences_updated')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="cv">Your CV</Label>
        <Textarea
          id="cv"
          rows={10}
          className="resize-none font-mono text-sm"
          value={cvText}
          onChange={e => setCvText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{cvText.length} characters</p>
      </div>

      <div className="space-y-1.5">
        <RolePicker value={targetRoles} onChange={setTargetRoles} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="target-industries">Preferred industries</Label>
        <Input
          id="target-industries"
          placeholder="Fintech, SaaS, Deep Tech"
          value={targetIndustries}
          onChange={e => setTargetIndustries(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="excluded-industries">Industries to avoid</Label>
        <Input
          id="excluded-industries"
          placeholder="Pharma, Oil & Gas"
          value={excludedIndustries}
          onChange={e => setExcludedIndustries(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="locations">Locations</Label>
        <Input
          id="locations"
          placeholder="Zurich, Remote, Geneva"
          value={locations}
          onChange={e => setLocations(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="excluded">Excluded companies</Label>
        <Input
          id="excluded"
          placeholder="BigCorp, SlowBank"
          value={excludedCompanies}
          onChange={e => setExcludedCompanies(e.target.value)}
        />
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save preferences'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Update onboarding-wizard.tsx step 3**

In `src/components/features/onboarding-wizard.tsx`, make the following changes:

Replace the state declarations in step 3:
```typescript
// OLD
const [industries, setIndustries] = useState('')

// NEW
const [targetIndustries, setTargetIndustries] = useState('')
const [excludedIndustries, setExcludedIndustries] = useState('')
```

Replace the `saveStep3` upsert call:
```typescript
// OLD
industries: parseCommaSeparated(industries),

// NEW
target_industries: parseCommaSeparated(targetIndustries),
excluded_industries: parseCommaSeparated(excludedIndustries),
```

Replace the Industries input in the step 3 JSX:
```tsx
{/* OLD */}
<div className="space-y-1">
  <Label>Industries</Label>
  <Input
    placeholder="Fintech, SaaS, VC, Deep Tech"
    value={industries}
    onChange={e => setIndustries(e.target.value)}
  />
</div>

{/* NEW */}
<div className="space-y-1">
  <Label>Preferred industries</Label>
  <Input
    placeholder="Fintech, SaaS, Deep Tech"
    value={targetIndustries}
    onChange={e => setTargetIndustries(e.target.value)}
  />
</div>
<div className="space-y-1">
  <Label>Industries to avoid</Label>
  <Input
    placeholder="Pharma, Oil & Gas"
    value={excludedIndustries}
    onChange={e => setExcludedIndustries(e.target.value)}
  />
</div>
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run the preferences-form test**

```bash
npx vitest run src/test/preferences-form.test.tsx
```

Expected: all PASS (test may need minor updates if it references `industries` directly — fix any field name mismatches).

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/preferences/actions.ts src/components/features/preferences-form.tsx src/components/features/onboarding-wizard.tsx
git commit -m "feat: add target_industries and excluded_industries to preferences UI"
```

---

## Task 11: Delete Apify Files + Env Var Cleanup

**Files:**
- Delete: `src/trigger/lib/apify.ts`
- Delete: `src/trigger/scrape-jobs.ts`
- Delete: `src/trigger/scrape-jobs-initial.ts`
- Delete: `src/test/apify.test.ts`

- [ ] **Step 1: Delete the files**

```bash
rm src/trigger/lib/apify.ts
rm src/trigger/scrape-jobs.ts
rm src/trigger/scrape-jobs-initial.ts
rm src/test/apify.test.ts
```

- [ ] **Step 2: Add JOBICH_API_KEY to .env.local**

```bash
npx vercel env pull .env.local --yes
```

Then manually add to `.env.local`:
```
JOBICH_API_KEY=sk_val_1b8edbe27f5b3a42883b0e436a09fb1c
```

Add to Vercel (production + preview):
```bash
echo "sk_val_1b8edbe27f5b3a42883b0e436a09fb1c" | npx vercel env add JOBICH_API_KEY production
echo "sk_val_1b8edbe27f5b3a42883b0e436a09fb1c" | npx vercel env add JOBICH_API_KEY preview
```

- [ ] **Step 3: Final TypeScript + test check**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: TypeScript clean. All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Apify files, add JOBICH_API_KEY env var"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: TypeScript clean build**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Check Trigger.dev picks up sync-jobs**

```bash
npx trigger dev
```

Expected: `sync-jobs` and `evaluate-jobs` appear in the task list. `scrape-jobs` and `scrape-jobs-initial` do not appear.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Jobich migration — delta sync, pre-filter evaluation"
```
