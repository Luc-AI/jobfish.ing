# Dashboard Chronological + Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the dashboard as a chronological log filterable by score (Booking-style chip bar) and time window, replacing the current score-DESC sort that confuses users vs. the email digest.

**Architecture:** Filter state lives in `searchParams` (`?tab=…&score=…&time=…`). `getJobFeed` is refactored to accept score + time filter args and to return `{ items, totalCount }`. FeedClient becomes a client component that renders date-bucketed rows with a "Load more" button driven by a server action. The threshold/score-fold split is removed entirely — the chip bar replaces it.

**Tech Stack:** Next.js 15 (App Router, Server Components, Server Actions), React 19, Supabase (Postgres + PostgREST), TypeScript, Vitest + @testing-library/react, Tailwind, shadcn primitives (existing `Button` etc.).

**Tracking issue:** #149

---

## File Structure

**New files**
- `src/components/features/feed-filter-bar.tsx` — chip bar + time toggle (client component, navigates via `useRouter`).
- `src/components/features/feed-date-divider.tsx` — single "Today" / "Yesterday" / "Last 7 days" / "Older" divider row.
- `src/lib/feed/group-by-date.ts` — pure helper that buckets `FeedItem[]` by `date_posted` (or `created_at` fallback) into the four buckets above.
- `src/lib/feed/filters.ts` — parsing + types for `ScoreFilter` and `TimeFilter` URL params; threshold-to-floor mapping.
- `src/app/(app)/dashboard/load-more-action.ts` — server action returning the next page of feed items for the current filter selection.
- `src/test/feed-filter-bar.test.tsx` — chip selection + URL navigation tests.
- `src/test/group-by-date.test.ts` — pure-function tests for bucketing.
- `src/test/filters.test.ts` — pure-function tests for filter parsing + threshold mapping.

**Modified files**
- `src/lib/supabase/queries.ts` — extend `FeedItem.jobs` with `date_posted`; refactor `getJobFeed` to accept `ScoreFilter` + `TimeFilter` + return `{ items, totalCount }`; switch sort to `date_posted DESC NULLS LAST, created_at DESC`.
- `src/components/features/feed-client.tsx` — drop unread/read split; render date-bucketed rows; add "Load more" button; manage appended items in state.
- `src/app/(app)/dashboard/page.tsx` — parse new searchParams; mount `FeedFilterBar`; render dynamic title + empty-state CTA; drop `LowConfidenceFold` + misleading subtitle + "X new since last visit" + header `Filters` button.

**Deleted files**
- `src/components/features/low-confidence-fold.tsx` — superseded by chip filters.

**Untouched (verify only)**
- `src/lib/email/job-digest.tsx`, `src/trigger/notify-users.tsx` — digest stays score-DESC.
- `src/components/features/applied-tracker.tsx`, `src/components/features/dismissed-list.tsx` — Applied/Dismissed tabs unchanged.
- `src/components/features/job-log-row.tsx` — row UI (unread dot etc.) unchanged.

---

## Task 1: Add `date_posted` to FeedItem type and query SELECT

**Files:**
- Modify: `src/lib/supabase/queries.ts:35-62` (FeedItem type), `:133-145` (All tab SELECT), `:231-242` (Saved/Dismissed SELECT)

- [ ] **Step 1.1: Extend `FeedItem.jobs` type with `date_posted`**

In `src/lib/supabase/queries.ts`, locate the `FeedItem` type (around line 35) and add `date_posted: string | null` to the `jobs` shape:

```ts
export type FeedItem = {
  id: string
  job_id: string
  score: number
  reasoning: string | null
  dimensions: unknown
  notified_at: string | null
  created_at: string
  read_at: string | null
  chips: Chip[]
  is_unread: boolean
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
    date_posted: string | null
  }
  user_job_actions: {
    job_id: string
    status: string
    applied_at: string | null
  } | null
}
```

- [ ] **Step 1.2: Add `date_posted` to both SELECT statements**

In `getJobFeed`, both the All-tab query (around line 138) and the Saved/Dismissed query (around line 236) currently SELECT:

```ts
jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, categories)
```

(Note: the All query includes `categories`; the Saved/Dismissed query does not.) Add `date_posted` to **both**:

All-tab query (line ~138):
```ts
jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, categories, date_posted)
```

Saved/Dismissed query (line ~236):
```ts
jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, date_posted)
```

Also extend the `EvalRow` local types in **both** branches: add `date_posted: string | null` to the `jobs` shape. There are two `EvalRow` declarations (around line 167 and line 246) — update both.

- [ ] **Step 1.3: Verify type compilation**

Run: `npx tsc --noEmit`
Expected: PASS (no new type errors). If errors, fix the FeedItem consumers reported by the compiler.

- [ ] **Step 1.4: Commit**

```bash
git add src/lib/supabase/queries.ts
git commit -m "feat: include date_posted in FeedItem type and query"
```

---

## Task 2: Filter parsing helpers (`src/lib/feed/filters.ts`)

**Files:**
- Create: `src/lib/feed/filters.ts`
- Create: `src/test/filters.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `src/test/filters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseScoreFilter,
  parseTimeFilter,
  scoreFilterToFloor,
  SCORE_FILTERS,
  TIME_FILTERS,
  type ScoreFilter,
  type TimeFilter,
} from '@/lib/feed/filters'

describe('parseScoreFilter', () => {
  it('returns "threshold" by default when param is missing', () => {
    expect(parseScoreFilter(undefined)).toBe('threshold')
  })

  it('returns "threshold" for unknown values', () => {
    expect(parseScoreFilter('garbage')).toBe('threshold')
  })

  it('accepts known filter values', () => {
    expect(parseScoreFilter('hot')).toBe('hot')
    expect(parseScoreFilter('threshold')).toBe('threshold')
    expect(parseScoreFilter('eight')).toBe('eight')
    expect(parseScoreFilter('seven')).toBe('seven')
    expect(parseScoreFilter('all')).toBe('all')
  })
})

