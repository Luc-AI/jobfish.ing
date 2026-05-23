# Dashboard Sort + Job Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four sort modes to the job feed dashboard (#94) and a pre-evaluation job categorization step to the sync pipeline (#98).

**Architecture:** #94 — all active-sort modes share a single Postgres RPC `get_job_feed_ranked` parameterised by decay rate λ; archived uses a plain Supabase query; sort state lives in `?sort=` URL param. #98 — a new Trigger.dev task `categorize-jobs` runs between upsert and evaluation in `sync-jobs`, batching 10 jobs per LLM call against a fixed 17-category taxonomy derived from the existing role picker.

**Tech Stack:** Next.js 15 (App Router, server components), Supabase (PostgREST + Postgres functions), Trigger.dev v4, Vitest, OpenRouter (Claude Haiku via `callOpenRouter`)

> **⚡ These two features are fully independent.** #94 touches only `queries.ts`, `dashboard/page.tsx`, and a migration. #98 touches only `types.ts`, `sync-jobs.ts`, `categorize-jobs.ts` (new), and a migration. They can be worked in parallel on separate branches.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/0010_job_categories.sql` | Create | Add `categories text[]` to `jobs` |
| `supabase/migrations/0011_recommended_feed.sql` | Create | Add `get_job_feed_ranked` Postgres function |
| `src/lib/supabase/types.ts` | Modify | Add `categories` field to jobs Row/Insert/Update |
| `src/lib/supabase/queries.ts` | Modify | Add `sort` param to `getJobFeed`, branch to RPC or archived query |
| `src/app/(app)/dashboard/page.tsx` | Modify | Read `?sort=`, render sort buttons + micro-copy |
| `src/trigger/categorize-jobs.ts` | Create | Batch LLM categorization task |
| `src/trigger/sync-jobs.ts` | Modify | Chain `categorizeJobsTask` before `evaluateJobsTask` |
| `src/test/categorize-jobs.test.ts` | Create | Unit tests for parsing + task logic |
| `src/test/sync-jobs.test.ts` | Modify | Add mock for `categorizeJobsTask` |

---

## FEATURE A — Dashboard Sort (#94)

---

### Task 1: Postgres migration — `get_job_feed_ranked`

**Files:**
- Create: `supabase/migrations/0011_recommended_feed.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/0011_recommended_feed.sql

-- Returns a JSON array of feed items ordered by score × exp(−λ × age_days).
-- Filters to jobs posted within the last 30 days and excludes hidden jobs.
-- Used for sort modes: fresh (λ=0.15), best (λ=0.02), balanced (λ=0.05).
create or replace function get_job_feed_ranked(
  p_user_id uuid,
  p_lambda  float8,
  p_offset  int default 0,
  p_limit   int default 20
) returns json
language sql
security definer
as $$
  with ranked as (
    select
      je.id,
      je.job_id,
      je.score,
      je.reasoning,
      je.dimensions,
      je.notified_at,
      je.created_at,
      json_build_object(
        'id',          j.id,
        'title',       j.title,
        'company',     j.company,
        'location',    j.location,
        'url',         j.url,
        'source',      j.source,
        'remote_type', j.remote_type,
        'industry',    j.industry,
        'synced_at',   j.synced_at
      ) as jobs,
      (
        select json_build_object(
          'job_id',     uja.job_id,
          'status',     uja.status,
          'applied_at', uja.applied_at
        )
        from user_job_actions uja
        where uja.user_id = p_user_id
          and uja.job_id  = je.job_id
        limit 1
      ) as user_job_actions,
      je.score * exp(
        -p_lambda * greatest(
          0,
          extract(epoch from (now() - (j.date_posted)::timestamptz)) / 86400.0
        )
      ) as ranking_score
    from job_evaluations je
    join jobs j on j.id = je.job_id
    where je.user_id    = p_user_id
      and j.is_active   = true
      and j.date_posted >= current_date - 30
      and je.job_id not in (
        select job_id
        from   user_job_actions
        where  user_id = p_user_id
          and  status  = 'hidden'
      )
    order by ranking_score desc
    offset p_offset
    limit  p_limit
  )
  select coalesce(json_agg(ranked), '[]'::json) from ranked
$$;
```

- [ ] **Step 2: Apply the migration locally**

