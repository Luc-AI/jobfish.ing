# Onboarding v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the onboarding wizard from 3 to 4 steps (adding a name step), replace the free-text location input with a Geoapify-powered multi-select picker, add a remote preference toggle, and trigger a one-time 7-day job scrape with a loading screen after onboarding completes.

**Architecture:** All work lands on a `feature/onboarding-v2` branch off `develop`. DB changes are SQL migrations + manual type updates. The Geoapify API is called server-side via a Next.js route handler (key never exposed to browser). The initial scrape uses a new Trigger.dev task triggered from a second route handler that the wizard awaits before redirecting.

**Tech Stack:** Next.js 16 App Router, Supabase, Trigger.dev v4 SDK, Geoapify Geocoding API, shadcn/ui, Vitest + React Testing Library

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0003_onboarding_v2.sql` | Create | Add `first_name`, `last_name` to profiles; `remote_preference` to preferences |
| `src/lib/supabase/types.ts` | Modify | Add new columns to DB type definitions |
| `src/trigger/lib/apify.ts` | Modify | Add optional `timeRange` param to `buildApifyInput` and `scrapeAll` |
| `src/app/api/geoapify/autocomplete/route.ts` | Create | Server-side Geoapify city autocomplete, returns `{ suggestions: string[] }` |
| `src/components/features/location-picker.tsx` | Create | Debounced city autocomplete input with chip tags |
| `src/trigger/scrape-jobs-initial.ts` | Create | One-time Trigger.dev task: scrapes 7d of jobs for a single user |
| `src/app/api/onboarding/complete/route.ts` | Create | POST handler: triggers `scrape-jobs-initial` and awaits completion |
| `src/components/features/onboarding-wizard.tsx` | Modify | Refactor to 4 steps + loading state; add name, LocationPicker, remote toggle |
| `src/test/apify.test.ts` | Create | Unit tests for `buildApifyInput` timeRange param |
| `src/test/geoapify-route.test.ts` | Create | Unit tests for autocomplete route handler |
| `src/test/location-picker.test.tsx` | Create | Component tests for LocationPicker |
| `src/test/onboarding-wizard.test.tsx` | Modify | Update for 4-step flow, name step, loading state |

---

## Task 1: Create feature branch + DB migration

**Files:**
- Create: `supabase/migrations/0003_onboarding_v2.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Create feature branch**

```bash
git checkout develop
git pull
git checkout -b feature/onboarding-v2
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0003_onboarding_v2.sql`:

```sql
-- Add name fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

-- Add remote preference to preferences
ALTER TABLE public.preferences
  ADD COLUMN IF NOT EXISTS remote_preference text DEFAULT 'hybrid'
    CHECK (remote_preference IN ('on-site', 'hybrid', 'remote-ok', 'remote-solely'));
```

- [ ] **Step 3: Update Supabase types**

In `src/lib/supabase/types.ts`, add the new columns to the `profiles` and `preferences` table types.

Find the `profiles` `Row`, `Insert`, and `Update` blocks and add:
```ts
// In Row:
first_name: string | null
last_name: string | null

// In Insert:
first_name?: string | null
last_name?: string | null

// In Update:
first_name?: string | null
last_name?: string | null
```

Find the `preferences` `Row`, `Insert`, and `Update` blocks and add:
```ts
// In Row:
remote_preference: string

// In Insert:
remote_preference?: string

// In Update:
remote_preference?: string
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_onboarding_v2.sql src/lib/supabase/types.ts
git commit -m "feat: add first_name, last_name, remote_preference columns"
```

---

## Task 2: Add `timeRange` param to `buildApifyInput` and `scrapeAll` (TDD)

**Files:**
- Create: `src/test/apify.test.ts`
- Modify: `src/trigger/lib/apify.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/apify.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildApifyInput } from '@/trigger/lib/apify'

const prefs = [{ target_roles: ['PM'], locations: ['Zurich, Switzerland'], excluded_companies: [] }]

describe('buildApifyInput', () => {
  it('defaults timeRange to 1h', () => {
    const input = buildApifyInput(prefs)
    expect(input.timeRange).toBe('1h')
  })

  it('accepts a custom timeRange', () => {
    const input = buildApifyInput(prefs, '7d')
    expect(input.timeRange).toBe('7d')
  })

  it('passes timeRange through unchanged', () => {
    const input = buildApifyInput(prefs, '24h')
    expect(input.timeRange).toBe('24h')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/test/apify.test.ts
```