describe('parseTimeFilter', () => {
  it('returns "7d" by default when param is missing', () => {
    expect(parseTimeFilter(undefined)).toBe('7d')
  })

  it('returns "7d" for unknown values', () => {
    expect(parseTimeFilter('garbage')).toBe('7d')
  })

  it('accepts "all"', () => {
    expect(parseTimeFilter('all')).toBe('all')
  })
})

describe('scoreFilterToFloor', () => {
  const userThreshold = 7.0

  it('hot → 9', () => {
    expect(scoreFilterToFloor('hot', userThreshold)).toBe(9)
  })

  it('threshold → user threshold value', () => {
    expect(scoreFilterToFloor('threshold', 7.5)).toBe(7.5)
  })

  it('eight → 8, seven → 7', () => {
    expect(scoreFilterToFloor('eight', userThreshold)).toBe(8)
    expect(scoreFilterToFloor('seven', userThreshold)).toBe(7)
  })

  it('all → 0 (no floor)', () => {
    expect(scoreFilterToFloor('all', userThreshold)).toBe(0)
  })
})

describe('SCORE_FILTERS / TIME_FILTERS', () => {
  it('SCORE_FILTERS is exhaustive', () => {
    expect(SCORE_FILTERS).toEqual(['hot', 'threshold', 'eight', 'seven', 'all'])
  })

  it('TIME_FILTERS is exhaustive', () => {
    expect(TIME_FILTERS).toEqual(['7d', 'all'])
  })
})
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run src/test/filters.test.ts`
Expected: FAIL — module `@/lib/feed/filters` does not exist.

- [ ] **Step 2.3: Implement `filters.ts`**

Create `src/lib/feed/filters.ts`:

```ts
export const SCORE_FILTERS = ['hot', 'threshold', 'eight', 'seven', 'all'] as const
export type ScoreFilter = typeof SCORE_FILTERS[number]

export const TIME_FILTERS = ['7d', 'all'] as const
export type TimeFilter = typeof TIME_FILTERS[number]

export function parseScoreFilter(raw: string | undefined): ScoreFilter {
  if (raw && (SCORE_FILTERS as readonly string[]).includes(raw)) {
    return raw as ScoreFilter
  }
  return 'threshold'
}

export function parseTimeFilter(raw: string | undefined): TimeFilter {
  if (raw && (TIME_FILTERS as readonly string[]).includes(raw)) {
    return raw as TimeFilter
  }
  return '7d'
}

export function scoreFilterToFloor(filter: ScoreFilter, userThreshold: number): number {
  switch (filter) {
    case 'hot': return 9
    case 'threshold': return userThreshold
    case 'eight': return 8
    case 'seven': return 7
    case 'all': return 0
  }
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run src/test/filters.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/feed/filters.ts src/test/filters.test.ts
git commit -m "feat: add feed filter parsing helpers"
```

---

## Task 3: Date-bucket helper (`src/lib/feed/group-by-date.ts`)

**Files:**
- Create: `src/lib/feed/group-by-date.ts`
- Create: `src/test/group-by-date.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `src/test/group-by-date.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupByDateBucket, type DateBucket } from '@/lib/feed/group-by-date'

function makeItem(id: string, datePosted: string | null, createdAt: string): {
  id: string
  jobs: { date_posted: string | null }
  created_at: string
} {
  return { id, jobs: { date_posted: datePosted }, created_at: createdAt }
}

describe('groupByDateBucket', () => {
  // Fixed "now" so the test is deterministic
  const now = new Date('2026-05-28T12:00:00.000Z')

  it('buckets a job posted today into "today"', () => {
    const item = makeItem('a', '2026-05-28', now.toISOString())
    const result = groupByDateBucket([item], now)
    expect(result).toEqual([{ bucket: 'today', items: [item] }])
  })

  it('buckets a job posted yesterday into "yesterday"', () => {
    const item = makeItem('b', '2026-05-27', now.toISOString())
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('yesterday')
  })

  it('buckets a job 3 days old into "last_7_days"', () => {
    const item = makeItem('c', '2026-05-25', now.toISOString())
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('last_7_days')
  })

  it('buckets a job 10 days old into "older"', () => {
    const item = makeItem('d', '2026-05-18', now.toISOString())
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('older')
  })

  it('falls back to created_at when date_posted is null', () => {
    const item = makeItem('e', null, '2026-05-28T08:00:00.000Z')
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('today')
  })

  it('preserves input order within each bucket', () => {
    const a = makeItem('a', '2026-05-28', now.toISOString())
    const b = makeItem('b', '2026-05-28', now.toISOString())
    const result = groupByDateBucket([a, b], now)
    expect(result[0].items.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('emits buckets in order today → yesterday → last_7_days → older, skipping empty', () => {
    const today = makeItem('t', '2026-05-28', now.toISOString())
    const older = makeItem('o', '2026-05-01', now.toISOString())
    const result = groupByDateBucket([older, today], now)
    expect(result.map(g => g.bucket)).toEqual(['today', 'older'])
  })

  it('returns empty array for empty input', () => {
    expect(groupByDateBucket([], now)).toEqual([])
  })
})
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npx vitest run src/test/group-by-date.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `group-by-date.ts`**

Create `src/lib/feed/group-by-date.ts`:

```ts
export type DateBucket = 'today' | 'yesterday' | 'last_7_days' | 'older'

type GroupableItem = {
  jobs: { date_posted: string | null }
  created_at: string
}

const BUCKET_ORDER: DateBucket[] = ['today', 'yesterday', 'last_7_days', 'older']

function effectiveDate(item: GroupableItem): Date {
  // Fall back to created_at when date_posted is missing
  const raw = item.jobs.date_posted ?? item.created_at
  return new Date(raw)
}

function bucketFor(itemDate: Date, now: Date): DateBucket {
  // Compute calendar-day delta in the viewer's UTC frame
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diffDays = Math.floor((startOfDay(now) - startOfDay(itemDate)) / 86_400_000)

  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays <= 7) return 'last_7_days'
  return 'older'
}

