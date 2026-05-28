# Email Digest Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the morning job-digest email to a hero + tail layout that surfaces score dimensions, links every job back to the dashboard, truncates reasoning, and drops the source label.

**Architecture:** Single React Email template ([src/lib/email/job-digest.tsx](../../../src/lib/email/job-digest.tsx)) rendered server-side and sent through Resend by the existing Trigger.dev task ([src/trigger/notify-users.tsx](../../../src/trigger/notify-users.tsx)). The change is structural (layout + data shape), not architectural — no new files, no new dependencies, no schema migration. Score dimensions and job IDs already exist on `job_evaluations`; we just plumb them through.

**Tech Stack:** Next.js (App Router), React Email (`@react-email/components`), Resend SDK, Trigger.dev v4, Supabase, Vitest.

**Spec:** [docs/superpowers/specs/2026-05-28-email-digest-redesign-design.md](../specs/2026-05-28-email-digest-redesign-design.md)

---

## File Structure

**Modify:**
- [src/lib/email/job-digest.tsx](../../../src/lib/email/job-digest.tsx) — full template rewrite: hero card, tail rows, footer; new `DigestJobItem` shape (`jobId`, `dimensions`, no `source`, no `isHotPick`); new `JobDigestEmailProps` field `appUrl`; new `truncateReasoning` helper exported for tests.
- [src/trigger/notify-users.tsx](../../../src/trigger/notify-users.tsx) — add `dimensions` to Supabase select; populate `jobId` and `dimensions` on `DigestJobItem`; apply `truncateReasoning`; pass `appUrl` to `<JobDigestEmail />`; remove dead code (`SOURCE_LABELS`, `formatSource`, `instant_alerted_at` from query + `EvaluationRow`).
- [src/test/job-digest.test.tsx](../../../src/test/job-digest.test.tsx) — rewrite to cover new layout assertions and `truncateReasoning`.
- [src/test/notify-users.test.ts](../../../src/test/notify-users.test.ts) — update `DigestJobItem` literal expectations (add `jobId`, `dimensions`, drop `source` + `isHotPick`); delete the `source label` test.

**No new files. No deleted files.**

---

## Task 1: Reasoning truncation helper (TDD)

**Why first:** Pure function, no React Email coupling — easy to land in isolation before the larger template rewrite. The result is imported by both the template (defensive trim) and the caller (so the digest payload itself never carries oversized reasoning).

**Files:**
- Modify: [src/lib/email/job-digest.tsx](../../../src/lib/email/job-digest.tsx) — add and export `truncateReasoning`.
- Modify: [src/test/job-digest.test.tsx](../../../src/test/job-digest.test.tsx) — add a `describe('truncateReasoning')` block.

### - [ ] Step 1.1: Write the failing tests

Append to the top of [src/test/job-digest.test.tsx](../../../src/test/job-digest.test.tsx) (above the existing `describe('JobDigestEmail')` block), and update the import line:

```tsx
import { JobDigestEmail, truncateReasoning } from '@/lib/email/job-digest'

describe('truncateReasoning', () => {
  it('returns the input unchanged when it is at or below the limit', () => {
    expect(truncateReasoning('Short reasoning.')).toBe('Short reasoning.')
  })

  it('returns the input unchanged when it is exactly 80 chars', () => {
    const input = 'a'.repeat(80)
    expect(truncateReasoning(input)).toBe(input)
    expect(truncateReasoning(input).length).toBe(80)
  })

  it('truncates at the last word boundary at or before 80 chars and appends an ellipsis', () => {
    const input =
      'Strong React and payments background, solid product instincts, ships fast, very collaborative.'
    const result = truncateReasoning(input)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(81) // 80 chars + 1 ellipsis
    expect(result).not.toMatch(/\s…$/) // no trailing whitespace before ellipsis
    expect(input.startsWith(result.slice(0, -1))).toBe(true) // prefix is a substring of input
  })

  it('falls back to a hard cut at 80 chars when there is no word boundary in the first 80 chars', () => {
    const input = 'a'.repeat(120)
    const result = truncateReasoning(input)
    expect(result).toBe('a'.repeat(80) + '…')
  })

  it('handles empty input', () => {
    expect(truncateReasoning('')).toBe('')
  })
})
```

