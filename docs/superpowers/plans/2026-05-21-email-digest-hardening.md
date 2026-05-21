# Email Digest Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply seven targeted hardening changes to the daily email digest task so it never silently drops jobs, isolates per-user failures, and presents matches in the best order.

**Architecture:** All changes are confined to two files: `src/trigger/notify-users.tsx` (task logic and digest-building) and `src/test/notify-users.test.ts` (all related tests). No schema migrations, no new files, no API changes.

**Tech Stack:** Trigger.dev scheduled task, Resend SDK, React Email (`@react-email/components`), Supabase service client, Vitest + Testing Library.

---

## File Map

| File | What changes |
|---|---|
| `src/trigger/notify-users.tsx` | All 7 changes: filter, dedup, sort, source labels, subject, error handling, retry |
| `src/test/notify-users.test.ts` | Updated tests matching every behavior change above |

---

### Task 1: Remove deduplication from `buildUserDigests`

**Files:**
- Modify: `src/trigger/notify-users.tsx:67-124`
- Modify: `src/test/notify-users.test.ts`

- [ ] **Step 1: Update the dedup test to describe the new behavior (no dedup)**

In `src/test/notify-users.test.ts`, replace the existing test named `'deduplicates evaluations for the same title+company (different URLs/sources)'` with this:

```ts
it('includes all evaluations for the same title+company without deduplication', () => {
  const digests = buildUserDigests(
    [
      {
        id: 'evaluation-1',
        score: 8.5,
        reasoning: 'From LinkedIn',
        user_id: 'user-1',
        created_at: '2026-04-14T01:00:00.000Z',
        jobs: {
          title: 'Head of Product',
          company: 'Acme',
          location: 'Zurich',
          url: 'https://linkedin.com/jobs/123',
          source: 'linkedin',
        },
      },
      {
        id: 'evaluation-2',
        score: 8.2,
        reasoning: 'From career site',
        user_id: 'user-1',
        created_at: '2026-04-14T02:00:00.000Z',
        jobs: {
          title: 'Head of Product',
          company: 'Acme',
          location: 'Zurich',
          url: 'https://acme.com/careers/head-of-product',
          source: 'company_site',
        },
      },
    ],
    [{ id: 'user-1', threshold: 7, notifications_enabled: true }]
  )

  expect(digests).toEqual([
    {
      userId: 'user-1',
      evaluationIds: ['evaluation-1', 'evaluation-2'],
      jobs: [
        {
          jobTitle: 'Head of Product',
          company: 'Acme',
          location: 'Zurich',
          score: 8.5,
          reasoning: 'From LinkedIn',
          applyUrl: 'https://linkedin.com/jobs/123',
          source: 'linkedin',
        },
        {
          jobTitle: 'Head of Product',
          company: 'Acme',
          location: 'Zurich',
          score: 8.2,
          reasoning: 'From career site',
          applyUrl: 'https://acme.com/careers/head-of-product',
          source: 'company_site',
        },
      ],
    },
  ])
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: test fails — current code returns `evaluationIds: ['evaluation-1']` (only one), not both.

- [ ] **Step 3: Remove the dedup logic from `buildUserDigests`**

In `src/trigger/notify-users.tsx`, replace the `buildUserDigests` function body with:

```ts
export function buildUserDigests(
  evaluations: EvaluationRow[],
  profiles: ProfileRow[]
): UserDigest[] {
  const profileById = new Map(profiles.map(profile => [profile.id, profile]))
  const digestsByUser = new Map<string, UserDigest>()

  for (const evaluation of sortEvaluations(evaluations)) {
    const profile = profileById.get(evaluation.user_id)
    const threshold = profile?.threshold ?? 7

    if (profile?.notifications_enabled !== true || evaluation.score < threshold) {
      continue
    }

    const job = getEvaluationJob(evaluation.jobs)
    if (!job) {
      continue
    }

    const existingDigest = digestsByUser.get(evaluation.user_id)
    const digestJob: DigestJobItem = {
      jobTitle: job.title,
      company: job.company,
      location: job.location ?? null,
      score: evaluation.score,
      reasoning: evaluation.reasoning ?? '',
      applyUrl: job.url,
      source: formatSource(job.source),
    }

    if (existingDigest) {
      existingDigest.evaluationIds.push(evaluation.id)
      existingDigest.jobs.push(digestJob)
      continue
    }

    digestsByUser.set(evaluation.user_id, {
      userId: evaluation.user_id,
      evaluationIds: [evaluation.id],
      jobs: [digestJob],
    })
  }

  return [...digestsByUser.values()].sort((left, right) => {
    return compareNullableStrings(left.userId, right.userId)
  })
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/notify-users.tsx src/test/notify-users.test.ts
git commit -m "feat: remove title+company deduplication from digest builder"
```

---

### Task 2: Drop the `created_at` filter from the task query

**Files:**
- Modify: `src/trigger/notify-users.tsx:133-161`
- Modify: `src/test/notify-users.test.ts`

- [ ] **Step 1: Update the mock chain and all test overrides**

In `src/test/notify-users.test.ts`:

**a) Remove the `mockJobEvaluationsGte` mock declaration at the top of the file.** Delete this line:
```ts
const mockJobEvaluationsGte = vi.fn()
```

**b) In `beforeEach`, replace the three-step mock chain with a two-step chain.** Replace:
```ts
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-04-10T06:00:00.000Z'))
// ...
mockJobEvaluationsSelect.mockReturnValue({ is: mockJobEvaluationsIs })
mockJobEvaluationsIs.mockReturnValue({ gte: mockJobEvaluationsGte })
mockJobEvaluationsGte.mockResolvedValue({ data: [], error: null })
```

With:
```ts
mockJobEvaluationsSelect.mockReturnValue({ is: mockJobEvaluationsIs })
mockJobEvaluationsIs.mockResolvedValue({ data: [], error: null })
```

**c) Remove the `afterEach` block entirely** (it only existed to restore fake timers):
```ts
// DELETE this entire block:
afterEach(() => {
  vi.useRealTimers()
})
```

**d) In the integration test `'groups qualifying evaluations into one digest per user...'`, change the evaluation data override** from:
```ts
mockJobEvaluationsGte.mockResolvedValueOnce({
  data: [...],
  error: null,
})
```
To:
```ts
mockJobEvaluationsIs.mockResolvedValueOnce({
  data: [...],
  error: null,
})
```

**e) Remove the `created_at` assertion** from that same integration test. Delete:
```ts
expect(mockJobEvaluationsGte).toHaveBeenCalledWith('created_at', '2026-04-09T06:00:00.000Z')
```

**f) In the test `'does not mark evaluations notified when sending a digest fails'`, change the evaluation data override** from:
```ts
mockJobEvaluationsGte.mockResolvedValueOnce({
  data: [...],
  error: null,
})
```
To:
```ts
mockJobEvaluationsIs.mockResolvedValueOnce({
  data: [...],
  error: null,
})
```

**g) Apply the same `mockJobEvaluationsGte` → `mockJobEvaluationsIs` rename to every other test** that overrides evaluation data: `'throws when sending succeeds but marking evaluations as notified fails'` and `'throws when a qualifying digest user has no deliverable email'`.

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: multiple failures — `mockJobEvaluationsIs.mockResolvedValue is not a function` or similar, because the implementation still calls `.gte()` which the mock no longer chains.

- [ ] **Step 3: Remove `since` and `.gte()` from the task**

In `src/trigger/notify-users.tsx`, inside the `run` function, replace:

```ts
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const { data: evaluations, error: evaluationsError } = await supabase
  .from('job_evaluations')
  .select(`
    id,
    score,
    reasoning,
    user_id,
    created_at,
    jobs (
      title,
      company,
      location,
      url,
      source
    )
  `)
  .is('notified_at', null)
  .gte('created_at', since)
```

With:

```ts
const { data: evaluations, error: evaluationsError } = await supabase
  .from('job_evaluations')
  .select(`
    id,
    score,
    reasoning,
    user_id,
    created_at,
    jobs (
      title,
      company,
      location,
      url,
      source
    )
  `)
  .is('notified_at', null)
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/notify-users.tsx src/test/notify-users.test.ts
git commit -m "feat: remove 24h created_at filter — use notified_at IS NULL as sole eligibility guard"
```

---

### Task 3: Sort jobs by score descending within each user digest

**Files:**
- Modify: `src/trigger/notify-users.tsx:121-124`
- Modify: `src/test/notify-users.test.ts`

- [ ] **Step 1: Write a failing test for score ordering**

Add this test inside the `describe('notifyUsersTask')` block in `src/test/notify-users.test.ts`:

```ts
it('sorts jobs by score descending within each user digest', () => {
  const digests = buildUserDigests(
    [
      {
        id: 'evaluation-1',
        score: 7.5,
        reasoning: 'Decent match',
        user_id: 'user-1',
        jobs: { title: 'Job A', company: 'Acme', location: null, url: 'https://example.com/a', source: 'linkedin' },
      },
      {
        id: 'evaluation-2',
        score: 9.0,
        reasoning: 'Excellent match',
        user_id: 'user-1',
        jobs: { title: 'Job B', company: 'Acme', location: null, url: 'https://example.com/b', source: 'linkedin' },
      },
      {
        id: 'evaluation-3',
        score: 8.2,
        reasoning: 'Strong match',
        user_id: 'user-1',
        jobs: { title: 'Job C', company: 'Acme', location: null, url: 'https://example.com/c', source: 'linkedin' },
      },
    ],
    [{ id: 'user-1', threshold: 7, notifications_enabled: true }]
  )

  expect(digests[0].jobs.map(j => j.score)).toEqual([9.0, 8.2, 7.5])
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: test fails — jobs are currently in `created_at`/id order, not score order.

- [ ] **Step 3: Add score sort to the return of `buildUserDigests`**

In `src/trigger/notify-users.tsx`, replace the final `return` of `buildUserDigests`:

```ts
return [...digestsByUser.values()].sort((left, right) => {
  return compareNullableStrings(left.userId, right.userId)
})
```

With:

```ts
return [...digestsByUser.values()]
  .sort((left, right) => compareNullableStrings(left.userId, right.userId))
  .map(digest => ({
    ...digest,
    jobs: [...digest.jobs].sort((a, b) => b.score - a.score),
  }))
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/notify-users.tsx src/test/notify-users.test.ts
git commit -m "feat: sort digest jobs by score descending — best match appears first"
```

---

### Task 4: Prettify source labels

**Files:**
- Modify: `src/trigger/notify-users.tsx:8-10`
- Modify: `src/test/notify-users.test.ts`

- [ ] **Step 1: Add a test for source label formatting**

Add this test inside the `describe` block in `src/test/notify-users.test.ts`:

```ts
it('formats known source labels for display', () => {
  const digests = buildUserDigests(
    [
      {
        id: 'e1',
        score: 8.0,
        reasoning: 'Good',
        user_id: 'user-1',
        jobs: { title: 'Role', company: 'Co', location: null, url: 'https://example.com', source: 'linkedin' },
      },
    ],
    [{ id: 'user-1', threshold: 7, notifications_enabled: true }]
  )

  expect(digests[0].jobs[0].source).toBe('LinkedIn')
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: test fails — current `formatSource` returns `'linkedin'` unchanged.

- [ ] **Step 3: Replace `formatSource` with a label map**

In `src/trigger/notify-users.tsx`, replace:

```ts
function formatSource(source: string): string {
  return source
}
```

With:

```ts
const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  'jobs.ch': 'jobs.ch',
}

function formatSource(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source
}
```

- [ ] **Step 4: Update all `source: 'linkedin'` assertions in the test file to `source: 'LinkedIn'`**

The following test cases contain `source: 'linkedin'` in their expected output and must be updated. Search for `source: 'linkedin'` in `src/test/notify-users.test.ts` and change every instance in an `expect(...)` block to `source: 'LinkedIn'`. Tests that pass `source: 'linkedin'` as *input data* (inside the mock evaluation objects) stay unchanged — only the *expected output* assertions change.

Affected tests:
- `'includes all evaluations for the same title+company without deduplication'` — one job expectation
- `'builds digests from array-shaped job relations and skips null jobs'` — one job expectation
- `'groups qualifying evaluations into one digest per user...'` (integration test) — multiple job expectations where source is `'linkedin'`
- `'sorts jobs by score descending within each user digest'` — three job expectations (all `source: 'linkedin'`)
- `'formats known source labels for display'` — already written above with `'LinkedIn'`

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/trigger/notify-users.tsx src/test/notify-users.test.ts
git commit -m "feat: prettify source labels in digest email (linkedin → LinkedIn)"
```

---

### Task 5: Align subject line to "this morning"

**Files:**
- Modify: `src/trigger/notify-users.tsx:55-57`
- Modify: `src/test/notify-users.test.ts`

- [ ] **Step 1: Add a subject line assertion to the integration test**

In the integration test `'groups qualifying evaluations into one digest per user...'` in `src/test/notify-users.test.ts`, after the existing `expect(mockSend.mock.calls.map(([payload]) => payload.to))` assertion, add:

```ts
expect(mockSend.mock.calls.map(([payload]) => payload.subject)).toEqual([
  '2 new job matches this morning',
  '1 new job match this morning',
])
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: test fails — current subject is `"2 new job matches for you"`.

- [ ] **Step 3: Update `getDigestSubject`**

In `src/trigger/notify-users.tsx`, replace:

```ts
function getDigestSubject(jobCount: number): string {
  return `${jobCount} new job match${jobCount === 1 ? '' : 'es'} for you`
}
```

With:

```ts
function getDigestSubject(jobCount: number): string {
  return `${jobCount} new job match${jobCount === 1 ? '' : 'es'} this morning`
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/notify-users.tsx src/test/notify-users.test.ts
git commit -m "fix: align digest subject line to 'this morning' phrasing"
```

---

### Task 6: Fix per-user error isolation

**Files:**
- Modify: `src/trigger/notify-users.tsx:196-244`
- Modify: `src/test/notify-users.test.ts`

- [ ] **Step 1: Update the "missing email" test to expect `continue` behavior**

In `src/test/notify-users.test.ts`, replace the test `'throws when a qualifying digest user has no deliverable email'` with:

```ts
it('skips users with no deliverable email and continues the batch', async () => {
  mockJobEvaluationsIs.mockResolvedValueOnce({
    data: [
      {
        id: 'evaluation-1',
        score: 8.4,
        reasoning: 'Strong match',
        user_id: 'user-1',
        created_at: '2026-04-10T01:00:00.000Z',
        jobs: {
          title: 'Head of Product',
          company: 'Acme',
          location: 'Zurich',
          url: 'https://example.com/head-of-product',
          source: 'linkedin',
        },
      },
    ],
    error: null,
  })

  mockProfilesIn.mockResolvedValueOnce({
    data: [{ id: 'user-1', threshold: 7, notifications_enabled: true }],
    error: null,
  })

  mockGetUserById.mockResolvedValueOnce({
    data: { user: { id: 'user-1', email: null } },
  })

  mockCreateServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'job_evaluations') return { select: mockJobEvaluationsSelect, update: mockEvaluationUpdate }
      if (table === 'profiles') return { select: mockProfilesSelect }
      throw new Error(`Unexpected table: ${table}`)
    },
    auth: { admin: { getUserById: mockGetUserById } },
  })

  const result = await (notifyUsersTask as any).run()

  expect(result).toEqual({ notifiedCount: 0, evaluationCount: 0 })
  expect(mockSend).not.toHaveBeenCalled()
  expect(mockEvaluationUpdate).not.toHaveBeenCalled()
  expect(mockCaptureException).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Missing email for digest recipient' }),
    expect.objectContaining({ extra: { userId: 'user-1' } })
  )
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: test fails — current code throws instead of returning `{ notifiedCount: 0, evaluationCount: 0 }`.