Expected: FAIL — "accepts a custom timeRange" and "passes timeRange through unchanged" fail because `buildApifyInput` hardcodes `timeRange: '1h'`.

- [ ] **Step 3: Update `buildApifyInput` and `scrapeAll`**

In `src/trigger/lib/apify.ts`, change the `buildApifyInput` signature:

```ts
export function buildApifyInput(preferences: UserPreference[], timeRange = '1h'): ApifyInput {
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
    timeRange,
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
```

Also update `scrapeAll` to accept and forward `timeRange`:

```ts
export async function scrapeAll(preferences: UserPreference[], timeRange = '1h'): Promise<NormalizedJob[]> {
  if (!process.env.APIFY_API_TOKEN) throw new Error('APIFY_API_TOKEN is not set')

  const baseInput = buildApifyInput(preferences, timeRange)

  if (baseInput.titleSearch.length === 0) {
    console.log('No job titles in preferences, skipping Apify scrape.')
    return []
  }

  const [careerSiteResult, linkedInResult] = await Promise.allSettled([
    callApifyActor(CAREER_SITE_ENDPOINT, baseInput),
    callApifyActor(LINKEDIN_ENDPOINT, { ...baseInput, excludeATSDuplicate: true }),
  ])

  const jobs: NormalizedJob[] = []

  if (careerSiteResult.status === 'fulfilled') {
    jobs.push(...careerSiteResult.value)
  } else {
    console.error('Career site actor failed:', careerSiteResult.reason)
    Sentry.captureException(careerSiteResult.reason)
  }

  if (linkedInResult.status === 'fulfilled') {
    jobs.push(...linkedInResult.value)
  } else {
    console.error('LinkedIn actor failed:', linkedInResult.reason)
    Sentry.captureException(linkedInResult.reason)
  }

  return jobs
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/apify.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test/apify.test.ts src/trigger/lib/apify.ts
git commit -m "feat: add timeRange param to buildApifyInput and scrapeAll"
```

---

## Task 3: Geoapify autocomplete route handler (TDD)

