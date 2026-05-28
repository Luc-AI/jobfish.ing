# Email Digest Redesign

**Date:** 2026-05-28
**Status:** Approved (design phase)
**Touches:** [src/lib/email/job-digest.tsx](../../../src/lib/email/job-digest.tsx), [src/trigger/notify-users.tsx](../../../src/trigger/notify-users.tsx), [src/test/job-digest.test.tsx](../../../src/test/job-digest.test.tsx)

## Problem

The current morning digest is information-thin and ends at the email — there's no path back into the dashboard for users who want to triage rather than apply immediately.

Concretely:
- Each card surfaces only title / company / location / source / score / reasoning / Apply. The five score dimensions (`role_fit`, `domain_fit`, `experience_fit`, `location_fit`, `upside`) already exist on `evaluation.dimensions` and are dropped.
- Reasoning is rendered in full as a multi-line italic block, dominating each card and forcing the user to read prose to evaluate a job.
- Only CTA is the external apply URL. There is no link to the dashboard job detail page, so the email can't function as a "triage from inbox" surface.

## Goals

1. Increase information density per card without making the email longer.
2. Make the digest a triage surface, not a dead-end: every job links back into the dashboard.
3. Keep the email rendering safe across Gmail, Apple Mail, and Outlook (no flex tricks, no JS).

## Non-goals

- Changing notification cadence or threshold logic.
- Changing what jobs land in the digest (`notifyUsersTask` selection logic stays the same).
- Pushing templates to Resend's broadcast/template system — this stays a transactional React Email rendered server-side.
- Mobile-specific responsive layout — React Email's default container width is acceptable.

## Design

### Layout (Option C — hero + tail)

```
┌──────────────────────────────────────────────────────────────┐
│  jobfishing · 3 matches this morning                         │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  ★ HIGHEST SCORE                                             │
│  ╔════════════════════════════════════════════════════════╗ │
│  ║  Senior Product Engineer                          8.7  ║ │
│  ║  Stripe · Zurich (remote)                              ║ │
│  ║                                                        ║ │
│  ║  Role 9 · Dom 8 · Exp 9 · Loc 10 · Upside 7           ║ │
│  ║  Strong React + payments match.                        ║ │
│  ║                                                        ║ │
│  ║  [ Open in dashboard → ]   [ Apply ]                  ║ │
│  ╚════════════════════════════════════════════════════════╝ │
│                                                              │
│  Also matched today                                          │
│  ──────────────────────────────────────────────────────────  │
│  7.2  Staff Frontend Engineer · Smallpdf · Zurich      →    │
│  7.0  Senior Engineer        · Beekeeper · ZH (rem)    →    │
│                                                              │
│  [ View all matches in dashboard → ]                         │
│                                                              │
│  Notification settings  ·  Unsubscribe                       │
└──────────────────────────────────────────────────────────────┘
```

### Hero card (top-scored job)

- `★ HIGHEST SCORE` label only renders when the digest has **2 or more** jobs.
- Score (large, right-aligned) uses the existing `scoreColor()` thresholds.
- Company line: `{company} · {location}` — source dropped per the new design.
- Dimensions row: single line, `Role N · Dom N · Exp N · Loc N · Upside N`. Numbers are rendered as integers (`Math.round`) — the breakdown is for at-a-glance comparison, not precision.
- Reasoning: truncated server-side to **≤80 characters**, single sentence, no italics, no quotes. Truncation rule: cut at the last word boundary ≤80 chars and append `…` if the original was longer.
- Two CTAs, side by side:
  - Primary: `Open in dashboard →` → `${appUrl}/dashboard/jobs/${jobId}`
  - Secondary: `Apply` → `applyUrl` (external)
- Primary uses the existing dark button style; secondary uses an outlined / lighter style to de-emphasize.

### Tail rows ("Also matched today")

- Rendered only when the digest has **2 or more** jobs.
- One row per remaining job, sorted descending by score (matches existing sort).
- Row content: `{score.toFixed(1)}  {title} · {company} · {location}   →`
- **Whole row is a link** to `${appUrl}/dashboard/jobs/${jobId}`.
- A tiny `Apply ↗` link sits at the right edge of the row and opens the external apply URL. Both links coexist in the row using a 2-column table layout (left: row link, right: apply link) — no flex, email-safe.
- No dimensions, no reasoning in the tail — they live on the dashboard.

### Single-match special case

When `jobs.length === 1`:
- Hero card renders **without** the `★ HIGHEST SCORE` label (ranking is moot).
- No "Also matched today" section.
- Footer is unchanged.

### Empty state