- [ ] **Step 3: Fix the per-user loop in `notifyUsersTask`**

In `src/trigger/notify-users.tsx`, replace the entire `for (const digest of digests)` block:

```ts
for (const digest of digests) {
  try {
    const authLookup = await supabase.auth.admin.getUserById(digest.userId)
    const authError = 'error' in authLookup ? authLookup.error : null
    const user = authLookup.data?.user

    if (authError) {
      Sentry.captureException(authError, { extra: { userId: digest.userId } })
      continue
    }

    if (!user?.email) {
      const missingEmailError = new Error('Missing email for digest recipient')
      Sentry.captureException(missingEmailError, { extra: { userId: digest.userId } })
      continue
    }

    const html = await render(<JobDigestEmail jobs={digest.jobs} />)

    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
      to: user.email,
      subject: getDigestSubject(digest.jobs.length),
      html,
    })

    if (sendError) {
      Sentry.captureException(sendError, { extra: { userId: digest.userId } })
      continue
    }
  } catch (error) {
    Sentry.captureException(error, { extra: { userId: digest.userId } })
    continue
  }

  const { error: updateError } = await supabase
    .from('job_evaluations')
    .update({ notified_at: new Date().toISOString() })
    .in('id', digest.evaluationIds)

  if (updateError) {
    Sentry.captureException(updateError, {
      extra: { userId: digest.userId, evaluationIds: digest.evaluationIds },
    })
    throw updateError
  }

  notifiedCount++
  evaluationCount += digest.evaluationIds.length
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/notify-users.tsx src/test/notify-users.test.ts
git commit -m "fix: isolate per-user errors in digest loop — auth/send failures continue, not throw"
```