### - [ ] Step 1.2: Run the new tests and confirm they fail

Run: `pnpm vitest run src/test/job-digest.test.tsx -t truncateReasoning`

Expected: All 5 new tests fail with an import error (`truncateReasoning` not exported) or `not a function`.

### - [ ] Step 1.3: Implement `truncateReasoning`

Add to [src/lib/email/job-digest.tsx](../../../src/lib/email/job-digest.tsx), just below the existing imports and above `DigestJobItem`:

```tsx
const REASONING_MAX_CHARS = 80

export function truncateReasoning(input: string): string {
  if (input.length <= REASONING_MAX_CHARS) {
    return input
  }
  const window = input.slice(0, REASONING_MAX_CHARS)
  const lastSpace = window.lastIndexOf(' ')
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window
  return `${cut.trimEnd()}…`
}
```

### - [ ] Step 1.4: Run the new tests and confirm they pass

Run: `pnpm vitest run src/test/job-digest.test.tsx -t truncateReasoning`

Expected: All 5 pass.

### - [ ] Step 1.5: Commit

```bash
git add src/lib/email/job-digest.tsx src/test/job-digest.test.tsx
git commit -m "feat: add truncateReasoning helper for digest email"
```

---

## Task 2: Redesign template and update digest item shape

**Why bundled:** The `DigestJobItem` type, the email layout, the template tests, and the caller-side construction are tightly coupled. Splitting introduces an intermediate state where TypeScript wouldn't compile. The whole migration lands together.

**Files:**
- Modify: [src/lib/email/job-digest.tsx](../../../src/lib/email/job-digest.tsx) — new `DigestJobItem` shape, new `JobDigestEmailProps`, full template rewrite.
- Modify: [src/test/job-digest.test.tsx](../../../src/test/job-digest.test.tsx) — replace the existing `describe('JobDigestEmail')` block with assertions for the new layout.
- Modify: [src/trigger/notify-users.tsx](../../../src/trigger/notify-users.tsx) — call sites updated to match.
- Modify: [src/test/notify-users.test.ts](../../../src/test/notify-users.test.ts) — `DigestJobItem` literal expectations updated.

### - [ ] Step 2.1: Replace the `JobDigestEmail` tests with the new layout assertions

In [src/test/job-digest.test.tsx](../../../src/test/job-digest.test.tsx), **delete** the existing `mockJobs`, `singleJob`, and the existing `describe('JobDigestEmail')` block (everything from `const mockJobs = [` through the end of the file, but **keep** the `truncateReasoning` describe block from Task 1).

Then append the new fixtures and tests below `truncateReasoning`:

```tsx
const heroJob = {
  jobId: 'job-hero',
  jobTitle: 'Senior Product Engineer',
  company: 'Stripe',
  location: 'Zurich (remote)',
  score: 8.7,
  dimensions: {
    role_fit: 9,
    domain_fit: 8,
    experience_fit: 9,
    location_fit: 10,
    upside: 7,
  },
  reasoning: 'Strong React + payments background match.',
  applyUrl: 'https://example.com/apply/hero',
}

const tailJob = {
  jobId: 'job-tail',
  jobTitle: 'Staff Frontend Engineer',
  company: 'Smallpdf',
  location: 'Zurich',
  score: 7.2,
  dimensions: {
    role_fit: 8,
    domain_fit: 6,
    experience_fit: 8,
    location_fit: 9,
    upside: 5,
  },
  reasoning: 'Solid fit, smaller company than usual.',
  applyUrl: 'https://example.com/apply/tail',
}

const appUrl = 'https://jobfish.ing'

describe('JobDigestEmail', () => {
  it('renders the empty state when there are no matches', async () => {
    const html = await render(<JobDigestEmail jobs={[]} appUrl={appUrl} />)
    expect(html).toContain('No matches landed today')
    expect(html).not.toContain('HIGHEST SCORE')
    expect(html).not.toContain('Also matched today')
    expect(html).not.toContain('View all matches in dashboard')
  })

  it('renders a single match without the HIGHEST SCORE label and without the tail section', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob]} appUrl={appUrl} />)
    expect(html).toContain('Senior Product Engineer')
    expect(html).not.toContain('HIGHEST SCORE')
    expect(html).not.toContain('Also matched today')
    expect(html).toContain('View all matches in dashboard')
  })

  it('renders the HIGHEST SCORE label and the tail when there are 2+ matches', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob, tailJob]} appUrl={appUrl} />)
    expect(html).toContain('HIGHEST SCORE')
    expect(html).toContain('Also matched today')
    expect(html).toContain('Senior Product Engineer')
    expect(html).toContain('Staff Frontend Engineer')
  })

  it('renders the dimensions breakdown row when dimensions are present', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob]} appUrl={appUrl} />)
    expect(html).toContain('Role 9')
    expect(html).toContain('Dom 8')
    expect(html).toContain('Exp 9')
    expect(html).toContain('Loc 10')
    expect(html).toContain('Upside 7')
  })

  it('omits the dimensions row when dimensions are null', async () => {
    const html = await render(
      <JobDigestEmail jobs={[{ ...heroJob, dimensions: null }]} appUrl={appUrl} />
    )
    expect(html).not.toContain('Role')
    expect(html).not.toContain('Upside')
  })

  it('renders the dashboard primary CTA and the external apply secondary CTA in the hero', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob]} appUrl={appUrl} />)
    expect(html).toContain('Open in dashboard')
    expect(html).toContain(`${appUrl}/dashboard/jobs/${heroJob.jobId}`)
    expect(html).toContain(heroJob.applyUrl)
  })

  it('tail rows link the row to the dashboard and provide a separate external apply link', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob, tailJob]} appUrl={appUrl} />)
    expect(html).toContain(`${appUrl}/dashboard/jobs/${tailJob.jobId}`)
    expect(html).toContain(tailJob.applyUrl)
  })

  it('does not render the source anywhere', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob, tailJob]} appUrl={appUrl} />)
    expect(html.toLowerCase()).not.toContain('linkedin')
    expect(html.toLowerCase()).not.toContain('jobs.ch')
    expect(html.toLowerCase()).not.toContain('via ')
  })

  it('renders a footer link to the dashboard root when there is at least one match', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob]} appUrl={appUrl} />)
    expect(html).toContain(`${appUrl}/dashboard`)
    expect(html).toContain('View all matches in dashboard')
  })

  it('shows the count in the header', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob, tailJob]} appUrl={appUrl} />)
    expect(html).toContain('2 matches')
  })
})
```

### - [ ] Step 2.2: Run the new tests and confirm they fail

Run: `pnpm vitest run src/test/job-digest.test.tsx`

Expected: All `describe('JobDigestEmail')` tests fail because (a) `JobDigestEmail` doesn't accept `appUrl`, (b) the layout doesn't include `HIGHEST SCORE` / `Also matched` / dashboard links, (c) types reject the new `DigestJobItem` shape. The `truncateReasoning` block from Task 1 should still pass.

### - [ ] Step 2.3: Rewrite the template

Replace the entire contents of [src/lib/email/job-digest.tsx](../../../src/lib/email/job-digest.tsx) with:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

const REASONING_MAX_CHARS = 80

export function truncateReasoning(input: string): string {
  if (input.length <= REASONING_MAX_CHARS) {
    return input
  }
  const window = input.slice(0, REASONING_MAX_CHARS)
  const lastSpace = window.lastIndexOf(' ')
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window
  return `${cut.trimEnd()}…`
}

export interface DigestDimensions {
  role_fit: number
  domain_fit: number
  experience_fit: number
  location_fit: number
  upside: number
}

export interface DigestJobItem {
  jobId: string
  jobTitle: string
  company: string
  location: string | null
  score: number
  dimensions: DigestDimensions | null
  reasoning: string
  applyUrl: string
}

interface JobDigestEmailProps {
  jobs: DigestJobItem[]
  appUrl: string
}