export function groupByDateBucket<T extends GroupableItem>(
  items: T[],
  now: Date = new Date()
): Array<{ bucket: DateBucket; items: T[] }> {
  const byBucket = new Map<DateBucket, T[]>()
  for (const item of items) {
    const b = bucketFor(effectiveDate(item), now)
    const list = byBucket.get(b) ?? []
    list.push(item)
    byBucket.set(b, list)
  }
  return BUCKET_ORDER
    .filter(b => byBucket.has(b))
    .map(b => ({ bucket: b, items: byBucket.get(b)! }))
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `npx vitest run src/test/group-by-date.test.ts`
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/feed/group-by-date.ts src/test/group-by-date.test.ts
git commit -m "feat: bucket feed items by date"
```

---

## Task 4: Refactor `getJobFeed` — filters, chronological sort, total count

**Files:**
- Modify: `src/lib/supabase/queries.ts:104-279` (whole `getJobFeed` function for All + Saved/Dismissed branches)
- Modify: `src/app/(app)/dashboard/page.tsx` (call-site update; full rewrite in Task 7)

This task changes the signature and behavior of `getJobFeed`. The page call-site is temporarily broken; Task 7 reconciles it. To keep this commit green, we update the dashboard's call to match the new signature immediately (minimal patch — full UI rewrite in Task 7).

- [ ] **Step 4.1: Update `getJobFeed` signature and All-tab branch**

In `src/lib/supabase/queries.ts`, replace the All-tab branch of `getJobFeed`. The new signature accepts `scoreFloor` and `timeFilter`, sorts chronologically, and returns `{ items, totalCount }`.

```ts
import type { TimeFilter } from '@/lib/feed/filters'

export async function getJobFeed(
  userId: string,
  tab: FeedTab = 'all',
  page: number = 1,
  pageSize: number = 20,
  scoreFloor: number = 0,
  timeFilter: TimeFilter = '7d',
): Promise<{ data: FeedItem[]; totalCount: number; error: unknown }> {
  const supabase = await createClient()
  const offset = (page - 1) * pageSize

  if (tab === 'all') {
    const { data: prefs } = await supabase
      .from('preferences')
      .select('last_dashboard_visit_at, target_roles')
      .eq('user_id', userId)
      .maybeSingle()

    const lastVisit = prefs?.last_dashboard_visit_at ?? null
    const targetCategories = deriveTargetCategories((prefs?.target_roles ?? []) as RoleSelection[])

    const { data: dismissedActions } = await supabase
      .from('user_job_actions')
      .select('job_id')
      .eq('user_id', userId)
      .eq('status', 'dismissed')
    const dismissedJobIds = dismissedActions?.map(a => a.job_id) ?? []

    // Time-window cutoff (applied to date_posted with created_at fallback at filter time)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // DATE

    let query = supabase
      .from('job_evaluations')
      .select(`
        id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
        detailed_reasoning,
        jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, categories, date_posted)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .eq('jobs.is_active', true)
      .gte('score', scoreFloor)
      .order('date_posted', { foreignTable: 'jobs', ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (timeFilter === '7d') {
      // Filter on jobs.date_posted >= 7 days ago. Rows with NULL date_posted are excluded
      // by gte; we still want recent NULL rows (newly evaluated, no posted date), so OR with created_at recency.
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      query = query.or(`date_posted.gte.${sevenDaysAgo},and(date_posted.is.null,created_at.gte.${sevenDaysAgoIso})`, { foreignTable: 'jobs' })
      // ^ NOTE: PostgREST .or() with foreignTable filters the join. If this proves brittle,
      // fall back to two queries union'd in-memory.
    }

    if (dismissedJobIds.length > 0) {
      query = query.not('job_id', 'in', `(${dismissedJobIds.join(',')})`)
    }

    const { data: evaluations, error, count } = await query
    if (error) return { data: [], totalCount: 0, error }

    const evalJobIds = (evaluations ?? []).map(e => e.job_id)
    const actionsByJobId = new Map<string, { job_id: string; status: string; applied_at: string | null }>()
    if (evalJobIds.length > 0) {
      const { data: actions } = await supabase
        .from('user_job_actions')
        .select('job_id, status, applied_at')
        .eq('user_id', userId)
        .in('job_id', evalJobIds)
      for (const a of actions ?? []) actionsByJobId.set(a.job_id!, { job_id: a.job_id!, status: a.status, applied_at: a.applied_at })
    }

    type EvalRow = {
      id: string; job_id: string; score: number; reasoning: string | null
      dimensions: unknown; notified_at: string | null; created_at: string
      read_at: string | null; chips: unknown; detailed_reasoning: unknown
      jobs: { id: string; title: string; company: string; location: string | null; url: string; source: string; remote_type: string | null; industry: string | null; synced_at: string; categories: string[] | null; date_posted: string | null }
    }

    const rawEvals = (evaluations ?? []) as EvalRow[]
    const filteredEvals = targetCategories.length > 0
      ? rawEvals.filter(e => {
          const cats = e.jobs.categories
          if (!cats || cats.length === 0) return true
          return cats.some(c => targetCategories.includes(c))
        })
      : rawEvals

    const items: FeedItem[] = filteredEvals.map(e => {
      const rawAction = actionsByJobId.get(e.job_id) ?? null

      const chips: Chip[] = Array.isArray(e.chips) && e.chips.length > 0
        ? (e.chips as Chip[])
        : deriveChipsFromReasoning(
            e.detailed_reasoning as { strengths?: string[]; concerns?: string[]; red_flags?: string[] } | null
          )

      const is_unread =
        e.read_at === null &&
        (lastVisit === null || (e.notified_at !== null && e.notified_at > lastVisit))

      return {
        id: e.id,
        job_id: e.job_id,
        score: e.score,
        reasoning: e.reasoning,
        dimensions: e.dimensions,
        notified_at: e.notified_at,
        created_at: e.created_at,
        read_at: e.read_at,
        chips,
        is_unread,
        jobs: e.jobs as FeedItem['jobs'],
        user_job_actions: rawAction,
      }
    })

    return { data: items, totalCount: count ?? items.length, error: null }
  }

  // ... (Saved/Dismissed branch follows in Step 4.2)
```

- [ ] **Step 4.2: Update Saved/Dismissed branch with same signature**

For the `tab === 'saved' || tab === 'dismissed'` branch (around line 215), apply the same changes:

```ts
  if (tab === 'saved' || tab === 'dismissed') {
    const { data: actions, error: actionsError } = await supabase
      .from('user_job_actions')
      .select('job_id, status, applied_at')
      .eq('user_id', userId)
      .eq('status', tab)
    if (actionsError) return { data: [], totalCount: 0, error: actionsError }

    const actionJobIds = (actions ?? []).map(a => a.job_id!)
    if (actionJobIds.length === 0) return { data: [], totalCount: 0, error: null }

    const actionsByJobId = new Map<string, { job_id: string; status: string; applied_at: string | null }>(
      (actions ?? []).map(a => [a.job_id!, { job_id: a.job_id!, status: a.status, applied_at: a.applied_at }])
    )

    let query = supabase
      .from('job_evaluations')
      .select(`
        id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
        detailed_reasoning,
        jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, date_posted)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .eq('jobs.is_active', true)
      .in('job_id', actionJobIds)
      .gte('score', scoreFloor)
      .order('date_posted', { foreignTable: 'jobs', ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (timeFilter === '7d') {
      const sevenDaysAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      query = query.or(`date_posted.gte.${sevenDaysAgoDate},and(date_posted.is.null,created_at.gte.${sevenDaysAgoIso})`, { foreignTable: 'jobs' })
    }

    const { data: evaluations, error, count } = await query
    if (error) return { data: [], totalCount: 0, error }

    type EvalRow = {
      id: string; job_id: string; score: number; reasoning: string | null
      dimensions: unknown; notified_at: string | null; created_at: string
      read_at: string | null; chips: unknown; detailed_reasoning: unknown
      jobs: { id: string; title: string; company: string; location: string | null; url: string; source: string; remote_type: string | null; industry: string | null; synced_at: string; date_posted: string | null }
    }

    const items: FeedItem[] = ((evaluations ?? []) as EvalRow[]).map(e => {
      const rawAction = actionsByJobId.get(e.job_id) ?? null
      const chips: Chip[] = Array.isArray(e.chips) && e.chips.length > 0
        ? (e.chips as Chip[])
        : deriveChipsFromReasoning(
            e.detailed_reasoning as { strengths?: string[]; concerns?: string[]; red_flags?: string[] } | null
          )

      return {
        id: e.id,
        job_id: e.job_id,
        score: e.score,
        reasoning: e.reasoning,
        dimensions: e.dimensions,
        notified_at: e.notified_at,
        created_at: e.created_at,
        read_at: e.read_at,
        chips,
        is_unread: false,
        jobs: e.jobs as FeedItem['jobs'],
        user_job_actions: rawAction,
      }
    })

    return { data: items, totalCount: count ?? items.length, error: null }
  }

  return { data: [], totalCount: 0, error: null }
}
```

- [ ] **Step 4.3: Patch the dashboard call-site so the build stays green**

In `src/app/(app)/dashboard/page.tsx`, the existing call (around line 51) destructures `data` only. Update the destructure to read the new shape but keep all other UI logic identical (full rewrite happens in Task 7):

Find:
```ts
const [feedResult, prefsResult, appliedResult] = await Promise.all([
  tab !== 'applied' ? getJobFeed(user.id, tab, page, pageSize) : Promise.resolve({ data: [] as FeedItem[], error: null }),
  ...
])

const feed: FeedItem[] = feedResult.data ?? []
```

Replace with:
```ts
const [feedResult, prefsResult, appliedResult] = await Promise.all([
  tab !== 'applied' ? getJobFeed(user.id, tab, page, pageSize) : Promise.resolve({ data: [] as FeedItem[], totalCount: 0, error: null }),
  getPreferences(user.id),
  tab === 'applied' ? getAppliedJobs(user.id) : Promise.resolve({ data: [] as AppliedJob[], error: null }),
])

const feed: FeedItem[] = feedResult.data ?? []
```

(The `getJobFeed` call uses default `scoreFloor=0` and `timeFilter='7d'` — behaviorally close to "All scores, last 7 days." We'll wire real filter parsing in Task 7.)

- [ ] **Step 4.4: Run type-check and existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. The dashboard UI now shows jobs sorted by `date_posted DESC` (no chip bar yet — that comes in Task 5/7).

If the PostgREST `.or(…, { foreignTable: 'jobs' })` form rejects at runtime (some PostgREST versions are picky about embedded-table OR), fall back to the simpler `gte('jobs.date_posted', sevenDaysAgoDate)` and drop NULL-date_posted rows from the 7-day filter (accept that small loss — they remain visible under "All time").

- [ ] **Step 4.5: Smoke-test the dashboard locally**

Run: `npm run dev`
Open http://localhost:3000/dashboard and verify:
- Jobs render in newest-first order by posting date.
- No console errors.

Stop the dev server (Ctrl+C).

- [ ] **Step 4.6: Commit**

```bash
git add src/lib/supabase/queries.ts src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: chronological sort and filter args in getJobFeed"
```

---

## Task 5: `FeedFilterBar` component (chip row + time toggle)

**Files:**
- Create: `src/components/features/feed-filter-bar.tsx`
- Create: `src/test/feed-filter-bar.test.tsx`

- [ ] **Step 5.1: Write the failing test**

Create `src/test/feed-filter-bar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedFilterBar } from '@/components/features/feed-filter-bar'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('tab=all'),
}))