---

### Task 7: Raise retry count to 2

**Files:**
- Modify: `src/trigger/notify-users.tsx:132`
- Modify: `src/test/notify-users.test.ts`

- [ ] **Step 1: Update the retry assertion in the test**

In `src/test/notify-users.test.ts`, find the test:

```ts
it('is configured to avoid automatic retries after a post-send failure', () => {
  expect((notifyUsersTask as any).retry).toEqual({ maxAttempts: 1 })
})
```

Replace it with:

```ts
it('is configured with a single retry — safe because notified_at guards against double-sends', () => {
  expect((notifyUsersTask as any).retry).toEqual({ maxAttempts: 2 })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/test/notify-users.test.ts --reporter=verbose
```

Expected: test fails — current value is `maxAttempts: 1`.

- [ ] **Step 3: Update the retry config in the task**

In `src/trigger/notify-users.tsx`, replace:

```ts
retry: { maxAttempts: 1 },
```

With:

```ts
retry: { maxAttempts: 2 },
```

- [ ] **Step 4: Run the full test suite to confirm everything passes**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass (31 test files, the 5 failing `evaluate-jobs` tests are a pre-existing issue unrelated to this feature — they fail due to missing `OPENROUTER_API_KEY` in the test environment).

- [ ] **Step 5: Commit**

```bash
git add src/trigger/notify-users.tsx src/test/notify-users.test.ts
git commit -m "feat: raise digest task retry to 2 — per-user errors no longer throw"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| 3.1 Drop `created_at` filter | Task 2 |
| 3.2 Fix per-user error isolation | Task 6 |
| 3.3 Sort by score descending | Task 3 |
| 3.4 Prettify source labels | Task 4 |
| 3.5 Raise retry to 2 | Task 7 |
| 3.6 Align subject line | Task 5 |
| 3.7 Remove deduplication | Task 1 |

All 7 spec sections covered. ✓

**Placeholder scan:** No TBDs, no "add appropriate handling", no forward references to undefined functions. ✓

**Type consistency:** `DigestJobItem`, `EvaluationRow`, `ProfileRow`, `UserDigest` are all defined in the existing file and referenced consistently across all tasks. `SOURCE_LABELS` is introduced in Task 4 and used only within `formatSource`. ✓

**Note on existing test failures:** `src/test/evaluate-jobs.test.ts` has 5 pre-existing failures due to missing `OPENROUTER_API_KEY` in the test environment. These are unrelated to this plan — do not attempt to fix them here.