**Files:**
- Create: `src/test/geoapify-route.test.ts`
- Create: `src/app/api/geoapify/autocomplete/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/geoapify-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after stubbing globals
const { GET } = await import('@/app/api/geoapify/autocomplete/route')

describe('GET /api/geoapify/autocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GEOAPIFY_API_KEY = 'test-key'
  })

  it('returns empty suggestions when text param is missing', async () => {
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns empty suggestions when text is shorter than 2 chars', async () => {
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Z')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns city suggestions formatted as "City, Country"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          { properties: { city: 'Zurich', country: 'Switzerland' } },
          { properties: { city: 'Zug', country: 'Switzerland' } },
        ],
      }),
    })
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual(['Zurich, Switzerland', 'Zug, Switzerland'])
  })

  it('deduplicates identical suggestions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          { properties: { city: 'Zurich', country: 'Switzerland' } },
          { properties: { city: 'Zurich', country: 'Switzerland' } },
        ],
      }),
    })
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual(['Zurich, Switzerland'])
  })

  it('filters out features missing city or country', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          { properties: { city: 'Zurich', country: 'Switzerland' } },
          { properties: { country: 'Germany' } },
          { properties: {} },
        ],
      }),
    })
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual(['Zurich, Switzerland'])
  })

  it('returns empty suggestions when Geoapify returns non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual([])
  })

  it('returns empty suggestions when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/test/geoapify-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route handler**

Create `src/app/api/geoapify/autocomplete/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text')

  if (!text || text.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const key = process.env.GEOAPIFY_API_KEY
  if (!key) return NextResponse.json({ suggestions: [] })

  try {
    const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete')
    url.searchParams.set('text', text)
    url.searchParams.set('type', 'city')
    url.searchParams.set('limit', '5')
    url.searchParams.set('apiKey', key)

    const res = await fetch(url.toString())
    if (!res.ok) return NextResponse.json({ suggestions: [] })

    const data = await res.json()
    const suggestions: string[] = (data.features ?? [])
      .filter(
        (f: { properties?: { city?: string; country?: string } }) =>
          f.properties?.city && f.properties?.country
      )
      .map(
        (f: { properties: { city: string; country: string } }) =>
          `${f.properties.city}, ${f.properties.country}`
      )
      .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/geoapify-route.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test/geoapify-route.test.ts src/app/api/geoapify/autocomplete/route.ts
git commit -m "feat: add Geoapify city autocomplete route handler"
```

---

## Task 4: LocationPicker component (TDD)

**Files:**
- Create: `src/test/location-picker.test.tsx`
- Create: `src/components/features/location-picker.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/location-picker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocationPicker } from '@/components/features/location-picker'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('LocationPicker', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a text input', () => {
    render(<LocationPicker value={[]} onChange={onChange} />)
    expect(screen.getByPlaceholderText(/type a city/i)).toBeInTheDocument()
  })

  it('renders chips for pre-selected locations', () => {
    render(<LocationPicker value={['Zurich, Switzerland', 'Berlin, Germany']} onChange={onChange} />)
    expect(screen.getByText('Zurich, Switzerland')).toBeInTheDocument()
    expect(screen.getByText('Berlin, Germany')).toBeInTheDocument()
  })

  it('calls onChange without the location when X is clicked', async () => {
    const user = userEvent.setup()
    render(<LocationPicker value={['Zurich, Switzerland', 'Berlin, Germany']} onChange={onChange} />)
    await user.click(screen.getByLabelText('Remove Zurich, Switzerland'))
    expect(onChange).toHaveBeenCalledWith(['Berlin, Germany'])
  })

  it('does not fetch when fewer than 2 chars are typed', async () => {
    const user = userEvent.setup()
    render(<LocationPicker value={[]} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText(/type a city/i), 'Z')
    // wait to ensure no fetch triggered
    await new Promise(r => setTimeout(r, 400))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches suggestions after 300ms debounce with 2+ chars', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: ['Zurich, Switzerland'] }),
    })
    const user = userEvent.setup()
    render(<LocationPicker value={[]} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText(/type a city/i), 'Zu')
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/geoapify/autocomplete?text=Zu')
    ), { timeout: 600 })
    expect(await screen.findByText('Zurich, Switzerland')).toBeInTheDocument()
  })

  it('calls onChange with the new location when a suggestion is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: ['Zurich, Switzerland'] }),
    })
    const user = userEvent.setup()
    render(<LocationPicker value={[]} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText(/type a city/i), 'Zu')
    const suggestion = await screen.findByText('Zurich, Switzerland', {}, { timeout: 600 })
    await user.click(suggestion)
    expect(onChange).toHaveBeenCalledWith(['Zurich, Switzerland'])
  })

  it('does not add a duplicate location', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: ['Zurich, Switzerland'] }),
    })
    const user = userEvent.setup()
    render(<LocationPicker value={['Zurich, Switzerland']} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText(/type a city/i), 'Zu')
    const suggestion = await screen.findByText('Zurich, Switzerland', {}, { timeout: 600 })
    await user.click(suggestion)
    // onChange not called because it's already in the list
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/test/location-picker.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the LocationPicker component**