function scoreColor(score: number): string {
  if (score >= 8) return '#15803d'
  if (score >= 6) return '#a16207'
  return '#b91c1c'
}

function formatDimensions(d: DigestDimensions): string {
  return [
    `Role ${Math.round(d.role_fit)}`,
    `Dom ${Math.round(d.domain_fit)}`,
    `Exp ${Math.round(d.experience_fit)}`,
    `Loc ${Math.round(d.location_fit)}`,
    `Upside ${Math.round(d.upside)}`,
  ].join(' · ')
}

function headerCount(count: number): string {
  if (count === 0) return 'no matches this morning'
  return `${count} match${count === 1 ? '' : 'es'} this morning`
}

function HeroCard({
  job,
  appUrl,
  showLabel,
}: {
  job: DigestJobItem
  appUrl: string
  showLabel: boolean
}) {
  return (
    <Section
      style={{
        backgroundColor: '#fafaf9',
        borderRadius: '8px',
        border: '1px solid #e7e5e4',
        padding: '20px',
        margin: '0 0 24px',
      }}
    >
      {showLabel && (
        <Text
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#d97706',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 8px',
          }}
        >
          ★ Highest score
        </Text>
      )}

      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td style={{ verticalAlign: 'top' }}>
            <Heading
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#1c1917',
                margin: '0 0 4px',
                letterSpacing: '-0.02em',
              }}
            >
              {job.jobTitle}
            </Heading>
            <Text style={{ fontSize: '14px', color: '#57534e', margin: '0' }}>
              {job.company}
              {job.location ? ` · ${job.location}` : ''}
            </Text>
          </td>
          <td
            style={{
              verticalAlign: 'top',
              textAlign: 'right',
              fontSize: '24px',
              fontWeight: 800,
              color: scoreColor(job.score),
              letterSpacing: '-0.03em',
              whiteSpace: 'nowrap',
              paddingLeft: '12px',
            }}
          >
            {job.score.toFixed(1)}
          </td>
        </tr>
      </table>

      {job.dimensions && (
        <Text
          style={{
            fontSize: '13px',
            color: '#78716c',
            margin: '14px 0 8px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatDimensions(job.dimensions)}
        </Text>
      )}

      {job.reasoning && (
        <Text style={{ fontSize: '14px', color: '#44403c', lineHeight: '1.5', margin: '0 0 18px' }}>
          {truncateReasoning(job.reasoning)}
        </Text>
      )}

      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td style={{ paddingRight: '10px' }}>
            <Button
              href={`${appUrl}/dashboard/jobs/${job.jobId}`}
              style={{
                backgroundColor: '#1c1917',
                color: '#ffffff',
                padding: '10px 18px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Open in dashboard →
            </Button>
          </td>
          <td>
            <Button
              href={job.applyUrl}
              style={{
                backgroundColor: '#ffffff',
                color: '#1c1917',
                padding: '10px 18px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                border: '1px solid #d6d3d1',
              }}
            >
              Apply
            </Button>
          </td>
        </tr>
      </table>
    </Section>
  )
}

function TailRow({ job, appUrl }: { job: DigestJobItem; appUrl: string }) {
  const dashboardHref = `${appUrl}/dashboard/jobs/${job.jobId}`
  return (
    <table
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ borderBottom: '1px solid #e7e5e4' }}
    >
      <tr>
        <td style={{ padding: '12px 0' }}>
          <Link
            href={dashboardHref}
            style={{
              fontSize: '14px',
              color: '#1c1917',
              textDecoration: 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: scoreColor(job.score),
                marginRight: '10px',
              }}
            >
              {job.score.toFixed(1)}
            </span>
            <span>
              {job.jobTitle}
              <span style={{ color: '#78716c' }}>
                {' · '}
                {job.company}
                {job.location ? ` · ${job.location}` : ''}
              </span>
            </span>
          </Link>
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '12px 0' }}>
          <Link
            href={job.applyUrl}
            style={{ fontSize: '13px', color: '#57534e', textDecoration: 'underline' }}
          >
            Apply ↗
          </Link>
        </td>
      </tr>
    </table>
  )
}

