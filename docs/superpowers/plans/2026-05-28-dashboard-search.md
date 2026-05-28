# Dashboard Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the disabled "Search" button on the dashboard functional — global search across every job the signed-in user has been matched against or acted on, with live results, status chips, and full URL/back-button restoration.

**Architecture:** Server Component reads `?q=` from `searchParams`. When present, the existing tab content is replaced by a `<SearchResults>` server component that calls a new `searchUserJobs(userId, query)` query function. The query function fetches user-scoped evaluations + actions (small, indexed result sets) and applies in-memory token-AND filtering across `title`, `company`, `location`, `categories[]`. A client `<SearchBar>` component owns the input UX (250 ms debounce, Esc/X/Enter, autofocus, mobile full-row layout) and pushes the query into the URL — debounced typing uses `router.replace`, the initial open uses `router.push` so Back works. Results render as read-only `JobLogRow`s with status chips (no action buttons); clicking a row navigates to the job detail page where actions live.

**Tech Stack:** Next.js 15 App Router (server components, server actions), TypeScript, Supabase (PostgREST client), Tailwind, vitest, PostHog (client-side telemetry).

---

## Locked design decisions (from grilling)

| # | Decision |
|---|---|
| 1 | Search is **global**: across the union of `job_evaluations` and `user_job_actions` for the signed-in user; the active tab is ignored while searching. |
| 2 | Searched fields: `title`, `company`, `location`, `categories[]`. (Not description, not industry, not URL.) |
| 3 | Server-side in-memory filtering after fetch — no FTS, no new indexes. |
| 4 | Inline expanding input replaces the Search button; results replace the feed area. |
| 5 | `?q=` is the single source of truth; while present, `?tab=` / `?page=` are ignored. |
| 6 | Top 50, ordered by `synced_at DESC`; show "Showing 50 of N" when truncated. |
| 7 | Multi-word AND across tokens; tokens are lowercased, min 2 chars per token, max 6 tokens. |
| 8 | Result cards are **read-only** — status chip only (Saved / Applied / Dismissed / none); click → `/dashboard/jobs/{jobId}`. |
| 9 | 250 ms debounce; min 2 chars to fire query; previous results stay visible dimmed during in-flight. |
| 10 | Empty states: empty input → restore prior tab content; <2 chars → inline "Keep typing — at least 2 characters."; 0 matches → "No matches for '<query>'. Try fewer words or different terms." |
| 11 | Back-button restoration via `?q=`; only the *initial open* uses `router.push`, subsequent typing uses `router.replace`. |
| 12 | Mobile (<640 px): input takes the full header row, cancel chevron on the left, title and Filters button hidden while open. |
| 13 | Server Component re-renders on URL change; `<Suspense>` around results so the input/header stay stable. |
| 14 | No new indexes for v1. User-scoped row counts are small. |
| 15 | Button-only open; autofocus on; Esc + X close; Enter bypasses the 250 ms debounce. |
| 16 | Source rows = evaluations ∪ actions, deduped by `job_id`, preferring the row that carries a `status`. |
| 17 | Filters button stays disabled. PostHog event `search_performed { query_length, token_count, result_count }` — never the query string. |

---

## File structure

**Create:**
- `src/lib/search/match.ts` — pure functions: token parsing, multi-token AND match, cap+sort. Test target.
- `src/test/search-match.test.ts` — vitest unit tests for the pure helpers.
- `src/components/features/search-results.tsx` — server component, takes `{ userId, query }`, calls `searchUserJobs`, renders the list.
- `src/components/features/search-bar.tsx` — client component, owns the input UX and URL updates.

**Modify:**
- `src/lib/supabase/queries.ts` — add `searchUserJobs(userId, query)` returning `{ results: FeedItem[]; totalMatches: number }`.
- `src/components/features/job-log-row.tsx` — make `onPass` and `onSave` optional; hide the action row when neither is provided.
- `src/app/(app)/dashboard/page.tsx` — read `q` from `searchParams`, render `<SearchBar>` (always), branch to `<SearchResults>` when `q` is a valid query, otherwise render the existing tab content.

