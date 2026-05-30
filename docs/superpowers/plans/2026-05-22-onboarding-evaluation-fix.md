# Onboarding Evaluation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the onboarding → empty dashboard bug by replacing the invalid `tasks.triggerAndWait` call (throws outside task context) with a two-phase `tasks.trigger` + `runs.poll` pattern that evaluates 24h jobs synchronously and 2–7d jobs in the background.

**Architecture:** Three files change. `evaluate-jobs.ts` gains `since`/`until`/`phase` payload fields so callers can scope the date window and tag runs for Sentry. The route replaces a single blocking `triggerAndWait` with two `tasks.trigger` calls — phase 1 is awaited via `runs.poll`, phase 2 fires-and-forgets (unless phase 1 found nothing, in which case phase 2 is also awaited). The route test is fully rewritten because the mocked API surface changes completely.

**Tech Stack:** Next.js App Router API route, `@trigger.dev/sdk` (`tasks.trigger`, `runs.poll`), Supabase service client, `@sentry/node`, Vitest.

---

## File Map

| File | Change |
|------|--------|
| `src/test/evaluate-jobs.test.ts` | Update mock infrastructure; add `since`/`until`/`phase` tests |
| `src/trigger/evaluate-jobs.ts` | Add payload fields, update jobs query, add Sentry phase context |
| `src/test/onboarding-complete-route.test.ts` | Full rewrite — new API surface (`tasks.trigger` + `runs.poll`) |
| `src/app/api/onboarding/complete/route.ts` | Full rewrite — two-phase trigger+poll |

---

## Task 1: Extend `evaluate-jobs` task — payload, query, Sentry

**Files:**
- Modify: `src/test/evaluate-jobs.test.ts`
- Modify: `src/trigger/evaluate-jobs.ts`

### Step 1.1 — Update mock infrastructure in `evaluate-jobs.test.ts`

The existing `setupMocks` returns a jobs chain that resolves directly from `.gte()`. After the
change the query may chain `.gte().lt()`, so the chainable object needs every method to return
itself. Also add `captureMessage` to the Sentry mock (needed for the phase-2 summary test).

Replace the entire file with:

```ts
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
  captureMessage: vi.fn(),
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

// Returns a Supabase-style chainable query stub where every filter method
// returns the chain itself, and awaiting it resolves `result`.
function makeChainable(result: { data: any[]; error: null | { message: string } }) {
  const chain: Record<string, any> = {}
  chain.in  = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.lt  = vi.fn(() => chain)
  chain.then = (
    resolve: (v: typeof result) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject)
  return chain
}

let jobsChain: ReturnType<typeof makeChainable>

function setupMocks({
  jobs = [{ id: 'job-1', title: 'Head of Product', company: 'Acme', location: 'Zurich', description: 'Strong operator.', industry: 'IT & Software' }],
  prefs = { user_id: 'user-1', target_roles: [{ role: 'Head of Product' }], target_industries: ['SaaS'], locations: ['Zurich'], excluded_companies: [] as string[], excluded_industries: [] as string[] },
} = {}) {
  jobsChain = makeChainable({ data: jobs, error: null })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'jobs') {
      return { select: () => ({ eq: () => jobsChain }) }
    }
    if (table === 'profiles') {
      const profileResult = { data: [{ id: 'user-1', cv_text: 'PM background', years_experience: 0 }] }
      const chain = makeChainable(profileResult)
      return { select: () => ({ eq: () => chain }) }
    }
    if (table === 'preferences') {
      return { select: () => ({ in: async () => ({ data: [prefs] }) }) }
    }
    if (table === 'job_evaluations') {
      return {
        insert: async () => ({ data: { id: 'eval-1' }, error: null }),
        upsert: async () => ({ data: { id: 'eval-1' }, error: null }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('evaluateJobsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    mockBuildEvaluationPrompt.mockReturnValue('prompt')
    mockCallOpenRouter.mockResolvedValue('raw')
    mockParseEvaluationResponse.mockReturnValue(mockEvalResult)
    setupMocks()
  })

  it('evaluates a matching job and returns count', async () => {
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toMatchObject({ evaluatedCount: 1 })
  })

  it('skips evaluation when job is pre-filtered out by company exclusion', async () => {
    setupMocks({ prefs: { user_id: 'user-1', target_roles: [{ role: 'Head of Product' }], target_industries: [], locations: [], excluded_companies: ['Acme'], excluded_industries: [] } })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toMatchObject({ evaluatedCount: 0 })
    expect(mockCallOpenRouter).not.toHaveBeenCalled()
  })

  it('skips evaluation when job title does not match target roles', async () => {
    setupMocks({
      jobs: [{ id: 'job-1', title: 'Data Engineer', company: 'Acme', location: 'Zurich', description: 'Data stuff.', industry: 'IT & Software' }],
      prefs: { user_id: 'user-1', target_roles: [{ role: 'Head of Product' }], target_industries: [], locations: [], excluded_companies: [], excluded_industries: [] },
    })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toMatchObject({ evaluatedCount: 0 })
    expect(mockCallOpenRouter).not.toHaveBeenCalled()
  })

  it('returns 0 when no jobs exist', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        const empty = makeChainable({ data: [], error: null })
        return { select: () => ({ eq: () => empty }) }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toMatchObject({ evaluatedCount: 0 })
  })

  it('fetches 100 most recent jobs when no jobIds provided (new user backfill)', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'] })
    expect(mockBuildEvaluationPrompt).toHaveBeenCalled()
  })

  // ── New tests for since / until / phase ──────────────────────────────────

  it('uses since as the date_posted lower bound when provided', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'], since: '2026-05-21' })
    expect(jobsChain.gte).toHaveBeenCalledWith('date_posted', '2026-05-21')
  })

  it('adds lt filter for until when provided', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'], since: '2026-05-15', until: '2026-05-21' })
    expect(jobsChain.gte).toHaveBeenCalledWith('date_posted', '2026-05-15')
    expect(jobsChain.lt).toHaveBeenCalledWith('date_posted', '2026-05-21')
  })

  it('does not call lt when until is not provided', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'], since: '2026-05-21' })
    expect(jobsChain.lt).not.toHaveBeenCalled()
  })

  it('captures a Sentry warning when phase is onboarding-2 and errors occurred', async () => {
    const sentry = await import('@sentry/node')
    mockCallOpenRouter.mockRejectedValue(new Error('rate limit'))
    await (evaluateJobsTask as any).run({
      userIds: ['user-1'],
      since: '2026-05-15',
      until: '2026-05-21',
      phase: 'onboarding-2',
    })
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'onboarding phase-2: evaluation errors',
      expect.objectContaining({ level: 'warning' }),
    )
  })

  it('does not capture Sentry warning for cron phase even with errors', async () => {
    const sentry = await import('@sentry/node')
    mockCallOpenRouter.mockRejectedValue(new Error('rate limit'))
    await (evaluateJobsTask as any).run({
      userIds: ['user-1'],
      since: '2026-05-15',
      phase: 'cron',
    })
    expect(sentry.captureMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 1.2 — Run the new tests to see which ones fail**

```bash
npx vitest run src/test/evaluate-jobs.test.ts
```

Expected: the five new tests at the bottom fail (`since`/`until`/`phase` not yet on the payload). The existing five tests should still pass because the mock infrastructure is backward-compatible.

- [ ] **Step 1.3 — Implement `since`, `until`, `phase` in `evaluate-jobs.ts`**

Replace `src/trigger/evaluate-jobs.ts` with:

```ts
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
  since?: string  // YYYY-MM-DD; defaults to 7 days ago
  until?: string  // YYYY-MM-DD; exclusive upper bound for date_posted
  phase?: 'onboarding-1' | 'onboarding-2' | 'cron'
}