Run:
```bash
npx supabase db push
```
Expected: migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_recommended_feed.sql
git commit -m "feat: add get_job_feed_ranked postgres function (#94)"
```

---

### Task 2: Update `getJobFeed` to accept a sort param

**Files:**
- Modify: `src/lib/supabase/queries.ts`

- [ ] **Step 1: Add the `FeedSort` type and replace `getJobFeed`**

Replace the entire `getJobFeed` function (lines 29–98) with:

```ts
export type FeedSort = 'fresh' | 'best' | 'balanced' | 'archived'

const SORT_LAMBDA: Record<'fresh' | 'best' | 'balanced', number> = {
  fresh: 0.15,
  best: 0.02,
  balanced: 0.05,
}

// Shape returned by get_job_feed_ranked RPC and the archived direct query
export type FeedItem = {
  id: string
  job_id: string
  score: number
  reasoning: string | null
  dimensions: unknown
  notified_at: string | null
  created_at: string
  jobs: {
    id: string
    title: string
    company: string
    location: string | null
    url: string
    source: string
    remote_type: string | null
    industry: string | null
    synced_at: string
  }
  user_job_actions: {
    job_id: string
    status: string
    applied_at: string | null
  } | null
}

export async function getJobFeed(
  userId: string,
  page: number = 1,
  pageSize: number = 20,
  hideHidden: boolean = true,
  sort: FeedSort = 'fresh'
): Promise<{ data: FeedItem[]; error: unknown }> {
  const supabase = await createClient()
  const offset = (page - 1) * pageSize

  // Active sorts — delegate to Postgres RPC
  if (sort !== 'archived') {
    const { data, error } = await supabase.rpc('get_job_feed_ranked', {
      p_user_id: userId,
      p_lambda:  SORT_LAMBDA[sort],
      p_offset:  offset,
      p_limit:   pageSize,
    })
    return { data: (data as FeedItem[]) ?? [], error }
  }

  // Archived — jobs posted more than 30 days ago, newest first
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0] // 'YYYY-MM-DD' — matches DATE column type

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
      id, job_id, score, reasoning, dimensions, notified_at, created_at,
      jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at)
    `)
    .eq('user_id', userId)
    .eq('jobs.is_active', true)
    .lt('jobs.date_posted', thirtyDaysAgo)
    .order('date_posted', { referencedTable: 'jobs', ascending: false })
    .range(offset, offset + pageSize - 1)

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

  return { data: merged as unknown as FeedItem[], error: null }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries.ts
git commit -m "feat: add sort param to getJobFeed with RPC and archived branches (#94)"
```

---

### Task 3: Dashboard page — sort controls + micro-copy

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Replace `dashboard/page.tsx` with the following**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getJobFeed, type FeedSort } from '@/lib/supabase/queries'
import { JobFeed } from '@/components/features/job-feed'
import { upsertJobAction } from './actions'
import type { JobEvaluation } from '@/components/features/job-card'
import { Button } from '@/components/ui/button'

const SORT_LABELS: Record<FeedSort, string> = {
  fresh:    'Freshest first',
  best:     'Best matches',
  balanced: 'Balanced mix',
  archived: 'Archived',
}

const SORT_COPY: Record<FeedSort, string> = {
  fresh:    'Newest listings first — score still filters the noise.',
  best:     'A strong fit from last week still outranks a weaker one posted today.',
  balanced: 'Fit and freshness, both in the mix.',
  archived: 'Jobs posted more than 30 days ago, oldest finds last.',
}

const SORT_ORDER: FeedSort[] = ['fresh', 'best', 'balanced', 'archived']

interface DashboardPageProps {
  searchParams: Promise<{ page?: string; sort?: string }>
}