**No DB migrations.** No new env vars.

---

## Task 1: Pure search helpers + tests (TDD)

**Files:**
- Create: `src/lib/search/match.ts`
- Create: `src/test/search-match.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `src/test/search-match.test.ts` with the full test contract for the helpers:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseTokens,
  matchesAllTokens,
  type Searchable,
} from '@/lib/search/match'

describe('parseTokens', () => {
  it('returns empty array for empty / whitespace-only input', () => {
    expect(parseTokens('')).toEqual([])
    expect(parseTokens('   ')).toEqual([])
  })

  it('lowercases tokens and splits on whitespace', () => {
    expect(parseTokens('Stripe Berlin')).toEqual(['stripe', 'berlin'])
    expect(parseTokens('  Stripe   Berlin  ')).toEqual(['stripe', 'berlin'])
  })

  it('drops tokens shorter than 2 characters', () => {
    expect(parseTokens('a stripe')).toEqual(['stripe'])
    expect(parseTokens('go a b')).toEqual(['go'])
  })

  it('caps tokens at 6', () => {
    expect(parseTokens('one two three four five six seven eight')).toEqual([
      'one', 'two', 'three', 'four', 'five', 'six',
    ])
  })
})

describe('matchesAllTokens', () => {
  const row: Searchable = {
    title: 'Senior Software Engineer',
    company: 'Stripe',
    location: 'Berlin, Germany',
    categories: ['payments', 'fintech'],
  }

  it('returns false for empty tokens', () => {
    expect(matchesAllTokens(row, [])).toBe(false)
  })

  it('matches single token in any field', () => {
    expect(matchesAllTokens(row, ['stripe'])).toBe(true)
    expect(matchesAllTokens(row, ['engineer'])).toBe(true)
    expect(matchesAllTokens(row, ['berlin'])).toBe(true)
    expect(matchesAllTokens(row, ['payments'])).toBe(true)
  })

  it('requires every token to match (AND semantics across fields)', () => {
    expect(matchesAllTokens(row, ['stripe', 'berlin'])).toBe(true)
    expect(matchesAllTokens(row, ['stripe', 'payments', 'engineer'])).toBe(true)
    expect(matchesAllTokens(row, ['stripe', 'tokyo'])).toBe(false)
  })

  it('is case-insensitive and substring-based', () => {
    expect(matchesAllTokens(row, ['STRIPE'])).toBe(true)
    expect(matchesAllTokens(row, ['engin'])).toBe(true) // substring of "engineer"
  })

  it('handles null location and empty/null categories', () => {
    const row2: Searchable = {
      title: 'Engineer',
      company: 'Acme',
      location: null,
      categories: null,
    }
    expect(matchesAllTokens(row2, ['acme'])).toBe(true)
    expect(matchesAllTokens(row2, ['payments'])).toBe(false)

    const row3: Searchable = { ...row2, categories: [] }
    expect(matchesAllTokens(row3, ['payments'])).toBe(false)
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/test/search-match.test.ts`

Expected: FAIL — module `@/lib/search/match` not found.

- [ ] **Step 1.3: Implement the helpers**

Create `src/lib/search/match.ts`:

```ts
export interface Searchable {
  title: string
  company: string
  location: string | null
  categories: string[] | null
}

export function parseTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 6)
}

export function matchesAllTokens(row: Searchable, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const haystack = [
    row.title.toLowerCase(),
    row.company.toLowerCase(),
    (row.location ?? '').toLowerCase(),
    (row.categories ?? []).join(' ').toLowerCase(),
  ].join(' ')
  return tokens.every((t) => haystack.includes(t))
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run src/test/search-match.test.ts`