beforeEach(() => pushMock.mockReset())

describe('FeedFilterBar', () => {
  it('renders all five score chips and both time options', () => {
    render(<FeedFilterBar activeScore="threshold" activeTime="7d" userThreshold={7.0} />)
    expect(screen.getByRole('button', { name: /hot/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /threshold/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '8+' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7+' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all scores/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /7 days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all time/i })).toBeInTheDocument()
  })

  it('shows the user threshold in the Threshold chip sublabel', () => {
    render(<FeedFilterBar activeScore="threshold" activeTime="7d" userThreshold={7.5} />)
    expect(screen.getByText(/7\.5\+/)).toBeInTheDocument()
  })

  it('marks the active chip with aria-pressed=true', () => {
    render(<FeedFilterBar activeScore="hot" activeTime="all" userThreshold={7.0} />)
    expect(screen.getByRole('button', { name: /hot/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /threshold/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /all time/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking a score chip navigates to ?tab=all&score=…&time=…', async () => {
    const user = userEvent.setup()
    render(<FeedFilterBar activeScore="threshold" activeTime="7d" userThreshold={7.0} />)
    await user.click(screen.getByRole('button', { name: /^8\+$/ }))
    expect(pushMock).toHaveBeenCalledWith('?tab=all&score=eight&time=7d')
  })

  it('clicking a time button preserves the score filter', async () => {
    const user = userEvent.setup()
    render(<FeedFilterBar activeScore="hot" activeTime="7d" userThreshold={7.0} />)
    await user.click(screen.getByRole('button', { name: /all time/i }))
    expect(pushMock).toHaveBeenCalledWith('?tab=all&score=hot&time=all')
  })
})
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `npx vitest run src/test/feed-filter-bar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement `FeedFilterBar`**

Create `src/components/features/feed-filter-bar.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { ScoreFilter, TimeFilter } from '@/lib/feed/filters'

interface FeedFilterBarProps {
  activeScore: ScoreFilter
  activeTime: TimeFilter
  userThreshold: number
}

const SCORE_CHIPS: Array<{ value: ScoreFilter; label: string; emoji?: string }> = [
  { value: 'hot', label: 'Hot', emoji: '🔥' },
  { value: 'threshold', label: 'Threshold', emoji: '⭐' },
  { value: 'eight', label: '8+' },
  { value: 'seven', label: '7+' },
  { value: 'all', label: 'All scores' },
]

const TIME_CHIPS: Array<{ value: TimeFilter; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: 'all', label: 'All time' },
]

export function FeedFilterBar({ activeScore, activeTime, userThreshold }: FeedFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') ?? 'all'

  function navigate(score: ScoreFilter, time: TimeFilter) {
    const params = new URLSearchParams()
    params.set('tab', tab)
    params.set('score', score)
    params.set('time', time)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 mb-4">
      <div className="flex flex-wrap gap-2">
        {SCORE_CHIPS.map(chip => {
          const active = chip.value === activeScore
          const sublabel = chip.value === 'threshold' ? ` (${userThreshold}+)` : ''
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => navigate(chip.value, activeTime)}
              className={cn(
                'inline-flex items-center gap-1 text-sm rounded-full px-3 py-1.5 transition-colors min-h-[36px]',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-transparent text-foreground border border-border hover:bg-muted'
              )}
            >
              {chip.emoji && <span>{chip.emoji}</span>}
              <span>{chip.label}{sublabel}</span>
            </button>
          )
        })}
      </div>
      <div
        className="inline-flex rounded-full border border-border p-0.5"
        role="group"
        aria-label="Time window"
      >
        {TIME_CHIPS.map(chip => {
          const active = chip.value === activeTime
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => navigate(activeScore, chip.value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px]',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5.4: Run test to verify it passes**

Run: `npx vitest run src/test/feed-filter-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/features/feed-filter-bar.tsx src/test/feed-filter-bar.test.tsx
git commit -m "feat: chip-bar component for score and time filters"
```

---

## Task 6: Load-more server action (`src/app/(app)/dashboard/load-more-action.ts`)

**Files:**
- Create: `src/app/(app)/dashboard/load-more-action.ts`

- [ ] **Step 6.1: Implement the server action**

Create `src/app/(app)/dashboard/load-more-action.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJobFeed, getPreferences, type FeedItem, type FeedTab } from '@/lib/supabase/queries'
import { scoreFilterToFloor, type ScoreFilter, type TimeFilter } from '@/lib/feed/filters'

interface LoadMoreInput {
  tab: FeedTab
  score: ScoreFilter
  time: TimeFilter
  offset: number
  pageSize: number
}

export async function loadMoreFeed(input: LoadMoreInput): Promise<{ items: FeedItem[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const prefs = await getPreferences(user.id)
  const userThreshold = prefs.data?.score_threshold ?? 7.0
  const scoreFloor = scoreFilterToFloor(input.score, userThreshold)

  // Convert offset → page (getJobFeed is page-based)
  const page = Math.floor(input.offset / input.pageSize) + 1
  const result = await getJobFeed(user.id, input.tab, page, input.pageSize, scoreFloor, input.time)

  return { items: result.data }
}
```

- [ ] **Step 6.2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6.3: Commit**

```bash
git add src/app/\(app\)/dashboard/load-more-action.ts
git commit -m "feat: load-more server action for paginated feed"
```

---

## Task 7: `FeedClient` — date dividers + Load more

**Files:**
- Modify: `src/components/features/feed-client.tsx` (rewrite)

- [ ] **Step 7.1: Rewrite `feed-client.tsx`**

Replace the file contents with:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { JobLogRow } from './job-log-row'
import { groupByDateBucket, type DateBucket } from '@/lib/feed/group-by-date'
import { loadMoreFeed } from '@/app/(app)/dashboard/load-more-action'
import type { FeedItem, FeedTab } from '@/lib/supabase/queries'
import type { ScoreFilter, TimeFilter } from '@/lib/feed/filters'

const BUCKET_LABELS: Record<DateBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  older: 'Older',
}

interface FeedClientProps {
  initialItems: FeedItem[]
  totalCount: number
  pageSize: number
  tab: FeedTab
  scoreFilter: ScoreFilter
  timeFilter: TimeFilter
  onPass: (jobId: string) => Promise<void>
  onSave: (jobId: string) => Promise<void>
  onMarkRead: (jobId: string) => Promise<void>
}

export function FeedClient({
  initialItems,
  totalCount,
  pageSize,
  tab,
  scoreFilter,
  timeFilter,
  onPass,
  onSave,
  onMarkRead,
}: FeedClientProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const visibleItems = items.filter((i: FeedItem) => !dismissedIds.has(i.job_id))
  const hasMore = items.length < totalCount

  if (visibleItems.length === 0) {
    return null // Empty state rendered by the parent (Task 8) so it can include CTAs.
  }

  const grouped = groupByDateBucket(visibleItems)

  function handleLoadMore() {
    startTransition(async () => {
      const { items: more } = await loadMoreFeed({
        tab,
        score: scoreFilter,
        time: timeFilter,
        offset: items.length,
        pageSize,
      })
      setItems((prev: FeedItem[]) => [...prev, ...more])
    })
  }

  function renderRow(item: FeedItem) {
    const status = (item.user_job_actions?.status ?? 'new') as 'new' | 'saved' | 'applied' | 'dismissed'
    return (
      <JobLogRow
        key={item.id}
        id={item.id}
        jobId={item.job_id}
        title={item.jobs.title}
        company={item.jobs.company}
        location={item.jobs.location}
        url={item.jobs.url}
        remoteType={item.jobs.remote_type}
        score={item.score}
        chips={item.chips}
        isUnread={item.is_unread}
        notifiedAt={item.notified_at}
        status={status}
        appliedAt={item.user_job_actions?.applied_at}
        onPass={() => {
          setDismissedIds((prev: Set<string>) => new Set([...prev, item.job_id]))
          void onPass(item.job_id)
        }}
        onSave={() => void onSave(item.job_id)}
        onDetails={() => {
          void onMarkRead(item.job_id)
          router.push(`/dashboard/jobs/${item.job_id}`)
        }}
      />
    )
  }

  return (
    <div>
      {grouped.map(group => (
        <div key={group.bucket} className="mb-6">
          <div className="text-sm font-semibold text-muted-foreground pb-2 mb-3 border-b border-border">
            {BUCKET_LABELS[group.bucket]}
          </div>
          <div className="flex flex-col gap-3">
            {group.items.map(renderRow)}
          </div>
        </div>
      ))}
      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isPending}
            className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50 min-h-[44px]"
          >
            {isPending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
```

Note the prop signature change: callers now pass `initialItems` (not `items`), plus `totalCount`, `pageSize`, `tab`, `scoreFilter`, `timeFilter`. `showSections` is removed. The empty-state branch returns `null` so the parent (Task 8) can render the count-line + CTA in its place.

- [ ] **Step 7.2: Type-check (will fail until Task 8 updates the caller)**

Run: `npx tsc --noEmit`
Expected: FAIL with type errors at the dashboard page call-site (which is fixed in Task 8). This is intentional — do not fix here.

- [ ] **Step 7.3: Commit**

```bash
git add src/components/features/feed-client.tsx
git commit -m "feat: date-bucketed feed with load-more"
```

---

## Task 8: Dashboard page wiring + empty-state CTA

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx` (rewrite the All + Saved branches)
- Delete: `src/components/features/low-confidence-fold.tsx`

- [ ] **Step 8.1: Rewrite `src/app/(app)/dashboard/page.tsx`**

Replace the file contents with:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  getJobFeed,
  getAppliedJobs,
  getPreferences,
  upsertLastVisit,
  type FeedTab,
  type FeedItem,
  type AppliedJob,
} from '@/lib/supabase/queries'
import {
  parseScoreFilter,
  parseTimeFilter,
  scoreFilterToFloor,
  type ScoreFilter,
  type TimeFilter,
} from '@/lib/feed/filters'
import { LogTab } from '@/components/features/log-tab'
import { FeedClient } from '@/components/features/feed-client'
import { FeedFilterBar } from '@/components/features/feed-filter-bar'
import { AppliedTracker, type TrackerJob } from '@/components/features/applied-tracker'
import { DismissedList, type DismissedJob } from '@/components/features/dismissed-list'
import { Button } from '@/components/ui/button'
import {
  passJobAction,
  saveJobAction,
  markJobReadAction,
  deleteJobAction,
} from './actions'

interface DashboardPageProps {
  searchParams: Promise<{ tab?: string; score?: string; time?: string }>
}

function isValidTab(s: string | undefined): s is FeedTab {
  return s === 'all' || s === 'saved' || s === 'applied' || s === 'dismissed'
}

function computeBucket(appliedAt: string | null): 'awaiting' | 'ghosted' {
  if (!appliedAt) return 'awaiting'
  const daysSince = (Date.now() - new Date(appliedAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince > 14 ? 'ghosted' : 'awaiting'
}

function buildTitle(score: ScoreFilter, time: TimeFilter, count: number, threshold: number): string {
  const noun = count === 1 ? 'job' : 'jobs'
  const scorePhrase: Record<ScoreFilter, string> = {
    hot: count === 1 ? 'hot job' : 'hot jobs',
    threshold: `${noun} above threshold`,
    eight: `${noun} scoring 8 or higher`,
    seven: `${noun} scoring 7 or higher`,
    all: noun,
  }
  const timePhrase = time === '7d' ? 'in the last 7 days' : 'all-time'
  const head = score === 'hot' ? `${count} ${scorePhrase[score]}` : `${count} ${scorePhrase[score]}`
  return `${head} ${timePhrase}`
}

interface EmptyCTA { label: string; href: string }

function buildEmptyCTAs(
  tab: FeedTab,
  score: ScoreFilter,
  time: TimeFilter
): EmptyCTA[] {
  const ctas: EmptyCTA[] = []
  if (time === '7d') {
    const params = new URLSearchParams({ tab, score, time: 'all' })
    ctas.push({ label: 'All time', href: `?${params.toString()}` })
  }
  if (score !== 'all') {
    const broader: ScoreFilter = score === 'hot' ? 'eight' : score === 'eight' ? 'seven' : 'all'
    const params = new URLSearchParams({ tab, score: broader, time })
    const label = broader === 'eight' ? '8+' : broader === 'seven' ? '7+' : 'All scores'
    ctas.push({ label, href: `?${params.toString()}` })
  }
  return ctas
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const tab: FeedTab = isValidTab(params.tab) ? params.tab : 'all'
  const score: ScoreFilter = parseScoreFilter(params.score)
  const time: TimeFilter = parseTimeFilter(params.time)
  const pageSize = 20

  const prefsResult = await getPreferences(user.id)
  const userThreshold = prefsResult.data?.score_threshold ?? 7.0
  const scoreFloor = scoreFilterToFloor(score, userThreshold)

  const usesFilteredFeed = tab === 'all' || tab === 'saved'

  const [feedResult, appliedResult] = await Promise.all([
    usesFilteredFeed
      ? getJobFeed(user.id, tab, 1, pageSize, scoreFloor, time)
      : Promise.resolve({ data: [] as FeedItem[], totalCount: 0, error: null }),
    tab === 'applied' ? getAppliedJobs(user.id) : Promise.resolve({ data: [] as AppliedJob[], error: null }),
  ])

  const feed: FeedItem[] = feedResult.data ?? []
  const totalCount = feedResult.totalCount ?? 0

  const [savedCountResult, appliedCountResult, dismissedCountResult] = await Promise.all([
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'saved'),
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'applied'),
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'dismissed'),
  ])

  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'saved', label: 'Saved', count: savedCountResult.count ?? 0 },
    { value: 'applied', label: 'Applied', count: appliedCountResult.count ?? 0 },
    { value: 'dismissed', label: 'Dismissed', count: dismissedCountResult.count ?? 0 },
  ]

  if (tab === 'all') await upsertLastVisit(user.id)

  const dismissedJobs: DismissedJob[] = tab === 'dismissed'
    ? feed.map((f: FeedItem) => ({
        job_id: f.job_id,
        title: f.jobs.title,
        company: f.jobs.company,
        location: f.jobs.location,
        remoteType: f.jobs.remote_type,
        url: f.jobs.url,
      }))
    : []

  const trackerJobs: TrackerJob[] = (appliedResult.data ?? []).map((j: AppliedJob) => ({
    job_id: j.job_id,
    title: j.title,
    company: j.company,
    location: j.location,
    url: j.url,
    applied_at: j.applied_at,
    bucket: computeBucket(j.applied_at),
  }))

  return (
    <div style={{ maxWidth: 816, margin: '0 auto', padding: '32px 16px', overflowX: 'hidden' }}>
      <div className="flex items-start justify-between mb-6">
        <h1
          className="font-bold leading-tight"
          style={{ fontSize: 28, letterSpacing: '-0.6px' }}
        >
          Your job log
        </h1>
        <Button variant="outline" size="sm" disabled>Search</Button>
      </div>

      <LogTab tabs={tabs} activeTab={tab} />

      {usesFilteredFeed && (
        <>
          <FeedFilterBar activeScore={score} activeTime={time} userThreshold={userThreshold} />

          <div className="text-sm text-muted-foreground mb-4">
            {buildTitle(score, time, totalCount, userThreshold)}
            {totalCount === 0 && (() => {
              const ctas = buildEmptyCTAs(tab, score, time)
              if (ctas.length === 0) return null
              return (
                <>
                  {' '}Try{' '}
                  {ctas.map((cta, i) => (
                    <span key={cta.href}>
                      <Link href={cta.href} className="underline">{cta.label}</Link>
                      {i < ctas.length - 1 ? ' or ' : '.'}
                    </span>
                  ))}
                </>
              )
            })()}
          </div>

          {totalCount > 0 && (
            <FeedClient
              initialItems={feed}
              totalCount={totalCount}
              pageSize={pageSize}
              tab={tab}
              scoreFilter={score}
              timeFilter={time}
              onPass={passJobAction}
              onSave={saveJobAction}
              onMarkRead={markJobReadAction}
            />
          )}
        </>
      )}

      {tab === 'applied' && (
        <div className="mt-6">
          <AppliedTracker jobs={trackerJobs} />
        </div>
      )}

      {tab === 'dismissed' && (
        <div className="mt-6">
          <DismissedList
            jobs={dismissedJobs}
            onRestore={deleteJobAction}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8.2: Delete `LowConfidenceFold`**

```bash
git rm src/components/features/low-confidence-fold.tsx
```

If a test exists for it, delete that too (none found at plan-writing time; verify with `grep -r "LowConfidenceFold" src`).

- [ ] **Step 8.3: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. If any test references the old `FeedClient` props (`items`, `showSections`), update it to the new signature, or delete the test if it's covered by the new tests.

- [ ] **Step 8.4: Commit**

```bash
git add src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: wire filter bar, dynamic title, and empty-state CTAs"
```

---

## Task 9: Manual verification (golden path + edge cases + mobile)

This task is verification only — no code changes expected. If verification reveals defects, fix them in a follow-up commit on this branch.

- [ ] **Step 9.1: Run the dev server**

Run: `npm run dev`

- [ ] **Step 9.2: Golden path on All tab**

Open http://localhost:3000/dashboard. Verify:
- Default selection: ⭐ Threshold + 7 days (chip and toggle visibly active).
- Title reads e.g. "12 jobs above threshold in the last 7 days" (number matches what you see scrolling).
- Rows are sorted by `date_posted DESC`. Spot-check the top row's posting date vs. an older row.
- Date dividers appear: Today / Yesterday / Last 7 days as applicable.
- Per-row unread dot still renders on unread items.

- [ ] **Step 9.3: Filter interaction**

Click 🔥 Hot. Verify:
- URL updates to `?tab=all&score=hot&time=7d`.
- Title updates: "N hot jobs in the last 7 days".
- Only rows with `score >= 9` remain.

Click All time. Verify:
- URL: `?tab=all&score=hot&time=all`.
- Title: "N hot jobs all-time".
- Older "Older" divider appears if older 9s exist.

Click All scores + All time. Verify:
- Lowest-score jobs now appear (including <7).

- [ ] **Step 9.4: Empty-state CTA**

Pick a filter combo that yields zero (e.g. 🔥 Hot + 7 days on a quiet account). Verify:
- Title reads "0 hot jobs in the last 7 days."
- Below the title: "Try **All time** or **8+**." Each is a clickable link.
- Clicking a CTA navigates correctly and updates results.

- [ ] **Step 9.5: Load more**

Switch to All scores + All time. If you have >20 results:
- Scroll to bottom, click "Load more".
- Verify ~20 more rows append.
- Verify date dividers re-group correctly (the new rows extend an existing bucket or open the "Older" bucket).
- Verify "Load more" disappears when totalCount is reached.

- [ ] **Step 9.6: Saved tab parity**

Save one job (heart icon on a row), then switch to Saved tab. Verify:
- Same chip bar + time toggle render.
- The saved job appears under its posting-date bucket.

- [ ] **Step 9.7: Applied + Dismissed unchanged**

Switch to Applied. Verify:
- No chip bar (existing kanban-style tracker).
- Behavior identical to before.

Switch to Dismissed. Verify:
- No chip bar.
- Behavior identical to before.

- [ ] **Step 9.8: Mobile check at 390×844**

Open Chrome DevTools → device emulation → iPhone 14 (390×844). On the All tab:
- No horizontal scroll.
- Chip row wraps cleanly; time toggle on right is reachable.
- All filter buttons have ≥44px touch targets (use the inspector's box model — chips are ~36px tall; bump to 44 if any feel too small).
- Title and date dividers readable without zoom (body ≥16px).
- "Load more" button reachable.

Note: if chip touch-target is under 44px, increase `min-h-[36px]` to `min-h-[44px]` in `feed-filter-bar.tsx` and re-verify. Commit as `fix: bump filter chip touch-target to 44px on mobile`.

- [ ] **Step 9.9: Stop dev server**

Ctrl+C.

- [ ] **Step 9.10: Final lint + test run**

```bash
npx tsc --noEmit
npx vitest run
```
Both must pass. If any test fails, fix or remove obsolete tests on this branch.

- [ ] **Step 9.11: Final commit (only if Step 9.8 required a tweak)**

If you bumped touch targets:
```bash
git add src/components/features/feed-filter-bar.tsx
git commit -m "fix: 44px touch targets on filter chips"
```

---

## Task 10: Open the PR

- [ ] **Step 10.1: Push branch and open PR to `develop`**

```bash
git push -u origin HEAD
gh pr create --base develop --title "feat: chronological dashboard with score + time filter chips" --body "$(cat <<'EOF'
## Summary
- Dashboard reframed as a chronological log (`date_posted DESC`).
- Booking-style score chip bar (🔥 Hot / ⭐ Threshold / 8+ / 7+ / All scores), single-select cumulative.
- Time toggle (7 days / All time) on the right.
- Dynamic title sentence + empty-state CTAs.
- Date dividers (Today / Yesterday / Last 7 days / Older).
- "Load more" pagination.
- `LowConfidenceFold` removed; "freshness × match score" subtitle removed.

Closes #149

## Test plan
- [ ] Default view: ⭐ Threshold + 7 days, rows sorted by post date
- [ ] 🔥 Hot filter narrows to score >= 9
- [ ] All time + All scores reveals older / lower-score jobs
- [ ] Empty-state CTAs swap matching filter
- [ ] Load more appends without dups, date dividers regroup
- [ ] Saved tab uses same chip bar
- [ ] Applied + Dismissed tabs unchanged
- [ ] Mobile at 390×844: no horizontal scroll, 44px touch targets, ≥16px body

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage**: every locked decision (Q1–Q13) maps to a task. Sort field & fallback → Task 1+4. Hot definition → Task 2. Chip set + cumulative + single-select → Tasks 2 + 5. Scope All+Saved → Task 8. Time toggle → Task 5+4. Layout → Task 5. Title + empty CTA → Task 8. Pagination → Tasks 6+7. URL state → Tasks 2+5+8. Date dividers → Tasks 3+7. UI cleanup (LowConfidenceFold, subtitle, X new, Filters button) → Task 8. Saved parity → Task 8.
- **PostgREST risk**: the `.or(…, { foreignTable: 'jobs' })` syntax in Task 4 is the most likely runtime surprise. Step 4.4 includes the documented fallback (drop the NULL-date_posted edge case, accept that they're only visible under "All time").
- **Type consistency**: `FeedItem.jobs.date_posted: string | null` is set in Task 1 and consumed identically in Tasks 3, 4, 7. `ScoreFilter` / `TimeFilter` defined in Task 2 are referenced consistently in 5, 6, 7, 8.
- **No placeholders**: every step has executable code or commands. Empty-state CTA logic (`buildEmptyCTAs`) is fully spelled out in Task 8.
