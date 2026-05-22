# Onboarding → empty dashboard fix

**Date:** 2026-05-22
**Status:** Approved

---

## Problem

After onboarding completes, evaluated jobs never appear on the dashboard.

**Root cause:** `tasks.triggerAndWait()` from `@trigger.dev/sdk` throws
`"triggerAndWait can only be used from inside a task.run()"` when called outside
a Trigger.dev task context (e.g. from a Next.js API route). The route's
`try/catch` catches this, returns 500. The wizard doesn't check `res.ok`, silently
navigates to an empty dashboard.

**Compounding factor:** The wizard's catch block swallows all non-network errors:

```ts
try {
  await fetch('/api/onboarding/complete', { method: 'POST' })
} catch {
  // silent fallback — jobs will appear on next hourly cron
}
router.push('/dashboard')
```

A 500 response is not a thrown exception; `router.push` always fires.

---

## Solution: two-phase evaluation

Replace `tasks.triggerAndWait` with `tasks.trigger` + `runs.poll` — the correct
external-caller API. Split the evaluation into two phases so the user lands on a
populated dashboard quickly:

- **Phase 1 (blocking):** evaluate jobs posted in the last 24h. Route waits via
  `runs.poll`. Returns when done; wizard navigates to a dashboard with fresh results.
- **Phase 2 (fire-and-forget):** evaluate jobs posted 2–7 days ago. Fires after
  phase 1 returns; fills in older matches in the background.
- **Fallback:** if phase 1 evaluated 0 jobs (24h window empty), route also awaits
  phase 2 so the user always lands on a non-empty dashboard when jobs exist.

Date anchor: `date_posted` (existing behaviour, no change).

---

## Architecture

### 1. `evaluate-jobs` task — payload extension

```ts
interface EvaluateJobsPayload {
  jobIds?: string[]
  userIds?: string[]
  since?: string   // YYYY-MM-DD; defaults to 7d ago if omitted
  until?: string   // YYYY-MM-DD; exclusive upper bound
  phase?: 'onboarding-1' | 'onboarding-2' | 'cron'
}
```

**Jobs query:** replace the hardcoded 7-day block with:

```ts
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  .toISOString().split('T')[0]
jobsQuery = jobsQuery.gte('date_posted', since ?? sevenDaysAgo)
if (until) jobsQuery = jobsQuery.lt('date_posted', until)
```

**Sentry changes:**

1. Add `phase` to every per-job `captureException` `extra`.
2. After the evaluation loop, emit a summary warning when `phase === 'onboarding-2'`
   and `errors.length > 0`:

```ts
if (phase === 'onboarding-2' && errors.length > 0) {
  Sentry.captureMessage('onboarding phase-2: evaluation errors', {
    level: 'warning',
    extra: { userId: userIds?.[0], errorCount: errors.length, errors },
  })
}
```

This surfaces silent phase-2 failures (e.g. OpenRouter rate limits) without
blocking the user. The hourly cron recovers the gap.

---

### 2. `/api/onboarding/complete` route

```ts
import { tasks, runs } from '@trigger.dev/sdk'
import type { evaluateJobsTask } from '@/trigger/evaluate-jobs'

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const oneDayAgo   = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Phase 1: last 24h — wait for completion
    const handle1 = await tasks.trigger<typeof evaluateJobsTask>('evaluate-jobs', {
      userIds: [user.id], since: oneDayAgo, phase: 'onboarding-1',
    })
    const run1 = await runs.poll(handle1.id, { pollIntervalMs: 1000 })
    const phase1Empty =
      (run1.output as { evaluatedCount: number } | undefined)?.evaluatedCount === 0

    // Phase 2: 2–7 day window — fire and forget (unless phase 1 was empty)
    const handle2 = await tasks.trigger<typeof evaluateJobsTask>('evaluate-jobs', {
      userIds: [user.id], since: sevenDaysAgo, until: oneDayAgo, phase: 'onboarding-2',
    })
    if (phase1Empty) {
      await runs.poll(handle2.id, { pollIntervalMs: 1000 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
```

`maxDuration = 300` is kept. Phase 1 is expected to finish well within 60s.
The fallback path (phase 1 empty → await phase 2) may take longer but stays
within the 5-minute limit for normal job volumes.

---

### 3. Tests — `onboarding-complete-route.test.ts`

Replace the four existing tests (all mock `tasks.triggerAndWait` which is removed):

| Test | Mock setup | Expected |
|------|-----------|----------|
| Unauthenticated | `getUser → null` | 401 |
| Normal path (phase 1 has jobs) | `trigger → handle`, `poll → { evaluatedCount: 5 }` × 1 call; phase 2 trigger fires but poll not awaited | 200; `trigger` called twice, `poll` called once |
| Fallback path (phase 1 empty) | `poll → { evaluatedCount: 0 }` for run1, `{ evaluatedCount: 3 }` for run2 | 200; `poll` called twice |
| `runs.poll` throws | `poll` rejects | 500 |

---

## Data flow

```
saveStep4()
  └─ upsert profiles (onboarding_completed = true)
  └─ setStep('loading')
  └─ fetch POST /api/onboarding/complete
       └─ getUser()  ✓
       └─ tasks.trigger(evaluate-jobs, {since: 1d, phase: onboarding-1})
       └─ runs.poll(handle1.id)   ← waits ~15–45s
            └─ evaluate-jobs task: jobs[0..N] × user → OpenRouter → job_evaluations
       └─ if evaluatedCount == 0:
            └─ runs.poll(handle2.id)  ← fallback waits
       else:
            └─ tasks.trigger(evaluate-jobs, {since: 7d, until: 1d, phase: onboarding-2})  ← fire & forget
       └─ return { ok: true }
  └─ router.push('/dashboard')   ← now has results
```

---

## Files changed

| File | Change |
|------|--------|
| `src/trigger/evaluate-jobs.ts` | Add `since`, `until`, `phase` to payload; update jobs query; Sentry context |
| `src/app/api/onboarding/complete/route.ts` | Replace `tasks.triggerAndWait` with two-phase trigger+poll |
| `src/test/onboarding-complete-route.test.ts` | Rewrite all four tests for new route behaviour |

No wizard changes required — the route contract (`POST → { ok: true }` or 500) is unchanged.

---

## Out of scope

- Dashboard "more jobs loading" banner (nice-to-have, deferred)
- Wizard `res.ok` check (the route is now reliable; silent fallback comment stays accurate)
- Changing `date_posted` to `synced_at` as anchor (noted risk, deferred)