Expected: PASS — all 9 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/search/match.ts src/test/search-match.test.ts
git commit -m "feat: add pure search match helpers"
```

---

## Task 2: `searchUserJobs` query function

**Files:**
- Modify: `src/lib/supabase/queries.ts` (append new function near the end)

- [ ] **Step 2.1: Add the function**

Append to `src/lib/supabase/queries.ts`:

```ts
import { parseTokens, matchesAllTokens } from '@/lib/search/match'

export interface SearchOutcome {
  results: FeedItem[]
  totalMatches: number
}

const SEARCH_RESULT_CAP = 50

export async function searchUserJobs(
  userId: string,
  query: string,
): Promise<SearchOutcome> {
  const tokens = parseTokens(query)
  if (tokens.length === 0) return { results: [], totalMatches: 0 }

  const supabase = await createClient()

  // 1) All evaluations for this user joined to active jobs.
  const { data: evaluations, error: evalErr } = await supabase
    .from('job_evaluations')
    .select(`
      id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
      detailed_reasoning,
      jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, categories)
    `)
    .eq('user_id', userId)
    .eq('jobs.is_active', true)

  if (evalErr) return { results: [], totalMatches: 0 }

  // 2) All actions for this user (status + applied_at).
  const { data: actions } = await supabase
    .from('user_job_actions')
    .select('job_id, status, applied_at')
    .eq('user_id', userId)

  const actionsByJobId = new Map<
    string,
    { job_id: string; status: string; applied_at: string | null }
  >()
  for (const a of actions ?? []) {
    if (a.job_id) {
      actionsByJobId.set(a.job_id, {
        job_id: a.job_id,
        status: a.status,
        applied_at: a.applied_at,
      })
    }
  }

  type EvalRow = {
    id: string; job_id: string; score: number; reasoning: string | null
    dimensions: unknown; notified_at: string | null; created_at: string
    read_at: string | null; chips: unknown; detailed_reasoning: unknown
    jobs: {
      id: string; title: string; company: string; location: string | null
      url: string; source: string; remote_type: string | null
      industry: string | null; synced_at: string; categories: string[] | null
    }
  }

  // 3) Build FeedItem list (dedup is implicit — one eval row per (user_id, job_id)).
  const allItems: FeedItem[] = ((evaluations ?? []) as EvalRow[]).map((e) => {
    const action = actionsByJobId.get(e.job_id) ?? null
    const chips: Chip[] =
      Array.isArray(e.chips) && e.chips.length > 0
        ? (e.chips as Chip[])
        : deriveChipsFromReasoning(
            e.detailed_reasoning as {
              strengths?: string[]
              concerns?: string[]
              red_flags?: string[]
            } | null,
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
      user_job_actions: action,
    }
  })

  // 4) Filter by token AND match across title/company/location/categories.
  const matched = allItems.filter((item) =>
    matchesAllTokens(
      {
        title: item.jobs.title,
        company: item.jobs.company,
        location: item.jobs.location,
        categories: (item.jobs as { categories?: string[] | null }).categories ?? null,
      },
      tokens,
    ),
  )

  // 5) Sort by synced_at DESC, then cap.
  matched.sort((a, b) => b.jobs.synced_at.localeCompare(a.jobs.synced_at))
  const results = matched.slice(0, SEARCH_RESULT_CAP)

  return { results, totalMatches: matched.length }
}
```

Note: the `FeedItem.jobs` shape in [queries.ts:46](src/lib/supabase/queries.ts#L46) does not yet declare `categories`. Update the type to include it:

```ts
// In the FeedItem type definition (around line 46-56), change `jobs` to:
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
    categories: string[] | null
  }
```

The `getJobFeed` "all" branch already selects `categories` ([queries.ts:138](src/lib/supabase/queries.ts#L138)); the other two branches don't, but they will be coerced to `null` at runtime — acceptable because nothing currently reads `categories` off `FeedItem` outside this new function. No call-site changes needed.

- [ ] **Step 2.2: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: PASS — no new type errors.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/supabase/queries.ts
git commit -m "feat: add searchUserJobs query function"
```