function isValidSort(s: string | undefined): s is FeedSort {
  return s === 'fresh' || s === 'best' || s === 'balanced' || s === 'archived'
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? 1))
  const sort: FeedSort = isValidSort(params.sort) ? params.sort : 'fresh'
  const pageSize = 20

  const { data: evaluations, error: feedError } = await getJobFeed(user.id, page, pageSize, true, sort)
  if (feedError) console.error('[dashboard] getJobFeed error:', feedError)

  const hasMore = (evaluations?.length ?? 0) === pageSize

  function sortHref(s: FeedSort) {
    return s === 'fresh' ? '/dashboard' : `/dashboard?sort=${s}`
  }

  function pageHref(p: number) {
    const base = sort === 'fresh' ? '/dashboard' : `/dashboard?sort=${sort}`
    return p === 1 ? base : `${base}${sort === 'fresh' ? '?' : '&'}page=${p}`
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Your feed</h1>
        <div className="flex gap-1">
          {SORT_ORDER.map(s => (
            <Button
              key={s}
              variant={sort === s ? 'default' : 'ghost'}
              size="sm"
              asChild
            >
              <Link href={sortHref(s)}>{SORT_LABELS[s]}</Link>
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{SORT_COPY[sort]}</p>

      <JobFeed
        evaluations={(evaluations ?? []) as JobEvaluation[]}
        onAction={upsertJobAction}
      />

      {(page > 1 || hasMore) && (
        <div className="flex justify-between mt-6">
          {page > 1 ? (
            <Button variant="outline" asChild>
              <Link href={pageHref(page - 1)}>← Previous</Link>
            </Button>
          ) : <div />}
          {hasMore && (
            <Button variant="outline" asChild>
              <Link href={pageHref(page + 1)}>Next →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/dashboard/page.tsx
git commit -m "feat: add sort controls to dashboard feed — fresh/best/balanced/archived (#94)"
```

---

## FEATURE B — Job Categorization (#98)

---

### Task 4: Postgres migration — `categories` column

**Files:**
- Create: `supabase/migrations/0010_job_categories.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/0010_job_categories.sql
-- nullable: null = not yet categorized (existing jobs)
-- new jobs always receive categories before evaluation via categorize-jobs task
alter table jobs add column categories text[];
```

- [ ] **Step 2: Apply the migration locally**

```bash
npx supabase db push
```
Expected: migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_job_categories.sql
git commit -m "feat: add categories column to jobs table (#98)"
```

---

### Task 5: Update `types.ts` — add `categories` to jobs

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Add `categories` to jobs Row, Insert, and Update**

In the `jobs` table definition, add `categories: string[] | null` to `Row` (after `detail_facts`), `categories?: string[] | null` to `Insert`, and `categories?: string[] | null` to `Update`.

`Row` section — add after `detail_facts: Json | null`:
```ts
          categories: string[] | null
```

`Insert` section — add after `detail_facts?: Json | null`:
```ts
          categories?: string[] | null
```

`Update` section — add after `detail_facts?: Json | null`:
```ts
          categories?: string[] | null
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore: add categories field to jobs DB types (#98)"
```

---

### Task 6: Create `categorize-jobs.ts` Trigger task

**Files:**
- Create: `src/trigger/categorize-jobs.ts`
- Create: `src/test/categorize-jobs.test.ts`

- [ ] **Step 1: Write failing tests first**

```ts
// src/test/categorize-jobs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── module mocks ──────────────────────────────────────────────────────────────
const mockFrom = vi.fn()
const mockCallOpenRouter = vi.fn()
const mockCaptureException = vi.fn()
const mockCaptureMessage = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  task: vi.fn(function factory(config) { return config }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('@/trigger/lib/evaluate', () => ({
  callOpenRouter: mockCallOpenRouter,
}))

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
}))

const { categorizeJobsTask, parseBatchResponse, validateCategories } =
  await import('@/trigger/categorize-jobs')

// ── helper ────────────────────────────────────────────────────────────────────
function makeMockSupabase(jobs: Array<{ id: string; title: string; industry: string | null; description: string | null }>) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'jobs') {
      return {
        select: () => ({ in: async () => ({ data: jobs, error: null }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

// ── parseBatchResponse ────────────────────────────────────────────────────────
describe('parseBatchResponse', () => {
  it('parses a clean JSON array', () => {
    const raw = '[{"job_id":"abc","categories":["Engineering"]},{"job_id":"def","categories":["Marketing"]}]'
    expect(parseBatchResponse(raw)).toEqual([
      { job_id: 'abc', categories: ['Engineering'] },
      { job_id: 'def', categories: ['Marketing'] },
    ])
  })

  it('extracts JSON from markdown code block', () => {
    const raw = '```json\n[{"job_id":"abc","categories":["Product"]}]\n```'
    expect(parseBatchResponse(raw)).toEqual([{ job_id: 'abc', categories: ['Product'] }])
  })

  it('throws when no JSON array is present', () => {
    expect(() => parseBatchResponse('Sorry, I cannot help.')).toThrow()
  })
})

// ── validateCategories ────────────────────────────────────────────────────────
describe('validateCategories', () => {
  it('returns valid taxonomy categories unchanged', () => {
    expect(validateCategories(['Engineering', 'AI & Data'])).toEqual(['Engineering', 'AI & Data'])
  })

  it('filters out invalid categories', () => {
    expect(validateCategories(['Engineering', 'Invented Category'])).toEqual(['Engineering'])
  })

  it('caps at 3 categories', () => {
    const input = ['Engineering', 'AI & Data', 'Cybersecurity', 'Product']
    expect(validateCategories(input)).toHaveLength(3)
  })

  it('falls back to ["Other"] when all categories are invalid', () => {
    expect(validateCategories(['NotReal', 'AlsoFake'])).toEqual(['Other'])
  })

  it('falls back to ["Other"] for empty input', () => {
    expect(validateCategories([])).toEqual(['Other'])
  })
})

// ── categorizeJobsTask ────────────────────────────────────────────────────────
describe('categorizeJobsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = 'test-key'
  })

  it('upserts categories for each job in a successful batch', async () => {
    const jobs = [
      { id: 'job-1', title: 'Senior Engineer', industry: 'Tech', description: 'Build software.' },
      { id: 'job-2', title: 'Marketing Manager', industry: 'Retail', description: 'Grow the brand.' },
    ]
    makeMockSupabase(jobs)

    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: () => ({ in: async () => ({ data: jobs, error: null }) }),
          update: mockUpdate,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    mockCallOpenRouter.mockResolvedValue(
      '[{"job_id":"job-1","categories":["Engineering"]},{"job_id":"job-2","categories":["Marketing"]}]'
    )

    const result = await (categorizeJobsTask as any).run({ jobIds: ['job-1', 'job-2'] })

    expect(result.categorized).toBe(2)
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledWith({ categories: ['Engineering'] })
    expect(mockUpdate).toHaveBeenCalledWith({ categories: ['Marketing'] })
  })

  it('falls back to ["Other"] and captures Sentry warning when per-job LLM fails', async () => {
    const jobs = [{ id: 'job-1', title: 'Mystery Role', industry: null, description: null }]

    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: () => ({ in: async () => ({ data: jobs, error: null }) }),
          update: mockUpdate,
        }
      }
    })

    // Batch fails, per-job also fails
    mockCallOpenRouter.mockRejectedValue(new Error('LLM timeout'))

    await (categorizeJobsTask as any).run({ jobIds: ['job-1'] })

    expect(mockUpdate).toHaveBeenCalledWith({ categories: ['Other'] })
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Job categorized as Other',
      expect.objectContaining({ level: 'warning' })
    )
  })

  it('returns early when no jobs are found', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    }))

    const result = await (categorizeJobsTask as any).run({ jobIds: ['nonexistent'] })
    expect(result.categorized).toBe(0)
    expect(mockCallOpenRouter).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/test/categorize-jobs.test.ts
```
Expected: all tests FAIL (module does not exist yet).

- [ ] **Step 3: Create `src/trigger/categorize-jobs.ts`**

```ts
// src/trigger/categorize-jobs.ts
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { callOpenRouter } from './lib/evaluate'

const TAXONOMY = [
  'Engineering', 'AI & Data', 'Cybersecurity', 'Product', 'Design & UX',
  'Sales', 'Business', 'Marketing', 'Finance', 'Quantitative Finance',
  'Customer Success', 'People & HR', 'Legal & Compliance',
  'Strategy & Operations', 'Consulting', 'Hardware & Embedded', 'Other',
] as const

type TaxonomyCategory = typeof TAXONOMY[number]

const SYSTEM_PROMPT = `You are a job categorization assistant. Your goal is high recall — it is always worse to miss a relevant category than to assign an extra one.

Rules:
- Always assign at least one category
- Assign at most 3 categories
- If a job could plausibly belong to multiple categories, include all relevant ones up to the limit
- Only use categories from the approved taxonomy — never invent new ones
- Respond ONLY with a JSON array: [{ "job_id": "...", "categories": ["..."] }, ...]

Approved taxonomy:
Engineering, AI & Data, Cybersecurity, Product, Design & UX, Sales, Business, Marketing, Finance, Quantitative Finance, Customer Success, People & HR, Legal & Compliance, Strategy & Operations, Consulting, Hardware & Embedded, Other

Examples:
- "Senior Full Stack Engineer" → ["Engineering"]
- "Head of Product" → ["Product"]
- "VP of Engineering" → ["Engineering"]
- "ML Platform Engineer" → ["Engineering", "AI & Data"]
- "Platform Security Engineer" → ["Engineering", "Cybersecurity"]
- "Quant Researcher" → ["Quantitative Finance"]
- "Growth Marketing Manager" → ["Marketing"]
- "Chief of Staff" → ["Strategy & Operations", "Business"]`

type JobRow = { id: string; title: string; industry: string | null; description: string | null }
type BatchResult = Array<{ job_id: string; categories: string[] }>

export function parseBatchResponse(raw: string): BatchResult {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`No JSON array found in LLM response: ${raw.slice(0, 200)}`)
  const parsed = JSON.parse(match[0]) as unknown
  if (!Array.isArray(parsed)) throw new Error('LLM response is not a JSON array')
  return parsed as BatchResult
}

export function validateCategories(cats: string[]): TaxonomyCategory[] {
  const valid = cats
    .filter((c): c is TaxonomyCategory => TAXONOMY.includes(c as TaxonomyCategory))
    .slice(0, 3)
  return valid.length > 0 ? valid : ['Other']
}

function buildBatchPrompt(jobs: JobRow[]): string {
  const lines = jobs.map(j =>
    `Job ID: ${j.id} | Title: ${j.title} | Industry: ${j.industry ?? 'Unknown'} | Description: ${(j.description ?? '').slice(0, 300)}`
  ).join('\n')
  return `${SYSTEM_PROMPT}\n\nCategorize the following jobs:\n${lines}`
}

async function categorizeSingle(job: JobRow): Promise<{ job_id: string; categories: TaxonomyCategory[] }> {
  const raw = await callOpenRouter(buildBatchPrompt([job]))
  const results = parseBatchResponse(raw)
  const match = results.find(r => r.job_id === job.id)
  return { job_id: job.id, categories: validateCategories(match?.categories ?? []) }
}

export const categorizeJobsTask = task({
  id: 'categorize-jobs',
  retry: { maxAttempts: 3 },
  run: async (payload: { jobIds: string[] }) => {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

    const supabase = createServiceClient()

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, title, industry, description')
      .in('id', payload.jobIds)

    if (error) throw error
    if (!jobs?.length) return { categorized: 0 }

    const BATCH_SIZE = 10
    let categorized = 0

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE)

      let results: Array<{ job_id: string; categories: TaxonomyCategory[] }>

      try {
        const raw = await callOpenRouter(buildBatchPrompt(batch))
        const parsed = parseBatchResponse(raw)
        results = parsed.map(r => ({ job_id: r.job_id, categories: validateCategories(r.categories) }))
      } catch (batchErr) {
        console.warn(`Batch categorization failed (jobs ${i}–${i + batch.length - 1}), falling back to per-job:`, batchErr)
        results = []
        for (const job of batch) {
          try {
            results.push(await categorizeSingle(job))
          } catch (jobErr) {
            console.error(`Per-job categorization failed for ${job.id}:`, jobErr)
            Sentry.captureException(jobErr, {
              level: 'warning',
              extra: { jobId: job.id, title: job.title, industry: job.industry },
            })
            results.push({ job_id: job.id, categories: ['Other'] })
          }
        }
      }

      for (const { job_id, categories } of results) {
        if (categories.length === 1 && categories[0] === 'Other') {
          const job = batch.find(j => j.id === job_id)
          Sentry.captureMessage('Job categorized as Other', {
            level: 'warning',
            extra: { jobId: job_id, title: job?.title, industry: job?.industry },
          })
        }

        await supabase.from('jobs').update({ categories }).eq('id', job_id)
        categorized++
      }
    }

    console.log(`categorize-jobs: ${categorized} jobs categorized`)
    return { categorized }
  },
})
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/test/categorize-jobs.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/categorize-jobs.ts src/test/categorize-jobs.test.ts
git commit -m "feat: add categorize-jobs trigger task with batch LLM categorization (#98)"
```

---

### Task 7: Chain categorization into `sync-jobs.ts`

**Files:**
- Modify: `src/trigger/sync-jobs.ts`
- Modify: `src/test/sync-jobs.test.ts`

- [ ] **Step 1: Add mock for `categorizeJobsTask` to the test file**

At the top of `src/test/sync-jobs.test.ts`, add a new mock constant and mock the new module. Find the existing:

```ts
const mockEvaluateTrigger = vi.fn()
```

Add after it:
```ts
const mockCategorizeTrigger = vi.fn()
```

Find the existing:
```ts
vi.mock('@/trigger/evaluate-jobs', () => ({
  evaluateJobsTask: { triggerAndWait: mockEvaluateTrigger },
}))
```

Add after it:
```ts
vi.mock('@/trigger/categorize-jobs', () => ({
  categorizeJobsTask: { triggerAndWait: mockCategorizeTrigger },
}))
```

In the `beforeEach` block, add:
```ts
mockCategorizeTrigger.mockResolvedValue({ ok: true })
```

- [ ] **Step 2: Add a test that categorize runs before evaluate**

Add this test to the `syncJobsTask` describe block:

```ts
it('triggers categorize-jobs before evaluate-jobs when new jobs exist', async () => {
  makeMockSupabase({ insertedJobIds: ['job-1'] })
  mockFetchDelta.mockResolvedValue({
    ...emptyDelta,
    added: [
      { id: 'ext-1', title: 'Engineer', company: 'Acme', location: 'Zurich',
        remote_type: 'Hybrid', description: null, url: 'https://example.com/1',
        posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: 'IT & Software' },
    ],
  })

  const callOrder: string[] = []
  mockCategorizeTrigger.mockImplementation(async () => { callOrder.push('categorize'); return { ok: true } })
  mockEvaluateTrigger.mockImplementation(async () => { callOrder.push('evaluate'); return { ok: true } })

  await (syncJobsTask as any).run()

  expect(callOrder).toEqual(['categorize', 'evaluate'])
  expect(mockCategorizeTrigger).toHaveBeenCalledWith({ jobIds: ['job-1'] })
})

it('still triggers evaluate-jobs even if categorize-jobs fails', async () => {
  makeMockSupabase({ insertedJobIds: ['job-1'] })
  mockFetchDelta.mockResolvedValue({
    ...emptyDelta,
    added: [
      { id: 'ext-1', title: 'Engineer', company: 'Acme', location: 'Zurich',
        remote_type: 'Hybrid', description: null, url: 'https://example.com/1',
        posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: 'IT & Software' },
    ],
  })
  mockCategorizeTrigger.mockResolvedValue({ ok: false, error: 'LLM timeout' })

  await (syncJobsTask as any).run()

  expect(mockEvaluateTrigger).toHaveBeenCalledWith({ jobIds: ['job-1'] })
})
```

- [ ] **Step 3: Run the new tests — verify they fail**

```bash
npx vitest run src/test/sync-jobs.test.ts
```
Expected: the two new tests FAIL (categorizeJobsTask not yet imported in sync-jobs.ts).

- [ ] **Step 4: Update `sync-jobs.ts` — add categorization step**

Add the import at the top of `src/trigger/sync-jobs.ts`, after the existing `evaluateJobsTask` import:

```ts
import { categorizeJobsTask } from './categorize-jobs'
```

Replace the existing block:
```ts
    if (newJobIds.length > 0) {
      const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
      if (!result.ok) {
        Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
      }
    }
```

With:
```ts
    if (newJobIds.length > 0) {
      const catResult = await categorizeJobsTask.triggerAndWait({ jobIds: newJobIds })
      if (!catResult.ok) {
        Sentry.captureException(new Error(`categorize-jobs failed: ${catResult.error}`))
      }

      const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
      if (!result.ok) {
        Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
      }
    }
```

- [ ] **Step 5: Run all tests — verify everything passes**

```bash
npx vitest run src/test/sync-jobs.test.ts src/test/categorize-jobs.test.ts
```
Expected: all tests PASS.

- [ ] **Step 6: Run the full test suite**

```bash
npx vitest run
```
Expected: all tests PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/trigger/sync-jobs.ts src/test/sync-jobs.test.ts
git commit -m "feat: chain categorize-jobs before evaluate-jobs in sync pipeline (#98)"
```