When `jobs.length === 0`:
- Same as today: heading + "No matches landed today, but we'll keep looking."
- No footer CTAs except notification settings + unsubscribe.

### Footer

Always present when `jobs.length >= 1`:
- `[ View all matches in dashboard → ]` button → `${appUrl}/dashboard`
- Below, on one line: `Notification settings · Unsubscribe`
  - `Notification settings` → `${appUrl}/dashboard/settings/notifications` (or whatever the current path is — implementer to verify)
  - `Unsubscribe` → existing unsubscribe URL pattern (implementer to confirm; today's email has no unsubscribe link, so this is additive)

### Header

Top line stays compact: `jobfishing · N matches this morning` (the count merges what was previously two separate lines — branding tag + heading).

## Data plumbing

### `DigestJobItem` (in [src/lib/email/job-digest.tsx](../../../src/lib/email/job-digest.tsx))

Add:
```ts
export interface DigestJobItem {
  jobId: string                                   // NEW — for dashboard link
  jobTitle: string
  company: string
  location: string | null
  score: number
  dimensions: {                                   // NEW — surface scoring
    role_fit: number
    domain_fit: number
    experience_fit: number
    location_fit: number
    upside: number
  } | null
  reasoning: string                               // truncated by caller, ≤80 chars
  applyUrl: string
  // source removed
  // isHotPick removed (replaced by position-based "HIGHEST SCORE" label rendered in template)
}
```

`isHotPick` and `source` are removed. The "highest score" treatment is computed positionally in the template (`jobs[0]` when `jobs.length >= 2`), not carried on the item.

### `JobDigestEmailProps`

Add `appUrl: string` so the template can build dashboard links. Caller passes `process.env.NEXT_PUBLIC_APP_URL` (or equivalent — implementer to confirm the env var name in [src/trigger/notify-users.tsx](../../../src/trigger/notify-users.tsx)).

### Caller changes ([src/trigger/notify-users.tsx](../../../src/trigger/notify-users.tsx))

- Populate `jobId: job.id` and `dimensions: evaluation.dimensions` on each `DigestJobItem`.
- Truncate `reasoning` to ≤80 chars at word boundary before assigning.
- Drop `source` and `isHotPick` from the item construction.
- Pass `appUrl` to `<JobDigestEmail />`.

## Component shape

Stay inside React Email primitives (`Body`, `Container`, `Section`, `Heading`, `Text`, `Button`, `Hr`, `Link`). The tail row uses a `<table>` for the row+apply-link two-column layout (`<Row>`/`<Column>` from `@react-email/components` if available, otherwise raw `<table>`).

Suggested internal structure (single file, no new exports):

```
JobDigestEmail
├── Header
├── HeroCard       (rendered when jobs.length >= 1; "HIGHEST SCORE" label only if >= 2)
├── TailList       (rendered when jobs.length >= 2)
│   └── TailRow × N
└── Footer         (rendered when jobs.length >= 1)
```

Keep all sub-components as local functions in the same file — no new files. The file is already focused enough that splitting it would add navigation cost.

## Testing

Update [src/test/job-digest.test.tsx](../../../src/test/job-digest.test.tsx) to cover:

1. Zero matches → renders "No matches landed today" copy, no footer CTAs.
2. One match → hero renders **without** `HIGHEST SCORE` label, no tail section, footer present.
3. Two+ matches → hero with `HIGHEST SCORE` label, tail rows in descending score order, footer present.
4. Reasoning >80 chars → truncated at word boundary with `…` suffix.
5. Dimensions render as integers in `Role N · Dom N · Exp N · Loc N · Upside N` form when present.
6. Dimensions `null` → dimensions row is omitted entirely (no empty placeholder).
7. Hero links: primary = `${appUrl}/dashboard/jobs/${jobId}`, secondary = `applyUrl`.
8. Tail row: row link = dashboard, apply link = external apply URL.
9. Footer "View all matches" = `${appUrl}/dashboard`.

Snapshot test is not required; assertions on rendered text + `href`s are sufficient (matches the existing test style).

## Out of scope (followups, not this change)

- Per-user digest preferences (e.g., "always show full reasoning") — not requested.
- Save / dismiss actions inline in the email — would require signed action URLs; defer.
- Resend broadcast / template management via the Resend MCP — current transactional flow is correct.

## Open questions for implementer

- Confirm the notification settings URL path in the current app.
- Confirm whether an unsubscribe link already exists; if not, this design adds the visual element but the link plumbing is out of scope for this PR (link to settings instead, leave a TODO).
- Confirm the env var name for the app base URL (`NEXT_PUBLIC_APP_URL` is the assumption).
