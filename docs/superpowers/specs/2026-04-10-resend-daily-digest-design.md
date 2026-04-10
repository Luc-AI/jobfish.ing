# Resend Daily Job Digest Design

**Date:** 2026-04-10
**Status:** Approved
**Relates to:** `docs/superpowers/specs/2026-04-01-jobfishing-design.md`, `docs/superpowers/specs/2026-04-08-apify-integration-design.md`

---

## 1. Overview

Replace the current immediate per-job email notification flow with a single daily email digest per user, delivered through Resend each morning.

Jobs should continue to be scraped and evaluated on the existing schedule. Email delivery becomes a separate scheduled step that runs once per morning in a shared timezone.

This design keeps the existing pipeline shape intact:

- `scrape-jobs` continues discovering fresh jobs
- `evaluate-jobs` continues creating `job_evaluations`
- a new scheduled digest task sends one grouped email per user

The goal is to avoid email spam while still surfacing high-signal matches promptly in a predictable daily routine.

---

## 2. Product Behavior

### User-facing behavior

Each eligible user receives at most one digest email per morning.

That digest contains only jobs that:

- were evaluated for that user
- meet or exceed that user's configured threshold
- belong to users with `notifications_enabled = true`
- have not already been sent in a digest
- were created within the last 24 hours

The digest is intentionally limited to the last 24 hours. Older unsent evaluations are excluded from the morning email instead of being backfilled automatically.

### Shared timezone

Version 1 uses one shared digest timezone for all users:

- `Europe/Zurich`

### Later

Add support for sending digests in each user's own timezone.

---

## 3. Pipeline Changes

### Current behavior

Today, `evaluate-jobs` triggers `notify-users` immediately after writing new evaluations. That task sends one email per qualifying evaluation.

### New behavior

`evaluate-jobs` should stop triggering email delivery directly.

Instead:

1. `scrape-jobs` continues running on its current hourly cadence
2. `evaluate-jobs` continues inserting `job_evaluations`
3. a new scheduled Trigger.dev task runs every morning in `Europe/Zurich`
4. that task finds each user's qualifying evaluations from the last 24 hours
5. it groups them by user
6. it sends one Resend digest email per user
7. after a successful send, it marks the included evaluations as notified

This separates scoring from delivery and makes the delivery behavior predictable.

---

## 4. Trigger Tasks

### Keep

- `scrape-jobs`
- `scrape-jobs-initial`
- `evaluate-jobs`

### Change

Update `evaluate-jobs` so it no longer calls the current notification task after evaluation completes.

### Add

Add a new scheduled task:

```ts
schedules.task({
  id: 'send-daily-job-digests',
  cron: { pattern: '0 8 * * *', timezone: 'Europe/Zurich' },
  run: async () => {
    // query qualifying evaluations from the last 24h
    // group by user
    // send one digest email per user via Resend
    // mark included evaluations as notified
  },
})
```

### Replace notification delivery behavior

The existing `notify-users` task should no longer be responsible for immediate one-email-per-job delivery.

Implementation should keep a single digest-delivery task responsible for:

- selecting qualifying evaluations from the last 24 hours
- grouping them by user
- sending one Resend digest per user
- marking included evaluations as notified after a successful send

Whether that logic stays in `notify-users.tsx` or moves to a new task file is an implementation detail. The required behavior is daily grouped digest delivery.

---

## 5. Query and Eligibility Rules

The digest task should query evaluations that meet all of these rules:

- `job_evaluations.notified_at IS NULL`
- `job_evaluations.created_at >= now() - interval '24 hours'`
- related `profiles.notifications_enabled = true`
- `job_evaluations.score >= profiles.threshold`

The task should join the related job data needed for email rendering:

- title
- company
- location
- url
- source
- reasoning
- score

Grouping happens by `user_id`.

For each user, the task should fetch the user's email address through Supabase auth admin, as the current implementation already does.

### Important consequence

Because the digest only includes the last 24 hours, rows that remain unsent past that window are not picked up automatically by future digests.

That is acceptable for v1 and keeps the behavior aligned with the explicitly requested product rule.

---

## 6. State Tracking

Use the existing `job_evaluations.notified_at` column as the only send marker in v1.

Behavior:

- before sending: rows remain `notified_at = null`
- after successful digest send for a user: set `notified_at` for all evaluations included in that digest
- if sending fails: leave `notified_at = null`

This keeps the initial implementation simple and avoids introducing a separate digest table.

### Trade-off

This does not preserve a first-class record of which specific digest email contained which evaluations.

That is acceptable for v1 because the immediate need is reliable grouped delivery, not delivery analytics.

### Later

If needed, add explicit digest tracking such as:

- `email_digests`
- `email_digest_items`

That future design would support auditability, replay, and richer delivery insights.

---

## 7. Email Template

The existing single-job email at `src/lib/email/job-notification.tsx` is not the right shape for the new behavior.

Create a digest-oriented email template that renders:

- a summary heading like `3 new job matches this morning`
- a compact list of jobs
- for each job:
  - title
  - company
  - location
  - score
  - short reasoning
  - apply link

Recommended structure:

- keep the current single-job template untouched if it is still useful during transition
- add a dedicated digest template next to it

The subject line should summarize the digest rather than a single job. The default subject should be:

```txt
3 new job matches this morning
```

---

## 8. Resend and Environment Setup

The repository already includes:

- `resend`
- `@react-email/components`
- a linked Vercel project

Verified from the linked Vercel project:

- `RESEND_API_KEY` exists in `development`
- `RESEND_FROM_EMAIL` exists in `development`

The digest task should continue using environment variables for configuration:

```txt
RESEND_API_KEY
RESEND_FROM_EMAIL
```

Never hardcode Resend credentials or sender addresses.

### Deployment note

Because digest delivery runs inside Trigger.dev tasks, the same required Resend env vars must be available wherever those tasks run, not only in the Next.js app environment.

---

## 9. File Map

Expected files to touch during implementation:

| File | Responsibility |
|---|---|
| `src/trigger/evaluate-jobs.ts` | Stop immediate notification triggering |
| `src/trigger/notify-users.tsx` or new digest task file | Daily digest query, grouping, send flow |
| `src/lib/email/job-notification.tsx` or new digest template file | Daily digest email rendering |
| `src/test/...` | Query logic, rendering, and task behavior tests |

The final implementation may rename the task or split files differently, but these are the main responsibility boundaries.

---

## 10. Error Handling

The digest task should handle failures per user, not fail the entire morning batch because of one bad send.

Recommended behavior:

- if one user's email lookup fails, capture the error and continue
- if one user's Resend send fails, capture the error and continue
- only mark `notified_at` for that user's evaluations after a successful send

This mirrors the resilience pattern already used in the evaluation pipeline.

---

## 11. Verification

Implementation is not complete until all of these are verified:

1. Unit test the digest selection logic:
   - only `notified_at = null`
   - only rows from the last 24 hours
   - only users with notifications enabled
   - only scores at or above threshold
2. Unit test grouping logic:
   - multiple qualifying jobs for one user become one digest payload
3. Template render test:
   - multi-job digest renders expected content
4. Task behavior test:
   - successful send updates `notified_at`
   - failed send leaves `notified_at` untouched
5. Manual development verification:
   - trigger or run the digest flow with real development env vars
   - confirm email delivery through Resend

---

## 12. Later TODOs

- Per-user timezone support for morning delivery
- Explicit digest tracking tables if auditability or replay becomes important
- Possible resend/recovery strategy for jobs that miss the 24-hour digest window