function Footer({ appUrl, hasMatches }: { appUrl: string; hasMatches: boolean }) {
  return (
    <>
      {hasMatches && (
        <Section style={{ textAlign: 'center', margin: '24px 0 16px' }}>
          <Button
            href={`${appUrl}/dashboard`}
            style={{
              backgroundColor: '#ffffff',
              color: '#1c1917',
              padding: '10px 18px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              border: '1px solid #d6d3d1',
            }}
          >
            View all matches in dashboard →
          </Button>
        </Section>
      )}
      <Hr style={{ borderColor: '#e7e5e4', margin: '24px 0 12px' }} />
      <Text style={{ fontSize: '12px', color: '#a8a29e', textAlign: 'center', margin: 0 }}>
        <Link href={`${appUrl}/notifications`} style={{ color: '#a8a29e' }}>
          Notification settings
        </Link>
        {' · '}
        {/* TODO: wire real unsubscribe URL once available; for now point to settings. */}
        <Link href={`${appUrl}/notifications`} style={{ color: '#a8a29e' }}>
          Unsubscribe
        </Link>
      </Text>
    </>
  )
}

export function JobDigestEmail({ jobs, appUrl }: JobDigestEmailProps) {
  const sortedJobs = [...jobs].sort((a, b) => b.score - a.score)
  const hero = sortedJobs[0]
  const tail = sortedJobs.slice(1)
  const showHeroLabel = sortedJobs.length >= 2

  const preview = hero
    ? `${headerCount(sortedJobs.length)}: ${hero.jobTitle} at ${hero.company}`
    : 'No matches landed today'

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#fafaf9', fontFamily: 'system-ui, sans-serif' }}>
        <Container
          style={{
            maxWidth: '560px',
            margin: '40px auto',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e7e5e4',
            padding: '32px',
          }}
        >
          <Text style={{ fontSize: '13px', color: '#78716c', margin: '0 0 4px' }}>
            jobfishing · {headerCount(sortedJobs.length)}
          </Text>
          <Hr style={{ borderColor: '#e7e5e4', margin: '12px 0 24px' }} />

          {sortedJobs.length === 0 ? (
            <Text style={{ fontSize: '15px', color: '#57534e', margin: 0 }}>
              No matches landed today, but we&rsquo;ll keep looking.
            </Text>
          ) : (
            <>
              <HeroCard job={hero} appUrl={appUrl} showLabel={showHeroLabel} />

              {tail.length > 0 && (
                <>
                  <Text
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#78716c',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      margin: '0 0 4px',
                    }}
                  >
                    Also matched today
                  </Text>
                  {tail.map(job => (
                    <TailRow key={job.jobId} job={job} appUrl={appUrl} />
                  ))}
                </>
              )}
            </>
          )}

          <Footer appUrl={appUrl} hasMatches={sortedJobs.length > 0} />
        </Container>
      </Body>
    </Html>
  )
}
```

### - [ ] Step 2.4: Update `notify-users.tsx` to match the new contract

Replace the `EvaluationRow`, `EvaluationJobRow`, `SOURCE_LABELS`, `formatSource`, and `buildUserDigests` block in [src/trigger/notify-users.tsx](../../../src/trigger/notify-users.tsx) and the Supabase select inside the `run` function. Concretely:

1. **Delete** lines 8–17 (`SOURCE_LABELS` and `formatSource`).

2. **Replace** `EvaluationJobRow` (line 19–25) with:

```ts
interface EvaluationJobRow {
  id: string
  title: string
  company: string
  location: string | null
  url: string
}
```

3. **Replace** `EvaluationRow` (line 27–35) with:

```ts
interface EvaluationRow {
  id: string
  score: number
  reasoning: string | null
  user_id: string
  created_at?: string
  dimensions: {
    role_fit: number
    domain_fit: number
    experience_fit: number
    location_fit: number
    upside: number
  } | null
  jobs: EvaluationJobRow | EvaluationJobRow[] | null
}
```

(`instant_alerted_at` is removed — it was only used to flag the hot pick.)

4. **Replace** the `digestJob` construction (lines 96–105) with:

```ts
const digestJob: DigestJobItem = {
  jobId: job.id,
  jobTitle: job.title,
  company: job.company,
  location: job.location ?? null,
  score: evaluation.score,
  dimensions: evaluation.dimensions,
  reasoning: truncateReasoning(evaluation.reasoning ?? ''),
  applyUrl: job.url,
}
```

5. **Add** to the import at the top of the file:

```ts
import { JobDigestEmail, truncateReasoning, type DigestJobItem } from '@/lib/email/job-digest'
```

(adds `truncateReasoning` alongside the existing imports).

6. **Update** the Supabase select inside `notifyUsersTask.run` (currently lines 144–161) to include `dimensions` and `jobs.id`, and to drop `instant_alerted_at`:

```ts
const { data: evaluations, error: evaluationsError } = await supabase
  .from('job_evaluations')
  .select(`
    id,
    score,
    reasoning,
    user_id,
    created_at,
    dimensions,
    jobs (
      id,
      title,
      company,
      location,
      url
    )
  `)
  .is('notified_at', null)