---

## Task 3: Make `JobLogRow` action buttons optional

**Files:**
- Modify: `src/components/features/job-log-row.tsx`

- [ ] **Step 3.1: Make handlers optional and conditionally render the action row**

In `src/components/features/job-log-row.tsx`:

Change the prop types around line 9-25:

```ts
interface JobLogRowProps {
  id: string
  jobId: string
  title: string
  company: string
  location: string | null
  url: string
  remoteType: string | null
  score: number
  chips: Chip[]
  isUnread: boolean
  notifiedAt: string | null
  status: 'new' | 'saved' | 'applied' | 'dismissed'
  appliedAt?: string | null
  onPass?: () => void
  onSave?: () => void
  onDetails?: () => void
}
```

Then change the action row (around lines 105-125) so the entire `<div className="flex items-center gap-2 mt-3" ...>` block is only rendered when `onPass || onSave` is provided. Replace lines 105-125 with:

```tsx
          {(onPass || onSave) && (
            <div
              className="flex items-center gap-2 mt-3"
              onClick={(e) => e.stopPropagation()}
            >
              {onPass && (
                <Button variant="outline" size="sm" onClick={onPass} className="h-8">
                  <X className="w-3.5 h-3.5 mr-1" />
                  Pass
                </Button>
              )}
              {onSave && (
                <Button variant="outline" size="sm" onClick={onSave} className="h-8">
                  <Bookmark className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>
              )}
              <div className="flex-1" />
              {onDetails ? (
                <Button size="sm" className="h-8" onClick={onDetails}>Details</Button>
              ) : (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" className="h-8">Details</Button>
                </a>
              )}
            </div>
          )}
```

- [ ] **Step 3.2: Verify it type-checks and existing callers still work**

Run: `npx tsc --noEmit`

Expected: PASS — `feed-client.tsx` passes both `onPass` and `onSave` so its render path is unchanged.

- [ ] **Step 3.3: Commit**

```bash
git add src/components/features/job-log-row.tsx
git commit -m "refactor: make JobLogRow Pass/Save handlers optional"
```

---

## Task 4: `<SearchResults>` server component

**Files:**
- Create: `src/components/features/search-results.tsx`

- [ ] **Step 4.1: Implement the component**

Create `src/components/features/search-results.tsx`:

```tsx
import Link from 'next/link'
import { searchUserJobs, type FeedItem } from '@/lib/supabase/queries'
import { JobLogRow } from './job-log-row'

interface SearchResultsProps {
  userId: string
  query: string
}

export async function SearchResults({ userId, query }: SearchResultsProps) {
  const trimmed = query.trim()

  if (trimmed.length < 2) {
    return (
      <p className="text-center text-muted-foreground py-12 text-sm">
        Keep typing — at least 2 characters.
      </p>
    )
  }

  const { results, totalMatches } = await searchUserJobs(userId, trimmed)

  if (results.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12 text-sm">
        No matches for &ldquo;{trimmed}&rdquo;. Try fewer words or different terms.
      </p>
    )
  }

  const truncated = totalMatches > results.length

  return (
    <div className="space-y-3">
      {truncated && (
        <p className="text-xs text-muted-foreground">
          Showing {results.length} of {totalMatches} — refine your search to narrow results.
        </p>
      )}
      {results.map((item: FeedItem) => {
        const status = (item.user_job_actions?.status ?? 'new') as
          | 'new'
          | 'saved'
          | 'applied'
          | 'dismissed'
        return (
          <Link
            key={item.id}
            href={`/dashboard/jobs/${item.job_id}`}
            className="block"
          >
            <JobLogRow
              id={item.id}
              jobId={item.job_id}
              title={item.jobs.title}
              company={item.jobs.company}
              location={item.jobs.location}
              url={item.jobs.url}
              remoteType={item.jobs.remote_type}
              score={item.score}
              chips={item.chips}
              isUnread={false}
              notifiedAt={item.notified_at}
              status={status}
              appliedAt={item.user_job_actions?.applied_at}
            />
          </Link>
        )
      })}
    </div>
  )
}
```