Create `src/components/features/location-picker.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface LocationPickerProps {
  value: string[]
  onChange: (locations: string[]) => void
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geoapify/autocomplete?text=${encodeURIComponent(query)}`)
        const data = await res.json()
        setSuggestions(data.suggestions ?? [])
        setOpen((data.suggestions ?? []).length > 0)
      } catch {
        setSuggestions([])
        setOpen(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  function addLocation(loc: string) {
    if (value.includes(loc)) return
    onChange([...value, loc])
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  function removeLocation(loc: string) {
    onChange(value.filter(l => l !== loc))
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a city..."
        />
        {open && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
            {suggestions.map(s => (
              <li
                key={s}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={() => addLocation(s)}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(loc => (
            <Badge key={loc} variant="secondary" className="gap-1">
              {loc}
              <button
                type="button"
                onClick={() => removeLocation(loc)}
                aria-label={`Remove ${loc}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/location-picker.test.tsx
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test/location-picker.test.tsx src/components/features/location-picker.tsx
git commit -m "feat: add LocationPicker component with Geoapify autocomplete"
```

---

## Task 5: `scrape-jobs-initial` Trigger.dev task

**Files:**
- Create: `src/trigger/scrape-jobs-initial.ts`

No unit tests for the task itself (it requires a real Trigger.dev runtime). The task is covered by integration.

- [ ] **Step 1: Create the task**

Create `src/trigger/scrape-jobs-initial.ts`:

```ts
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { scrapeAll } from './lib/apify'
import { evaluateJobsTask } from './evaluate-jobs'

export const scrapeJobsInitialTask = task({
  id: 'scrape-jobs-initial',
  retry: { maxAttempts: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async ({ userId }: { userId: string }) => {
    const supabase = createServiceClient()

    const { data: prefs, error } = await supabase
      .from('preferences')
      .select('target_roles, locations, excluded_companies')
      .eq('user_id', userId)
      .single()

    if (error || !prefs) {
      throw new Error(`Failed to fetch preferences for user ${userId}: ${error?.message}`)
    }

    const preferences = [
      {
        target_roles: prefs.target_roles ?? [],
        locations: prefs.locations ?? [],
        excluded_companies: prefs.excluded_companies ?? [],
      },
    ]

    const jobs = await scrapeAll(preferences, '7d')
    console.log(`Initial scrape: ${jobs.length} jobs for user ${userId}`)

    if (jobs.length === 0) return { newJobIds: [] }

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
    if (newJobIds.length === 0) return { newJobIds: [] }

    const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
    if (!result.ok) {
      Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
    }

    return { newJobIds }
  },
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/trigger/scrape-jobs-initial.ts
git commit -m "feat: add scrape-jobs-initial trigger task (7d window)"
```

---

## Task 6: `/api/onboarding/complete` route handler (TDD)

**Files:**
- Create: `src/test/onboarding-complete-route.test.ts`
- Create: `src/app/api/onboarding/complete/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/onboarding-complete-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase server client
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// Mock Trigger.dev tasks
const mockTriggerAndWait = vi.fn()
vi.mock('@trigger.dev/sdk', () => ({
  tasks: {
    triggerAndWait: mockTriggerAndWait,
  },
}))

const { POST } = await import('@/app/api/onboarding/complete/route')

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 200 when scrape task succeeds', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTriggerAndWait.mockResolvedValueOnce({ ok: true })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockTriggerAndWait).toHaveBeenCalledWith(
      'scrape-jobs-initial',
      { userId: 'user-123' }
    )
  })

  it('returns 500 when scrape task result is not ok', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTriggerAndWait.mockResolvedValueOnce({ ok: false, error: 'task failed' })
    const res = await POST()
    expect(res.status).toBe(500)
  })

  it('returns 500 when triggerAndWait throws', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTriggerAndWait.mockRejectedValueOnce(new Error('network error'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/test/onboarding-complete-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route handler**

Create `src/app/api/onboarding/complete/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk'

// Allow up to 5 minutes for the initial scrape to complete
export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await tasks.triggerAndWait(
      'scrape-jobs-initial',
      { userId: user.id }
    )

    if (!result.ok) {
      return NextResponse.json({ error: 'Scrape failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Scrape failed' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/onboarding-complete-route.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test/onboarding-complete-route.test.ts src/app/api/onboarding/complete/route.ts
git commit -m "feat: add /api/onboarding/complete route handler"
```

---

## Task 7: Refactor onboarding wizard — name step + step renumbering (TDD)

**Files:**
- Modify: `src/test/onboarding-wizard.test.tsx`
- Modify: `src/components/features/onboarding-wizard.tsx`

This task only adds step 1 (name) and renumbers CV to step 2, Preferences to step 3, Notifications to step 4. LocationPicker and remote toggle are added in Task 8.

- [ ] **Step 1: Update the existing tests**

Replace the entire contents of `src/test/onboarding-wizard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'

const mockUpsert = vi.fn().mockResolvedValue({ error: null })
const mockUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: mockUpsert,
      update: mockUpdate,
    })),
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

// Silence fetch in these tests (LocationPicker and complete route not under test here)
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) }))

describe('OnboardingWizard', () => {
  beforeEach(() => vi.clearAllMocks())

  const defaultProps = { userId: 'test-user-id' }

  it('renders step 1 (name) by default', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText(/let's get started/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
  })

  it('shows step counter as "1 of 4"', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
  })

  it('Next button is disabled when name fields are empty', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('Next button is enabled when both name fields are filled', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace')
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('advances to step 2 (CV) after completing step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace')
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText(/your cv/i)).toBeInTheDocument()
    expect(screen.getByText('2 of 4')).toBeInTheDocument()
  })

  it('can go back from step 2 to step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
  })

  it('renders step 3 (preferences) with "3 of 4"', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={3} />)
    expect(screen.getByText(/preferences/i)).toBeInTheDocument()
    expect(screen.getByText('3 of 4')).toBeInTheDocument()
  })

  it('renders step 4 (notifications) with "4 of 4"', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={4} />)
    expect(screen.getByText(/notifications/i)).toBeInTheDocument()
    expect(screen.getByText('4 of 4')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run src/test/onboarding-wizard.test.tsx
```

Expected: Multiple failures — wizard still shows "1 of 3", no name step, etc.

- [ ] **Step 3: Rewrite the wizard for 4 steps**

Replace the full contents of `src/components/features/onboarding-wizard.tsx`:

```tsx
'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { posthog } from '@/lib/posthog'
import { LocationPicker } from '@/components/features/location-picker'

type WizardStep = 1 | 2 | 3 | 4 | 'loading'
type RemotePreference = 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'

const REMOTE_OPTIONS: { value: RemotePreference; label: string }[] = [
  { value: 'on-site', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote-ok', label: 'Remote OK' },
  { value: 'remote-solely', label: 'Remote Solely' },
]

interface OnboardingWizardProps {
  userId: string
  initialStep?: 1 | 2 | 3 | 4
}

export function OnboardingWizard({ userId, initialStep = 1 }: OnboardingWizardProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [step, setStep] = useState<WizardStep>(initialStep)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Step 1: Name
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Step 2: CV
  const [cvText, setCvText] = useState('')

  // Step 3: Preferences
  const [targetRoles, setTargetRoles] = useState('')
  const [industries, setIndustries] = useState('')
  const [locations, setLocations] = useState<string[]>([])
  const [excludedCompanies, setExcludedCompanies] = useState('')
  const [remotePreference, setRemotePreference] = useState<RemotePreference>('hybrid')

  // Step 4: Notifications
  const [threshold, setThreshold] = useState(7.0)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  function parseCommaSeparated(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean)
  }

  async function saveStep1() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, first_name: firstName, last_name: lastName }, { onConflict: 'id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setStep(2)
  }

  async function saveStep2() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, cv_text: cvText }, { onConflict: 'id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setStep(3)
  }

  async function saveStep3() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('preferences')
      .upsert({
        user_id: userId,
        target_roles: parseCommaSeparated(targetRoles),
        industries: parseCommaSeparated(industries),
        locations,
        excluded_companies: parseCommaSeparated(excludedCompanies),
        remote_preference: remotePreference,
      }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setStep(4)
  }

  async function saveStep4() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        threshold,
        notifications_enabled: notificationsEnabled,
        onboarding_completed: true,
      })
      .eq('id', userId)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    posthog.capture('onboarding_completed', { user_id: userId })
    setStep('loading')
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' })
    } catch {
      // silent fallback — jobs will appear on next hourly cron
    }
    router.push('/dashboard')
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg space-y-4 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Finding your first matches…</h1>
          <p className="text-sm text-muted-foreground">
            We're scanning the last 7 days of job postings. This takes about a minute.
          </p>
        </div>
      </div>
    )
  }

  const stepNumber = step as 1 | 2 | 3 | 4

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{stepNumber} of 4</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {step === 1 && 'Let\'s get started'}
            {step === 2 && 'Your CV'}
            {step === 3 && 'Preferences'}
            {step === 4 && 'Notifications'}
          </h1>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              What should we call you?
            </p>
            <div className="space-y-1">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                placeholder="Ada"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                placeholder="Lovelace"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
              />
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-end">
              <Button
                onClick={saveStep1}
                disabled={saving || !firstName.trim() || !lastName.trim()}
              >
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Paste your resume text below. The AI uses this to evaluate how well jobs match your background.
            </p>
            <Textarea
              placeholder="Paste your resume text here..."
              value={cvText}
              onChange={e => setCvText(e.target.value)}
              rows={12}
              className="resize-none font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{cvText.length} characters</p>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <Button onClick={saveStep2} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Enter comma-separated values. The AI uses these to evaluate job fit.
            </p>
            <div className="space-y-1">
              <Label>Target roles</Label>
              <Input
                placeholder="Head of Product, VP Biz Dev, PM"
                value={targetRoles}
                onChange={e => setTargetRoles(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Industries</Label>
              <Input
                placeholder="Fintech, SaaS, VC, Deep Tech"
                value={industries}
                onChange={e => setIndustries(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Locations</Label>
              <LocationPicker value={locations} onChange={setLocations} />
            </div>
            <div className="space-y-2">
              <Label>Work arrangement</Label>
              <div className="flex flex-wrap gap-2">
                {REMOTE_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={remotePreference === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRemotePreference(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Excluded companies</Label>
              <Input
                placeholder="BigCorp, SlowBank"
                value={excludedCompanies}
                onChange={e => setExcludedCompanies(e.target.value)}
              />
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>Back</Button>
              <Button onClick={saveStep3} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm">
              You'll only be notified when jobs score at or above your threshold.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Score threshold</Label>
                <span className="text-2xl font-bold">{threshold.toFixed(1)}</span>
              </div>
              <Slider
                min={0}
                max={10}
                step={0.5}
                value={[threshold]}
                onValueChange={([v]) => setThreshold(v)}
              />
              <p className="text-xs text-muted-foreground">
                Only notify me when a job scores {threshold.toFixed(1)} or higher.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Email notifications</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Receive job alerts by email</p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
              />
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)} disabled={saving}>Back</Button>
              <Button onClick={saveStep4} disabled={saving}>
                {saving ? 'Setting up…' : 'Start fishing'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/onboarding-wizard.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/test/onboarding-wizard.test.tsx src/components/features/onboarding-wizard.tsx
git commit -m "feat: refactor onboarding wizard to 4 steps with name, location picker, remote preference, and loading screen"
```

---

## Task 8: Apply DB migration to local Supabase + verify TypeScript

**Files:**
- `supabase/migrations/0003_onboarding_v2.sql` (already written in Task 1)

- [ ] **Step 1: Apply migration locally**

```bash
npx supabase db push
```

Expected: Migration applied successfully.

If you don't have a local Supabase instance running, skip this step and apply via the Supabase dashboard SQL editor by pasting the contents of `supabase/migrations/0003_onboarding_v2.sql`.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run full test suite one final time**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 4: Commit + open PR to develop**

```bash
git commit --allow-empty -m "chore: final typecheck pass before PR"
```

Then open a PR:
```bash
gh pr create \
  --base develop \
  --title "feat: onboarding v2 — name step, location picker, remote preference, initial scrape" \
  --body "$(cat <<'EOF'
## Summary
- Adds step 1 (first name + last name) to onboarding wizard; wizard is now 4 steps
- Replaces free-text location input with Geoapify-powered multi-select chip picker (server-side API key)
- Adds work arrangement toggle: On-site / Hybrid / Remote OK / Remote Solely (saved to DB, Apify wiring deferred)
- After completing onboarding, shows a loading screen while a one-time 7-day job scrape runs, then redirects to dashboard

## Test plan
- [ ] Run `npx vitest run` — all tests pass
- [ ] Run through the full onboarding wizard manually in dev
- [ ] Verify Geoapify suggestions appear when typing a city
- [ ] Verify locations are saved as `["City, Country"]` in Supabase
- [ ] Verify loading screen appears after step 4 and redirects to dashboard
- [ ] Verify `scrape-jobs-initial` task appears in Trigger.dev dashboard after onboarding

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Open Items (not in scope)

- **Remote preference → Apify**: `buildApifyInput` and `scrapeAll` now accept `timeRange` but remote preference is not yet wired into Apify's `aiWorkArrangementFilter`. Tracked separately.
- **`LOCATION_MAP` removal**: Safe to delete after existing users re-save preferences or a normalisation migration runs.
