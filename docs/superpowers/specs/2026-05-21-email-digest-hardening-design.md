# Email Digest Hardening Design

**Date:** 2026-05-21
**Status:** Approved
**Relates to:** `docs/superpowers/specs/2026-04-10-resend-daily-digest-design.md`

---

## 1. Overview

The daily email digest (`notify-users` Trigger.dev task) was implemented and merged in April 2026. This spec covers a set of targeted hardening changes identified during review:

- Remove the 24-hour `created_at` filter (risk-averse: never miss a job)
- Fix per-user error isolation (auth failures must not abort the batch)
- Sort digest jobs by score descending (best match first)
- Prettify raw source labels in the email
- Raise task retry count to 2
- Align subject line and email heading to the same phrasing
- Remove title+company deduplication (testing data quality from Jobich)

No architecture changes. No new files. All changes are within `src/trigger/notify-users.tsx` and `src/lib/email/job-digest.tsx`.

---

## 2. Design Principle

> Never miss a job posting that is actually interesting. Prefer over-delivery to under-delivery. When in doubt, show more.

This principle drives every decision in this spec. See also `BACKLOG.md § Compliance` for the deferred unsubscribe work.

---

## 3. Changes

### 3.1 Drop the `created_at >= 24h` filter

**Current:**
```ts
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
supabase
  .from('job_evaluations')
  .select(...)
  .is('notified_at', null)
  .gte('created_at', since)
```

**New:**
```ts
supabase
  .from('job_evaluations')
  .select(...)
  .is('notified_at', null)
```

**Why:** The `created_at` filter creates a silent data loss guarantee. If the digest task fails on a given morning, evaluations from that run become permanently unreachable on all future runs. `notified_at IS NULL` is the correct and sufficient idempotency guard — once sent, a row is marked; if not sent, it remains eligible indefinitely. The `since` variable and the `evaluationsError` early-return at an empty result are the only callers of `since`; both disappear with this change.

**Bound on backlog size:** `evaluate-jobs` only processes jobs posted within the last 7 days, so the pool of unnotified evaluations is already naturally bounded.

### 3.2 Fix per-user error isolation

**Current behavior:** auth lookup failure or missing email throws inside the `for` loop, which propagates through the `catch (error) { throw error }` block and aborts all remaining users.

**New behavior:** per-user failures (auth error, missing email, render error) capture to Sentry and `continue` to the next user. Only infrastructure-level failures (DB query errors, missing `RESEND_API_KEY`) throw and abort the task.

```ts
for (const digest of digests) {
  try {
    // auth lookup, render, send...
    if (authError || !user?.email || sendError) {
      Sentry.captureException(...)
      continue  // skip this user, do not mark notified
    }
  } catch (error) {
    // unexpected error for this user
    Sentry.captureException(error, { extra: { userId: digest.userId } })
    continue  // do not abort the batch
  }
  // mark notified only on full success
}
```

The `updateError` path (marking `notified_at` fails after a successful send) remains a throw — that is a data integrity issue that warrants aborting.

### 3.3 Sort digest jobs by score descending

In `buildUserDigests`, after collecting a user's jobs, sort by `score` descending before returning. Best match appears first in the email.

```ts
digestsByUser.set(evaluation.user_id, {
  userId: evaluation.user_id,
  evaluationIds: [...],
  jobs: [...].sort((a, b) => b.score - a.score),
})
```

In practice: sort the final `jobs` array per digest, not inline during accumulation, to keep the logic clean.

### 3.4 Prettify source labels

Replace the no-op `formatSource` stub with a lookup map for known Jobich source strings:

```ts
const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  'jobs.ch': 'jobs.ch',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
}

function formatSource(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source
}
```

Unknown sources fall back to the raw string unchanged.

### 3.5 Raise retry to 2

With per-user errors now isolated (no longer throwing), the only throws remaining are infrastructure failures. On an infra failure, no `notified_at` rows are written, so a retry is safe — `notified_at IS NULL` prevents double-sends.

```ts
retry: { maxAttempts: 2 }
```

### 3.6 Align subject and heading

**Current:**
- Subject: `"N new job matches for you"` (`getDigestSubject`)
- Email heading: `"N new job matches this morning"` (`headingForCount`)

**New:** both use `"N new job match/matches this morning"`.

Update `getDigestSubject` in `notify-users.tsx` to match `headingForCount` in `job-digest.tsx`.

### 3.7 Remove title+company deduplication

Remove the `seenByUser` / `jobKey` deduplication logic from `buildUserDigests`. Every qualifying evaluation is included in the digest as-is. This surfaces any duplicate entries from Jobich for data quality observation.

---

## 4. Files to change

| File | Change |
|---|---|
| `src/trigger/notify-users.tsx` | Drop `created_at` filter, fix error isolation, align subject, remove dedup logic |
| `src/lib/email/job-digest.tsx` | Subject/heading alignment (heading already correct, no change needed) |
| `src/test/notify-users.test.ts` | Update tests: no `since` assertion, per-user continue behavior, no dedup, score sort |

---

## 5. What does not change

- Trigger schedule: `0 8 * * *` Europe/Zurich
- Resend SDK usage (correct; MCP is a dev tool, not for task code)
- `notified_at` as the idempotency guard
- React Email rendering
- Threshold + `notifications_enabled` filtering
- `/notifications` settings page and UI

---

## 6. Deferred

- **Resend Audiences / unsubscribe link** — see `BACKLOG.md § Compliance`
- **Per-user timezone** — all users share Europe/Zurich for now