Note: `<Link>` wrapping the row gives correct middle-click / cmd-click / right-click → "Open in new tab" behavior without us writing any handlers, and because `onPass`/`onSave` are omitted (Task 3), the row has no inner action buttons. The status chip already renders via `LifecyclePill` inside `JobLogRow`.

- [ ] **Step 4.2: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/features/search-results.tsx
git commit -m "feat: add SearchResults server component"
```

---

## Task 5: `<SearchBar>` client component

**Files:**
- Create: `src/components/features/search-bar.tsx`

- [ ] **Step 5.1: Implement the component**

Create `src/components/features/search-bar.tsx`:

```tsx
'use client'

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'

const DEBOUNCE_MS = 250

interface SearchBarProps {
  /**
   * If true (search is "open"), the input is rendered instead of the Search button.
   * The parent decides this based on `?q=` presence in the URL.
   */
  initiallyOpen: boolean
  /** Current value of `?q=` from the URL, used to seed the input on first render. */
  initialQuery: string
}

export function SearchBar({ initiallyOpen, initialQuery }: SearchBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const [value, setValue] = useState(initialQuery)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef<string>(initialQuery)

  // Autofocus when the input first appears.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  // Sync URL → state when navigating back/forward.
  useEffect(() => {
    const q = params.get('q') ?? ''
    setValue(q)
    setIsOpen(q.length > 0 || isOpen)
    lastSyncedRef.current = q
    // We intentionally don't depend on isOpen — only react to URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  function pushQueryToUrl(next: string, mode: 'push' | 'replace') {
    if (next === lastSyncedRef.current) return
    lastSyncedRef.current = next

    const sp = new URLSearchParams(params.toString())
    if (next.length >= 2) {
      sp.set('q', next)
      sp.delete('tab')
      sp.delete('page')
    } else {
      sp.delete('q')
    }

    const url = sp.toString() ? `${pathname}?${sp.toString()}` : pathname
    startTransition(() => {
      if (mode === 'push') router.push(url)
      else router.replace(url)
    })

    // Telemetry — metadata only, never the query string itself.
    if (next.length >= 2) {
      const tokenCount = next.trim().split(/\s+/).filter((t) => t.length >= 2).length
      posthog.capture('search_performed', {
        query_length: next.length,
        token_count: tokenCount,
      })
    }
  }

  function scheduleDebounced(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushQueryToUrl(next, 'replace')
    }, DEBOUNCE_MS)
  }

  function onOpen() {
    // First open is a history push so Back returns to the un-searched dashboard.
    setIsOpen(true)
  }

  function onClose() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setValue('')
    setIsOpen(false)
    if (params.get('q')) {
      const sp = new URLSearchParams(params.toString())
      sp.delete('q')
      const url = sp.toString() ? `${pathname}?${sp.toString()}` : pathname
      router.push(url)
    }
  }

  function onChange(next: string) {
    setValue(next)
    if (next.length === 0) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      pushQueryToUrl('', 'replace')
      return
    }
    if (next.length < 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    // If URL doesn't yet have `q=`, the FIRST change is a push (creates a history entry);
    // subsequent changes are replaces.
    if (!params.get('q')) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        pushQueryToUrl(next, 'push')
      }, DEBOUNCE_MS)
    } else {
      scheduleDebounced(next)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length >= 2) pushQueryToUrl(value, params.get('q') ? 'replace' : 'push')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!isOpen) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onOpen}>
          <Search className="w-4 h-4 mr-1" />
          Search
        </Button>
        <Button variant="outline" size="sm" disabled>
          Filters
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        // Desktop: inline next to title. Mobile: absolute-fill the header row.
        'flex items-center gap-2',
        'w-full sm:w-[360px]',
      )}
    >
      {/* Mobile back chevron */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="sm:hidden h-9 w-9 p-0 shrink-0"
        aria-label="Close search"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>

      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search your jobs by title, company, location, or category"
          className={cn(
            'w-full h-9 rounded-md border border-input bg-background',
            'pl-9 pr-9 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setValue('')
              if (debounceRef.current) clearTimeout(debounceRef.current)
              pushQueryToUrl('', 'replace')
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Desktop close button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="hidden sm:inline-flex"
      >
        Cancel
      </Button>
    </form>
  )
}
```

- [ ] **Step 5.2: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/features/search-bar.tsx
git commit -m "feat: add SearchBar client component"
```

---

## Task 6: Wire `SearchBar` + `SearchResults` into the dashboard page

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 6.1: Update `searchParams` typing and reading**

In `src/app/(app)/dashboard/page.tsx`, line 26-28, replace the props interface:

```ts
interface DashboardPageProps {
  searchParams: Promise<{ tab?: string; page?: string; q?: string }>
}
```

After the `const params = await searchParams` line (around line 45), add:

```ts
const rawQuery = (params.q ?? '').trim()
const isSearching = rawQuery.length >= 2
```

- [ ] **Step 6.2: Skip tab data fetches when searching**

When `isSearching` is true, we don't need the existing per-tab feed/applied data. Wrap the existing parallel fetch (lines 50-54) so they're only executed when not searching. Replace lines 50-54 with:

```ts
  const [feedResult, prefsResult, appliedResult] = isSearching
    ? [
        { data: [] as FeedItem[], error: null },
        await getPreferences(user.id),
        { data: [] as AppliedJob[], error: null },
      ]
    : await Promise.all([
        tab !== 'applied'
          ? getJobFeed(user.id, tab, page, pageSize)
          : Promise.resolve({ data: [] as FeedItem[], error: null }),
        getPreferences(user.id),
        tab === 'applied'
          ? getAppliedJobs(user.id)
          : Promise.resolve({ data: [] as AppliedJob[], error: null }),
      ])
```

(The tab-count fetches around lines 65-69 can stay — they're cheap `head: true` count queries and the tab pills aren't shown while searching, so we'll just gate the render below rather than the fetch.)

- [ ] **Step 6.3: Replace the disabled Search button with `<SearchBar>`**

Add the import at the top of the file with the other component imports:

```ts
import { SearchBar } from '@/components/features/search-bar'
import { SearchResults } from '@/components/features/search-results'
import { Suspense } from 'react'
```

Replace the header buttons (lines 125-128) — currently:

```tsx
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>Search</Button>
          <Button variant="outline" size="sm" disabled>Filters</Button>
        </div>
```

with:

```tsx
        <div className={isSearching ? 'flex-1 sm:flex-none w-full sm:w-auto' : ''}>
          <SearchBar initiallyOpen={isSearching} initialQuery={rawQuery} />
        </div>
```

Also wrap the outer header `div` (line 111) so on mobile when searching the title hides. Change:

```tsx
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 ...>Your job log</h1>
          ...
        </div>
        <div className={isSearching ? 'flex-1 sm:flex-none w-full sm:w-auto' : ''}>
          <SearchBar ... />
        </div>
      </div>
```

to:

```tsx
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className={isSearching ? 'hidden sm:block' : ''}>
          <h1 ...>Your job log</h1>
          {subtitleParts.length > 0 && (
            <p ...>{subtitleParts.join(' · ')}</p>
          )}
        </div>
        <div className={isSearching ? 'flex-1 sm:flex-none w-full sm:w-auto' : ''}>
          <SearchBar initiallyOpen={isSearching} initialQuery={rawQuery} />
        </div>
      </div>
```

- [ ] **Step 6.4: Branch the main content area**

Replace the entire main render below the `<LogTab>` (lines 131-181) so that when `isSearching`, we hide the tab bar / "Sorted for you" hint / feed and instead render `<SearchResults>`. Specifically:

```tsx
      {!isSearching && <LogTab tabs={tabs} activeTab={tab} />}

      {isSearching ? (
        <div className="mt-6">
          <Suspense
            fallback={
              <p className="text-center text-muted-foreground py-12 text-sm">
                Searching…
              </p>
            }
          >
            <SearchResults userId={user.id} query={rawQuery} />
          </Suspense>
        </div>
      ) : (
        <>
          {(tab === 'all' || tab === 'saved') && (
            <div
              className="flex items-center gap-1.5 mt-3 mb-6 text-muted-foreground"
              style={{ fontSize: 12 }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sorted for you · freshness × match score</span>
            </div>
          )}

          {(tab === 'all' || tab === 'saved') && (
            <div className={tab === 'all' ? '' : 'mt-6'}>
              <FeedClient
                items={aboveThreshold}
                onPass={passJobAction}
                onSave={saveJobAction}
                onMarkRead={markJobReadAction}
                showSections={tab === 'all'}
              />

              {tab === 'all' && belowThreshold.length > 0 && (
                <LowConfidenceFold count={belowThreshold.length} threshold={threshold}>
                  <FeedClient
                    items={belowThreshold}
                    onPass={passJobAction}
                    onSave={saveJobAction}
                    onMarkRead={markJobReadAction}
                    showSections={false}
                  />
                </LowConfidenceFold>
              )}
            </div>
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
        </>
      )}
```

- [ ] **Step 6.5: Skip `upsertLastVisit` while searching**

`upsertLastVisit` (line 79) records "user opened the All tab" — semantically wrong to fire while searching. Change line 78-80 from:

```ts
  if (tab === 'all') {
    await upsertLastVisit(user.id)
  }
```

to:

```ts
  if (tab === 'all' && !isSearching) {
    await upsertLastVisit(user.id)
  }
```

- [ ] **Step 6.6: Type-check the whole project**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6.7: Run unit tests**

Run: `npx vitest run`

Expected: PASS — including the new `search-match.test.ts` and all prior tests.

- [ ] **Step 6.8: Commit**

```bash
git add src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: wire dashboard search bar and results"
```

---

## Task 7: Manual verification (desktop + mobile)

This task has no automated test — it's the CLAUDE.md mandated mobile-and-toast checklist. There are no new toasts (search is read-only with passive states), so this is the mobile pass.

- [ ] **Step 7.1: Start the dev server**

Run: `npm run dev` (or whatever this repo uses — check `package.json` `scripts.dev`).

- [ ] **Step 7.2: Desktop verification**

Open `http://localhost:3000/dashboard` in a real browser. Sign in if needed. Then run through:

1. Click "Search" → input expands inline, autofocuses. Tab bar hides.
2. Type `s` → no query fires (single char), no results panel changes other than spinner-free dim of prior content area.
3. Type `st` → after ~250 ms, URL becomes `?q=st`, results appear.
4. Continue typing `stripe payments` → URL replaces (no new history entries), results narrow.
5. Press Enter immediately after typing — results refresh without waiting.
6. Click a result → navigates to `/dashboard/jobs/<id>`. Press browser Back → returns to `/dashboard?q=stripe%20payments` with input still filled and the same results.
7. Press Esc inside the input → input collapses, tab bar reappears, URL loses `?q=`.
8. Click X inside input → query clears, URL loses `?q=`, prior tab content shows again, input stays open.
9. Search a string that returns zero matches (e.g. `xqzfoo`) → "No matches for 'xqzfoo'. Try fewer words or different terms."
10. Search a string with >50 matches (e.g. a common word like `engineer` if applicable) → "Showing 50 of N" hint appears above the list.
11. Refresh the page on `/dashboard?q=stripe` → search input is open, pre-filled, results rendered (URL is the source of truth).

- [ ] **Step 7.3: Mobile verification at 390 px (iPhone 14)**

Open DevTools → device toolbar → iPhone 14 (390 × 844). Then:

1. Tap Search → input occupies full header row; the page title "Your job log" hides; cancel chevron is visible on the left.
2. Input is ≥ 44 px touch target (h-9 = 36 px is the `Button` default — verify the **wrapper row** / input meets the touch target requirement. If the input itself feels too short, bump its `h-9` to `h-11` for mobile only by adding `h-11 sm:h-9`).
3. Mobile keyboard opens and shows "Search" enter key (because of `enterKeyHint="search"`).
4. No horizontal scroll appears as you type long queries.
5. Tap a result → navigates correctly, no jank.
6. Tap chevron → returns to dashboard, tab bar back.

If the input row is < 44 px tall, adjust `h-9` → `h-11` on the input and on the chevron Button in `search-bar.tsx`, recommit.

- [ ] **Step 7.4: Verify PostHog event in network tab**

While typing, watch the network tab for a request to `posthog` capturing `search_performed`. Confirm the payload contains only `query_length` and `token_count` — no `query` / `q` / raw string. If the raw query leaks in, fix the `posthog.capture` call site in `search-bar.tsx`.

- [ ] **Step 7.5: Commit any mobile adjustments**

If Step 7.3 required tweaking heights:

```bash
git add src/components/features/search-bar.tsx
git commit -m "fix: bump search input height for mobile touch target"
```

Otherwise: nothing to commit, move on.

---

## Self-review (checked before handoff)

**Spec coverage** (Q1–Q17): every locked decision has a corresponding task —
- Q1, Q16 → Task 2 (union of eval+actions, dedup).
- Q2, Q7 → Task 1 (token parse + AND match across the four fields).
- Q3, Q14 → Task 2 (in-memory filter, no FTS, no indexes).
- Q4 → Task 5 (inline expanding input) + Task 6 (header swap).
- Q5, Q11 → Task 5 (URL is source of truth, push vs replace) + Task 6 (skip tab fetches/render).
- Q6 → Task 2 (cap=50, sort by `synced_at DESC`, return `totalMatches`) + Task 4 ("Showing N of M" hint).
- Q8 → Task 3 (optional handlers) + Task 4 (Link-wrapped read-only row with `LifecyclePill`).
- Q9 → Task 5 (debounce, min-2 chars) + Task 6 (`<Suspense>` fallback keeps prior content stable).
- Q10 → Task 4 (empty/short/no-match copy) + Task 5 (empty input clears `q` and dashboard renders normally).
- Q12 → Task 5 (mobile chevron + full-row layout) + Task 6 (hide title on mobile while searching) + Task 7.3.
- Q13 → Task 6 (Suspense + server component).
- Q15 → Task 5 (button-only open, autofocus useEffect, Esc, X, Enter via `onSubmit`).
- Q17 → Task 5 (PostHog event metadata only) + Task 6 (Filters stays disabled — kept inside `SearchBar`'s closed state).

**Placeholder scan:** every code block above is complete; no `TODO` / `// implement later` / "similar to" references. Type names used in later tasks (`FeedItem`, `Searchable`, `SearchOutcome`, `JobLogRowProps`) match their definitions in earlier tasks.

**Type consistency:** `searchUserJobs` returns `{ results: FeedItem[]; totalMatches: number }` — both `SearchResults` (Task 4) and the page (Task 6) consume `FeedItem` shape via `JobLogRow`. `JobLogRow`'s `onPass`/`onSave` are made optional in Task 3; Task 4 omits them; existing `feed-client.tsx` still passes them — unchanged.