export const evaluateJobsTask = task({
  id: 'evaluate-jobs',
  retry: { maxAttempts: 2 },
  run: async ({ jobIds, userIds, since, until, phase }: EvaluateJobsPayload) => {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

    const supabase = createServiceClient()

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    let jobsQuery = supabase
      .from('jobs')
      .select('id, title, company, location, description, industry')
      .eq('is_active', true)

    if (jobIds && jobIds.length > 0) {
      jobsQuery = jobsQuery.in('id', jobIds)
    } else {
      jobsQuery = jobsQuery.gte('date_posted', since ?? sevenDaysAgo)
      if (until) jobsQuery = jobsQuery.lt('date_posted', until)
    }

    const { data: jobs, error: jobsError } = await jobsQuery

    if (jobsError || !jobs?.length) {
      console.log('No jobs to evaluate')
      return { evaluatedCount: 0 }
    }

    let profilesQuery = supabase
      .from('profiles')
      .select('id, cv_text, years_experience')
      .eq('onboarding_completed', true)

    if (userIds && userIds.length > 0) {
      profilesQuery = profilesQuery.in('id', userIds)
    }

    const { data: profiles, error: profilesError } = await profilesQuery

    if (profilesError) throw profilesError

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
    const errors: string[] = []

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
            yearsExperience: user.years_experience ?? 0,
          })

          const rawResponse = await callOpenRouter(prompt)
          const { score, reasoning, dimensions, detailed_reasoning } = parseEvaluationResponse(rawResponse)

          await supabase
            .from('job_evaluations')
            .upsert(
              {
                job_id: job.id,
                user_id: user.id,
                score,
                reasoning,
                dimensions,
                detailed_reasoning,
              },
              { onConflict: 'job_id,user_id', ignoreDuplicates: true },
            )

          evaluatedCount++
        } catch (err) {
          const msg = `job ${job.id} / user ${user.id}: ${err instanceof Error ? err.message : String(err)}`
          Sentry.captureException(err, { extra: { jobId: job.id, userId: user.id, phase } })
          console.error(`Evaluation failed for ${msg}`)
          errors.push(msg)
        }
      }
    }

    if (phase === 'onboarding-2' && errors.length > 0) {
      Sentry.captureMessage('onboarding phase-2: evaluation errors', {
        level: 'warning',
        extra: { userId: userIds?.[0], errorCount: errors.length, errors },
      })
    }

    console.log(`Evaluated ${evaluatedCount} job/user pairs, ${errors.length} errors`)
    return { evaluatedCount, errors }
  },
})
```

- [ ] **Step 1.4 — Run all evaluate-jobs tests and verify they pass**

```bash
npx vitest run src/test/evaluate-jobs.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 1.5 — Commit**

```bash
git add src/trigger/evaluate-jobs.ts src/test/evaluate-jobs.test.ts
git commit -m "feat: add since/until/phase to evaluate-jobs payload with Sentry context"
```

---

## Task 2: Rewrite `onboarding-complete-route.test.ts`

**Files:**
- Modify: `src/test/onboarding-complete-route.test.ts`

The existing tests all mock `tasks.triggerAndWait`, which is being removed. Replace the file with tests for the new API surface (`tasks.trigger` + `runs.poll`).

- [ ] **Step 2.1 — Write the new failing tests**

Replace `src/test/onboarding-complete-route.test.ts` with:

```ts
// src/test/onboarding-complete-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

const mockTrigger = vi.fn()
const mockPoll = vi.fn()
vi.mock('@trigger.dev/sdk', () => ({
  tasks: { trigger: mockTrigger },
  runs: { poll: mockPoll },
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
    expect(mockTrigger).not.toHaveBeenCalled()
  })

  it('returns 200 and only polls phase-1 when phase-1 finds jobs', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTrigger
      .mockResolvedValueOnce({ id: 'run-1' })  // phase 1 trigger
      .mockResolvedValueOnce({ id: 'run-2' })  // phase 2 trigger
    mockPoll.mockResolvedValueOnce({ output: { evaluatedCount: 5 } })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockTrigger).toHaveBeenCalledTimes(2)
    expect(mockTrigger).toHaveBeenNthCalledWith(
      1,
      'evaluate-jobs',
      expect.objectContaining({ userIds: ['user-123'], phase: 'onboarding-1' }),
    )
    expect(mockTrigger).toHaveBeenNthCalledWith(
      2,
      'evaluate-jobs',
      expect.objectContaining({ userIds: ['user-123'], phase: 'onboarding-2' }),
    )
    // phase 2 trigger fires but its poll is never called
    expect(mockPoll).toHaveBeenCalledTimes(1)
    expect(mockPoll).toHaveBeenCalledWith('run-1', { pollIntervalMs: 1000 })
  })

  it('returns 200 and polls phase-2 as fallback when phase-1 finds no jobs', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTrigger
      .mockResolvedValueOnce({ id: 'run-1' })
      .mockResolvedValueOnce({ id: 'run-2' })
    mockPoll
      .mockResolvedValueOnce({ output: { evaluatedCount: 0 } }) // phase 1 empty
      .mockResolvedValueOnce({ output: { evaluatedCount: 3 } }) // phase 2 fills in

    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockTrigger).toHaveBeenCalledTimes(2)
    expect(mockPoll).toHaveBeenCalledTimes(2)
    expect(mockPoll).toHaveBeenNthCalledWith(1, 'run-1', { pollIntervalMs: 1000 })
    expect(mockPoll).toHaveBeenNthCalledWith(2, 'run-2', { pollIntervalMs: 1000 })
  })

  it('returns 500 when runs.poll throws', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTrigger.mockResolvedValueOnce({ id: 'run-1' })
    mockPoll.mockRejectedValueOnce(new Error('trigger timeout'))

    const res = await POST()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2.2 — Run to confirm tests fail**

```bash
npx vitest run src/test/onboarding-complete-route.test.ts
```

Expected: all four tests fail because the route still uses `tasks.triggerAndWait`.

- [ ] **Step 2.3 — Commit the failing tests**

```bash
git add src/test/onboarding-complete-route.test.ts
git commit -m "test: rewrite onboarding-complete-route tests for two-phase trigger+poll"
```

---

## Task 3: Rewrite `/api/onboarding/complete/route.ts`

**Files:**
- Modify: `src/app/api/onboarding/complete/route.ts`

- [ ] **Step 3.1 — Replace the route**

Replace `src/app/api/onboarding/complete/route.ts` with:

```ts
// src/app/api/onboarding/complete/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tasks, runs } from '@trigger.dev/sdk'
import type { evaluateJobsTask } from '@/trigger/evaluate-jobs'

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const oneDayAgo    = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Phase 1: jobs from the last 24h — wait for completion so the user lands on a
    // populated dashboard. Expected runtime: ~15–45s.
    const handle1 = await tasks.trigger<typeof evaluateJobsTask>('evaluate-jobs', {
      userIds: [user.id],
      since: oneDayAgo,
      phase: 'onboarding-1',
    })
    const run1 = await runs.poll(handle1.id, { pollIntervalMs: 1000 })
    const phase1Empty =
      (run1.output as { evaluatedCount: number } | undefined)?.evaluatedCount === 0

    // Phase 2: jobs from 2–7 days ago — fire and forget.
    // Runs in the background; the hourly cron also covers this window.
    const handle2 = await tasks.trigger<typeof evaluateJobsTask>('evaluate-jobs', {
      userIds: [user.id],
      since: sevenDaysAgo,
      until: oneDayAgo,
      phase: 'onboarding-2',
    })

    // Fallback: if the 24h window was empty (e.g. scraper hasn't run yet),
    // wait for phase 2 so the user still lands on a populated dashboard.
    if (phase1Empty) {
      await runs.poll(handle2.id, { pollIntervalMs: 1000 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3.2 — Run the route tests and verify they pass**

```bash
npx vitest run src/test/onboarding-complete-route.test.ts
```

Expected: all four tests pass.

- [ ] **Step 3.3 — Run the full test suite to catch any regressions**

```bash
npx vitest run
```

Expected: all tests pass. If any unrelated test fails, investigate before continuing.

- [ ] **Step 3.4 — Commit**

```bash
git add src/app/api/onboarding/complete/route.ts
git commit -m "fix: replace triggerAndWait with two-phase trigger+poll in onboarding route"
```

---

## Done

All three files are changed, all tests pass, three commits on `develop`.

The fix:
- Phase 1 (24h) runs synchronously → user lands on a populated dashboard
- Phase 2 (7d window) fires-and-forgets → fills in older matches in the background
- If phase 1 is empty, phase 2 is awaited as a fallback
- Phase-2 errors are tagged in Sentry for observability