```

(`jobs.source` and `instant_alerted_at` are dropped from the select.)

7. **Add** the `appUrl` constant inside `run`, just below the `apiKey` check (around line 140):

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jobfish.ing'
```

8. **Update** the `render` call (currently line 214) to pass `appUrl`:

```ts
const html = await render(<JobDigestEmail jobs={digest.jobs} appUrl={appUrl} />)
```

### - [ ] Step 2.5: Update `notify-users.test.ts` expectations

In [src/test/notify-users.test.ts](../../../src/test/notify-users.test.ts):

1. **Delete** the entire `it('formats known source labels for display', …)` test (currently lines 74–89). The field no longer exists on `DigestJobItem`.

2. **Update every** `EvaluationRow` fixture in the test file to include `dimensions` and `jobs.id`, and to drop `source`. For each `jobs: { … }` literal, change `source: 'linkedin'` (or similar) → add `id: '<some-stable-id>'` and remove the `source` key. Also add `dimensions: null` (or a real dimensions object — `null` is fine for tests that don't assert on it) at the `EvaluationRow` level next to `score`. Pattern:

   Before:
   ```ts
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
   ```

   After:
   ```ts
   {
     id: 'evaluation-1',
     score: 8.5,
     reasoning: 'From LinkedIn',
     user_id: 'user-1',
     created_at: '2026-04-14T01:00:00.000Z',
     dimensions: null,
     jobs: {
       id: 'job-evaluation-1',
       title: 'Head of Product',
       company: 'Acme',
       location: 'Zurich',
       url: 'https://linkedin.com/jobs/123',
     },
   },
   ```

3. **Update every** `DigestJobItem` literal assertion in the file to match the new shape — replace `source: 'LinkedIn'` and `isHotPick: false` with `jobId: '<matching-job-id>'`, `dimensions: null`, and ensure `reasoning` is unchanged (test fixtures use short reasoning strings, so truncation is a no-op).

   Pattern (the equality blocks around lines 126–153, 192–209, and 340–375):

   Before:
   ```ts
   {
     jobTitle: 'Head of Product',
     company: 'Acme',
     location: 'Zurich',
     score: 8.5,
     reasoning: 'From LinkedIn',
     applyUrl: 'https://linkedin.com/jobs/123',
     source: 'LinkedIn',
     isHotPick: false,
   },
   ```

   After:
   ```ts
   {
     jobId: 'job-evaluation-1',
     jobTitle: 'Head of Product',
     company: 'Acme',
     location: 'Zurich',
     score: 8.5,
     reasoning: 'From LinkedIn',
     applyUrl: 'https://linkedin.com/jobs/123',
     dimensions: null,
   },
   ```

4. **Update** the sort assertion around line 653:

   Before:
   ```ts
   expect(digests[0].jobs.map(j => ({ score: j.score, source: j.source }))).toEqual([
     { score: 9.0, source: 'LinkedIn' },
     { score: 8.2, source: 'LinkedIn' },
     { score: 7.5, source: 'LinkedIn' },
   ])
   ```

   After:
   ```ts
   expect(digests[0].jobs.map(j => ({ score: j.score, jobId: j.jobId }))).toEqual([
     { score: 9.0, jobId: 'job-a' },
     { score: 8.2, jobId: 'job-b' },
     { score: 7.5, jobId: 'job-c' },
   ])
   ```

   And update the corresponding three fixtures (around lines 633, 640, 647) to include `id: 'job-a'`, `id: 'job-b'`, `id: 'job-c'` inside their `jobs: { … }` literals, and `dimensions: null` at the `EvaluationRow` level, and remove `source: 'linkedin'`.

### - [ ] Step 2.6: Typecheck

Run: `pnpm tsc --noEmit`

Expected: No errors. If any remain, they are almost certainly missed `source`/`isHotPick` references — search and remove them.

### - [ ] Step 2.7: Run the full test suite

Run: `pnpm vitest run src/test/job-digest.test.tsx src/test/notify-users.test.ts`

Expected: All tests pass.

### - [ ] Step 2.8: Visual sanity check

The repo uses `react-email` for previews. Run:

```bash
pnpm exec react-email dev --dir src/lib/email
```

(If the script doesn't exist, skip this step — the test assertions are the source of truth.)

Open http://localhost:3000 in a browser, find `job-digest`, and confirm by eye:
- Hero card has the score on the right, dimensions row, ≤2-line reasoning, two buttons side by side.
- "Also matched today" shows tail rows with score, title, company, location, and an "Apply ↗" link on the right.
- Single-match preview has no "HIGHEST SCORE" label and no tail.
- Footer has "View all matches in dashboard" + settings/unsubscribe links.

If any of those is wrong, fix and re-run tests.

### - [ ] Step 2.9: Commit

```bash
git add src/lib/email/job-digest.tsx src/trigger/notify-users.tsx src/test/job-digest.test.tsx src/test/notify-users.test.ts
git commit -m "feat: redesign digest email with hero + tail layout"
```

---

## Task 3: PR

### - [ ] Step 3.1: Push and open PR to `develop`

```bash
git push -u origin HEAD
gh pr create --base develop --title "feat: redesign job digest email" --body "$(cat <<'EOF'
## Summary
- Hero + tail layout in the morning digest: top-scored job gets full card, rest are one-line rows.
- Surfaces score dimensions (Role / Dom / Exp / Loc / Upside) and links every job back to `/dashboard/jobs/[jobId]`.
- Truncates reasoning to ≤80 chars at word boundary; drops the source label everywhere; drops the unused `isHotPick` field.
- Spec: `docs/superpowers/specs/2026-05-28-email-digest-redesign-design.md`

## Test plan
- [ ] `pnpm vitest run src/test/job-digest.test.tsx src/test/notify-users.test.ts` passes
- [ ] `pnpm tsc --noEmit` clean
- [ ] Visual preview (react-email dev) for 0 / 1 / 2+ matches looks right
- [ ] Send a real digest from Trigger.dev dev environment to a test inbox and verify links resolve

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- Spec coverage: Hero label gating (≥2), source drop, dashboard primary CTA, dimensions surfaced, reasoning ≤80 chars, single-match special case, empty state, footer with settings + unsubscribe — all mapped to Task 2 steps + tests.
- Type consistency: `DigestJobItem` defined once in Task 2.3, then matched exactly in 2.4 (notify-users caller) and 2.5 (test fixtures). `DigestDimensions` shape matches `dimensionsSchema` in [src/trigger/lib/score-schema.ts](../../../src/trigger/lib/score-schema.ts).
- Unsubscribe link: spec called out plumbing as TODO; Task 2.3 includes a `TODO` comment in the template and points the link at `/notifications` as a placeholder, matching the spec's "implementer to confirm" note. This is the only deliberate placeholder in the plan.
- `NEXT_PUBLIC_APP_URL` env var: not currently set in the codebase. Falls back to `https://jobfish.ing` (the production `from` domain) so it works without a deploy-time config change. Implementer should add it to Vercel project envs for non-prod environments out of band — not blocking for this PR.
