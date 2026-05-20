# Resend Daily Job Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diagnose the existing `notify-users` Trigger.dev task, then adapt the notification pipeline so users receive one Resend-powered daily digest containing qualifying jobs from the last 24 hours.

**Architecture:** Keep scraping and evaluation unchanged as the data-production path, but remove immediate delivery from `evaluate-jobs`. Rework `notify-users` into a scheduled digest sender that selects qualifying `job_evaluations` from the last 24 hours, groups them by user, renders one digest email, and marks the included rows as notified only after a successful send. Add focused pure helpers for digest grouping/render inputs so the task logic stays testable.

**Tech Stack:** TypeScript, Next.js, Trigger.dev SDK (`@trigger.dev/sdk`), Resend, React Email, Supabase service client, Vitest

**Prerequisites:** `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are available in the environment where Trigger.dev runs. The approved design spec is `docs/superpowers/specs/2026-04-10-resend-daily-digest-design.md`.

---

## File Map

| File | Responsibility |
|---|---|
| `src/trigger/notify-users.tsx` | Diagnose current task behavior, convert to daily scheduled digest delivery, keep send/update orchestration here |
| `src/trigger/evaluate-jobs.ts` | Stop triggering immediate notifications after evaluation |
| `src/lib/email/job-digest.tsx` | New React Email template for multi-job digests |
| `src/test/job-digest.test.tsx` | Template rendering coverage for digest emails |
| `src/test/notify-users.test.ts` | Unit tests for digest selection, grouping, successful send behavior, and failure handling |
| `src/test/evaluate-jobs.test.ts` | Verify `evaluate-jobs` no longer triggers `notify-users` |

---

### Task 1: Diagnose and lock down current `notify-users` behavior

**Files:**
- Create: `src/test/notify-users.test.ts`
- Modify: `src/trigger/notify-users.tsx`

- [ ] **Step 1: Write a failing diagnosis test for the current task contract**

Create `src/test/notify-users.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelect = vi.fn()
const mockIn = vi.fn()
const mockIs = vi.fn()
const mockEq = vi.fn()
const mockUpdate = vi.fn()
const mockGetUserById = vi.fn()
const mockSend = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'job_evaluations') {
        return {
          select: mockSelect,
          update: mockUpdate,
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: mockIn,
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    auth: {
      admin: {
        getUserById: mockGetUserById,
      },
    },
  }),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: mockSend,
    }
  },
}))

vi.mock('@react-email/components', () => ({
  render: vi.fn(async () => '<html>email</html>'),
}))

describe('notifyUsersTask diagnosis', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = 're_test'
    process.env.RESEND_FROM_EMAIL = 'jobs@example.com'
  })

  it('sends one email per qualifying evaluation in the current implementation', async () => {
    const evaluations = [
      {
        id: 'eval-1',
        user_id: 'user-1',
        score: 8.5,
        reasoning: 'Strong fit',
        dimensions: {
          role_fit: 9,
          company_fit: 8,
          location: 8,
          growth_potential: 9,
        },
        jobs: {
          title: 'Head of Product',
          company: 'Acme',
          location: 'Zurich',
          url: 'https://example.com/job-1',
          source: 'linkedin',
        },
      },
      {
        id: 'eval-2',
        user_id: 'user-1',
        score: 8.1,
        reasoning: 'Another fit',
        dimensions: {
          role_fit: 8,
          company_fit: 8,
          location: 8,
          growth_potential: 8,
        },
        jobs: {
          title: 'VP Product',
          company: 'Acme',
          location: 'Zurich',
          url: 'https://example.com/job-2',
          source: 'linkedin',
        },
      },
    ]

    mockSelect.mockReturnValueOnce({
      in: () => ({
        is: async () => ({ data: evaluations }),
      }),
    })
    mockIn.mockResolvedValueOnce({
      data: [{ id: 'user-1', threshold: 7, notifications_enabled: true }],
    })
    mockGetUserById.mockResolvedValue({
      data: {
        user: { email: 'user@example.com' },
      },
    })
    mockSend.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({
      eq: mockEq,
    })
    mockEq.mockResolvedValue({ error: null })

    const { notifyUsersTask } = await import('@/trigger/notify-users')
    const result = await notifyUsersTask.run({ evaluationIds: ['eval-1', 'eval-2'] })

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ notifiedCount: 2 })
  })
})
```

- [ ] **Step 2: Run the diagnosis test to verify it passes against current behavior**

Run:

```bash
npm run test:run -- src/test/notify-users.test.ts
```

Expected: PASS with one test confirming the current task sends one email per evaluation.

- [ ] **Step 3: Add a diagnostic comment block in `src/trigger/notify-users.tsx` before changing behavior**

Update `src/trigger/notify-users.tsx` near the task definition:

```typescript
// Current behavior before digest conversion:
// - receives evaluationIds from evaluate-jobs
// - filters to qualifying rows above the user's threshold
// - sends one email per evaluation
// - marks each evaluation as notified only after a successful send
//
// The daily digest refactor keeps the same send/update safety guarantees,
// but changes the delivery unit from "per evaluation" to "per user digest".
```

- [ ] **Step 4: Re-run the diagnosis test**

Run:

```bash
npm run test:run -- src/test/notify-users.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test/notify-users.test.ts src/trigger/notify-users.tsx
git commit -m "test: lock down notify-users current behavior"
```

---

### Task 2: Add the digest email template

**Files:**
- Create: `src/lib/email/job-digest.tsx`
- Create: `src/test/job-digest.test.tsx`

- [ ] **Step 1: Write the failing template test**

Create `src/test/job-digest.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/components'
import { JobDigestEmail } from '@/lib/email/job-digest'

const jobs = [
  {
    title: 'Head of Product',
    company: 'Acme Corp',
    location: 'Zurich',
    score: 8.5,
    reasoning: 'Strong match due to product background.',
    applyUrl: 'https://example.com/job-1',
    source: 'LinkedIn',
  },
  {
    title: 'VP Product',
    company: 'Beta Corp',
    location: 'Remote',
    score: 8.0,
    reasoning: 'Good leadership fit.',
    applyUrl: 'https://example.com/job-2',
    source: 'Company',
  },
]

describe('JobDigestEmail', () => {
  it('renders the digest summary heading', async () => {
    const html = await render(<JobDigestEmail jobs={jobs} />)
    expect(html).toContain('2 new job matches this morning')
  })

  it('renders multiple job titles', async () => {
    const html = await render(<JobDigestEmail jobs={jobs} />)
    expect(html).toContain('Head of Product')
    expect(html).toContain('VP Product')
  })

  it('renders scores and apply links for each job', async () => {
    const html = await render(<JobDigestEmail jobs={jobs} />)
    expect(html).toContain('8.5')
    expect(html).toContain('8.0')
    expect(html).toContain('https://example.com/job-1')
    expect(html).toContain('https://example.com/job-2')
  })
})
```

- [ ] **Step 2: Run the template test to verify it fails**

Run:

```bash
npm run test:run -- src/test/job-digest.test.tsx
```

Expected: FAIL with "Cannot find module `@/lib/email/job-digest`".

- [ ] **Step 3: Create `src/lib/email/job-digest.tsx`**

Create `src/lib/email/job-digest.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface DigestJobItem {
  title: string
  company: string
  location: string | null
  score: number
  reasoning: string
  applyUrl: string
  source: string
}

interface JobDigestEmailProps {
  jobs: DigestJobItem[]
}

function scoreColor(score: number): string {
  if (score >= 8) return '#15803d'
  if (score >= 6) return '#a16207'
  return '#b91c1c'
}

export function JobDigestEmail({ jobs }: JobDigestEmailProps) {
  const count = jobs.length
  const preview = `${count} new job match${count === 1 ? '' : 'es'} this morning`

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
          <Text style={{ fontSize: '12px', color: '#a8a29e', margin: '0 0 16px' }}>
            jobfishing · jobs find you
          </Text>

          <Heading
            style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#1c1917',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            {preview}
          </Heading>

          <Text style={{ fontSize: '14px', color: '#57534e', margin: '0 0 24px' }}>
            Here are today&apos;s high-signal matches from the last 24 hours.
          </Text>

          {jobs.map((job, index) => (
            <Section
              key={`${job.title}-${job.company}-${index}`}
              style={{
                backgroundColor: '#fafaf9',
                borderRadius: '6px',
                padding: '16px',
                margin: '0 0 16px',
              }}
            >
              <Heading
                as="h2"
                style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#1c1917',
                  margin: '0 0 4px',
                }}
              >
                {job.title}
              </Heading>

              <Text style={{ fontSize: '14px', color: '#57534e', margin: '0 0 12px' }}>
                {job.company}
                {job.location ? ` · ${job.location}` : ''}
                {' · '}
                {job.source}
              </Text>

              <Text
                style={{
                  margin: '0 0 12px',
                  fontSize: '16px',
                  fontWeight: '700',
                  color: scoreColor(job.score),
                }}
              >
                Score {job.score.toFixed(1)}/10
              </Text>

              <Text
                style={{
                  fontSize: '14px',
                  color: '#57534e',
                  lineHeight: '1.6',
                  margin: '0 0 16px',
                }}
              >
                {job.reasoning}
              </Text>

              <Button
                href={job.applyUrl}
                style={{
                  backgroundColor: '#1c1917',
                  color: '#ffffff',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  textDecoration: 'none',
                }}
              >
                View job
              </Button>
            </Section>
          ))}

          <Hr style={{ borderColor: '#e7e5e4', margin: '8px 0 0' }} />
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Step 4: Run the template test to verify it passes**

Run:

```bash
npm run test:run -- src/test/job-digest.test.tsx
```

Expected: PASS with three tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/job-digest.tsx src/test/job-digest.test.tsx
git commit -m "feat: add daily digest email template"
```

---

### Task 3: Convert `notify-users` into a scheduled daily digest task

**Files:**
- Modify: `src/trigger/notify-users.tsx`
- Modify: `src/test/notify-users.test.ts`

- [ ] **Step 1: Replace the diagnosis test with digest-focused failing tests**

Update `src/test/notify-users.test.ts` to:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockJobEvaluationsSelect = vi.fn()
const mockProfilesSelect = vi.fn()
const mockGetUserById = vi.fn()
const mockSend = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockOrder = vi.fn()
const mockGte = vi.fn()
const mockIs = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'job_evaluations') {
        return {
          select: mockJobEvaluationsSelect,
          update: mockUpdate,
        }
      }
      if (table === 'profiles') {
        return {
          select: mockProfilesSelect,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    auth: {
      admin: {
        getUserById: mockGetUserById,
      },
    },
  }),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: mockSend,
    }
  },
}))

vi.mock('@react-email/components', () => ({
  render: vi.fn(async () => '<html>digest</html>'),
}))

describe('notifyUsersTask daily digest', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = 're_test'
    process.env.RESEND_FROM_EMAIL = 'jobs@example.com'

    mockUpdate.mockReturnValue({ in: mockIn })
    mockIn.mockResolvedValue({ error: null })
  })

  it('sends one digest per user for qualifying evaluations from the last 24 hours', async () => {
    const evaluations = [
      {
        id: 'eval-1',
        user_id: 'user-1',
        score: 8.5,
        reasoning: 'Strong fit',
        created_at: new Date().toISOString(),
        jobs: {
          title: 'Head of Product',
          company: 'Acme',
          location: 'Zurich',
          url: 'https://example.com/job-1',
          source: 'linkedin',
        },
      },
      {
        id: 'eval-2',
        user_id: 'user-1',
        score: 8.1,
        reasoning: 'Leadership fit',
        created_at: new Date().toISOString(),
        jobs: {
          title: 'VP Product',
          company: 'Beta',
          location: 'Remote',
          url: 'https://example.com/job-2',
          source: 'company_site',
        },
      },
      {
        id: 'eval-3',
        user_id: 'user-2',
        score: 6.0,
        reasoning: 'Below threshold',
        created_at: new Date().toISOString(),
        jobs: {
          title: 'COO',
          company: 'Gamma',
          location: 'Basel',
          url: 'https://example.com/job-3',
          source: 'linkedin',
        },
      },
    ]

    mockJobEvaluationsSelect.mockReturnValue({
      is: () => ({
        gte: () => ({
          order: async () => ({ data: evaluations }),
        }),
      }),
    })

    mockProfilesSelect.mockReturnValue({
      in: async () => ({
        data: [
          { id: 'user-1', threshold: 7, notifications_enabled: true },
          { id: 'user-2', threshold: 7, notifications_enabled: true },
        ],
      }),
    })

    mockGetUserById.mockResolvedValue({
      data: {
        user: { email: 'user@example.com' },
      },
    })

    mockSend.mockResolvedValue({ error: null })

    const { notifyUsersTask } = await import('@/trigger/notify-users')
    const result = await notifyUsersTask.run()

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockIn).toHaveBeenCalledWith('id', ['eval-1', 'eval-2'])
    expect(result).toEqual({ notifiedCount: 1, evaluationCount: 2 })
  })

  it('leaves evaluations unnotified when the send fails', async () => {
    mockJobEvaluationsSelect.mockReturnValue({
      is: () => ({
        gte: () => ({
          order: async () => ({
            data: [
              {
                id: 'eval-1',
                user_id: 'user-1',
                score: 8.5,
                reasoning: 'Strong fit',
                created_at: new Date().toISOString(),
                jobs: {
                  title: 'Head of Product',
                  company: 'Acme',
                  location: 'Zurich',
                  url: 'https://example.com/job-1',
                  source: 'linkedin',
                },
              },
            ],
          }),
        }),
      }),
    })

    mockProfilesSelect.mockReturnValue({
      in: async () => ({
        data: [{ id: 'user-1', threshold: 7, notifications_enabled: true }],
      }),
    })

    mockGetUserById.mockResolvedValue({
      data: {
        user: { email: 'user@example.com' },
      },
    })

    mockSend.mockResolvedValue({ error: new Error('send failed') })

    const { notifyUsersTask } = await import('@/trigger/notify-users')
    const result = await notifyUsersTask.run()

    expect(mockIn).not.toHaveBeenCalled()
    expect(result).toEqual({ notifiedCount: 0, evaluationCount: 0 })
  })
})
```

- [ ] **Step 2: Run the digest task test to verify it fails**

Run:

```bash
npm run test:run -- src/test/notify-users.test.ts
```

Expected: FAIL because `notifyUsersTask.run()` still requires `evaluationIds` and still sends per evaluation.

- [ ] **Step 3: Rewrite `src/trigger/notify-users.tsx` as a scheduled digest task**

Replace the file contents with:

```tsx
import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { createServiceClient } from '@/lib/supabase/service'
import { JobDigestEmail, type DigestJobItem } from '@/lib/email/job-digest'

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  'jobs.ch': 'Jobs.ch',
  company_site: 'Company',
}

interface EvaluationRow {
  id: string
  user_id: string
  score: number
  reasoning: string | null
  created_at: string
  jobs:
    | {
        title: string
        company: string
        location: string | null
        url: string
        source: string
      }
    | {
        title: string
        company: string
        location: string | null
        url: string
        source: string
      }[]
    | null
}

function getDigestWindowStart(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
}

function toDigestJobItem(row: EvaluationRow): DigestJobItem | null {
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs
  if (!job) return null

  return {
    title: job.title,
    company: job.company,
    location: job.location ?? null,
    score: row.score,
    reasoning: row.reasoning ?? '',
    applyUrl: job.url,
    source: SOURCE_LABELS[job.source] ?? job.source,
  }
}

function groupQualifyingEvaluations(
  evaluations: EvaluationRow[],
  profiles: Array<{ id: string; threshold: number | null; notifications_enabled: boolean | null }>
) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  const grouped = new Map<string, { evaluationIds: string[]; jobs: DigestJobItem[] }>()

  for (const evaluation of evaluations) {
    const profile = profileMap.get(evaluation.user_id)
    if (!profile || profile.notifications_enabled !== true) continue
    if (evaluation.score < (profile.threshold ?? 7.0)) continue

    const item = toDigestJobItem(evaluation)
    if (!item) continue

    const existing = grouped.get(evaluation.user_id) ?? { evaluationIds: [], jobs: [] }
    existing.evaluationIds.push(evaluation.id)
    existing.jobs.push(item)
    grouped.set(evaluation.user_id, existing)
  }

  return grouped
}

export const notifyUsersTask = schedules.task({
  id: 'notify-users',
  cron: { pattern: '0 8 * * *', timezone: 'Europe/Zurich' },
  retry: { maxAttempts: 2 },
  run: async () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }

    const resend = new Resend(apiKey)
    const supabase = createServiceClient()
    const windowStart = getDigestWindowStart()

    const { data: evaluations } = await supabase
      .from('job_evaluations')
      .select(`
        id,
        user_id,
        score,
        reasoning,
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
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })

    if (!evaluations?.length) {
      console.log('No evaluations to notify about in the last 24 hours')
      return { notifiedCount: 0, evaluationCount: 0 }
    }

    const userIds = [...new Set(evaluations.map((evaluation) => evaluation.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, threshold, notifications_enabled')
      .in('id', userIds)

    const grouped = groupQualifyingEvaluations(
      evaluations as EvaluationRow[],
      profiles ?? []
    )

    let notifiedCount = 0
    let evaluationCount = 0

    for (const [userId, group] of grouped.entries()) {
      try {
        const {
          data: { user },
        } = await supabase.auth.admin.getUserById(userId)

        if (!user?.email) continue

        const emailHtml = await render(<JobDigestEmail jobs={group.jobs} />)

        const { error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
          to: user.email,
          subject: `${group.jobs.length} new job match${group.jobs.length === 1 ? '' : 'es'} this morning`,
          html: emailHtml,
        })

        if (error) {
          Sentry.captureException(error, { extra: { userId, evaluationIds: group.evaluationIds } })
          continue
        }

        await supabase
          .from('job_evaluations')
          .update({ notified_at: new Date().toISOString() })
          .in('id', group.evaluationIds)

        notifiedCount++
        evaluationCount += group.evaluationIds.length
      } catch (err) {
        Sentry.captureException(err, { extra: { userId, evaluationIds: group.evaluationIds } })
      }
    }

    console.log(`Sent ${notifiedCount} daily digests for ${evaluationCount} evaluations`)
    return { notifiedCount, evaluationCount }
  },
})

export { groupQualifyingEvaluations, getDigestWindowStart }
```

- [ ] **Step 4: Run the digest task test to verify it passes**

Run:

```bash
npm run test:run -- src/test/notify-users.test.ts
```

Expected: PASS with two tests.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/notify-users.tsx src/test/notify-users.test.ts
git commit -m "feat: convert notify-users to daily digest task"
```

---

### Task 4: Stop immediate notification triggering in `evaluate-jobs`

**Files:**
- Modify: `src/trigger/evaluate-jobs.ts`
- Create: `src/test/evaluate-jobs.test.ts`

- [ ] **Step 1: Write a failing test that proves `evaluate-jobs` no longer triggers notifications**

Create `src/test/evaluate-jobs.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockProfilesQuery = {
  eq: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
}

const mockFrom = vi.fn()
const mockCallOpenRouter = vi.fn()
const mockParseEvaluationResponse = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}))

vi.mock('@/trigger/lib/evaluate', () => ({
  buildEvaluationPrompt: vi.fn(() => 'prompt'),
  callOpenRouter: mockCallOpenRouter,
  parseEvaluationResponse: mockParseEvaluationResponse,
}))

vi.mock('@/trigger/notify-users', () => ({
  notifyUsersTask: {
    trigger: vi.fn(),
  },
}))

describe('evaluateJobsTask', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                {
                  id: 'job-1',
                  title: 'Head of Product',
                  company: 'Acme',
                  location: 'Zurich',
                  description: 'desc',
                },
              ],
            }),
          }),
        }
      }

      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              not: async () => ({
                data: [{ id: 'user-1', cv_text: 'cv text' }],
              }),
            }),
          }),
        }
      }

      if (table === 'preferences') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                {
                  user_id: 'user-1',
                  target_roles: ['Head of Product'],
                  industries: ['SaaS'],
                  locations: ['Zurich'],
                  excluded_companies: [],
                },
              ],
            }),
          }),
        }
      }

      if (table === 'job_evaluations') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: 'eval-1' },
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    mockCallOpenRouter.mockResolvedValue('raw')
    mockParseEvaluationResponse.mockReturnValue({
      score: 8.5,
      reasoning: 'Great fit',
      dimensions: {
        role_fit: 9,
        company_fit: 8,
        location: 8,
        growth_potential: 9,
      },
    })
  })

  it('evaluates jobs without triggering notify-users directly', async () => {
    const { evaluateJobsTask } = await import('@/trigger/evaluate-jobs')
    const { notifyUsersTask } = await import('@/trigger/notify-users')

    await evaluateJobsTask.run({ jobIds: ['job-1'] })

    expect(notifyUsersTask.trigger).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/test/evaluate-jobs.test.ts
```

Expected: FAIL because `evaluate-jobs` still calls `notifyUsersTask.trigger(...)`.

- [ ] **Step 3: Remove the immediate trigger from `src/trigger/evaluate-jobs.ts`**

Update `src/trigger/evaluate-jobs.ts`:

```typescript
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { buildEvaluationPrompt, callOpenRouter, parseEvaluationResponse } from './lib/evaluate'

interface EvaluateJobsPayload {
  jobIds: string[]
  /** If provided, only evaluate for these users (used for new-user backfill) */
  userIds?: string[]
}

export const evaluateJobsTask = task({
  id: 'evaluate-jobs',
  retry: { maxAttempts: 2 },
  run: async ({ jobIds, userIds }: EvaluateJobsPayload) => {
    const supabase = createServiceClient()

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, title, company, location, description')
      .in('id', jobIds)

    if (jobsError || !jobs?.length) {
      console.log('No jobs to evaluate')
      return
    }

    let profilesQuery = supabase
      .from('profiles')
      .select('id, cv_text')
      .eq('onboarding_completed', true)
      .not('cv_text', 'is', null)

    if (userIds && userIds.length > 0) {
      profilesQuery = profilesQuery.in('id', userIds)
    }

    const { data: profiles } = await profilesQuery

    if (!profiles?.length) {
      console.log('No active users to evaluate for')
      return
    }

    const profileUserIds = profiles.map((profile) => profile.id)
    const { data: prefsRows } = await supabase
      .from('preferences')
      .select('user_id, target_roles, industries, locations, excluded_companies')
      .in('user_id', profileUserIds)

    const prefsMap = new Map((prefsRows ?? []).map((pref) => [pref.user_id, pref]))

    let evaluatedCount = 0

    for (const user of profiles) {
      const prefs = prefsMap.get(user.id)

      for (const job of jobs) {
        try {
          const prompt = buildEvaluationPrompt({
            jobTitle: job.title,
            jobCompany: job.company,
            jobDescription: job.description ?? '',
            cvText: user.cv_text ?? '',
            targetRoles: prefs?.target_roles ?? [],
            industries: prefs?.industries ?? [],
            locations: prefs?.locations ?? [],
            excludedCompanies: prefs?.excluded_companies ?? [],
          })

          const rawResponse = await callOpenRouter(prompt)
          const { score, reasoning, dimensions } = parseEvaluationResponse(rawResponse)

          const { data: evaluation } = await supabase
            .from('job_evaluations')
            .insert({
              job_id: job.id,
              user_id: user.id,
              score,
              reasoning,
              dimensions,
            })
            .select('id')
            .single()

          if (evaluation) {
            evaluatedCount++
          }
        } catch (err) {
          Sentry.captureException(err, {
            extra: { jobId: job.id, userId: user.id },
          })
          console.error(`Evaluation failed for job ${job.id} / user ${user.id}:`, err)
        }
      }
    }

    console.log(`Evaluated ${evaluatedCount} job/user pairs`)
    return { evaluatedCount }
  },
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test:run -- src/test/evaluate-jobs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/evaluate-jobs.ts src/test/evaluate-jobs.test.ts
git commit -m "refactor: decouple evaluation from email delivery"
```

---

### Task 5: Run the focused verification suite

**Files:**
- Modify: `src/test/notify-users.test.ts` (only if test fixes are needed)
- Modify: `src/test/job-digest.test.tsx` (only if test fixes are needed)
- Modify: `src/test/evaluate-jobs.test.ts` (only if test fixes are needed)

- [ ] **Step 1: Run the digest-related test suite**

Run:

```bash
npm run test:run -- src/test/notify-users.test.ts src/test/job-digest.test.tsx src/test/evaluate-jobs.test.ts
```

Expected: PASS with all digest-related tests green.

- [ ] **Step 2: Run the legacy single-email template test**

Run:

```bash
npm run test:run -- src/test/job-notification.test.tsx
```

Expected: PASS. This confirms the old template still renders cleanly during transition.

- [ ] **Step 3: Run the existing Trigger-related regression test**

Run:

```bash
npm run test:run -- src/test/onboarding-complete-route.test.ts
```

Expected: PASS. This confirms Trigger task usage elsewhere still behaves as expected.

- [ ] **Step 4: Commit any test-only fixes if needed**

```bash
git add src/test/notify-users.test.ts src/test/job-digest.test.tsx src/test/evaluate-jobs.test.ts
git commit -m "test: verify daily digest notification flow"
```

- [ ] **Step 5: Manual development verification**

Run:

```bash
npm run trigger:dev
```

Expected: Trigger.dev dev worker starts successfully and registers `notify-users` as a scheduled task.

Then, in a second terminal, run:

```bash
vercel env pull /tmp/jobfish-vercel.env --environment=development
```

Expected: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are present in the pulled env file.

Finally, use the Trigger dashboard or Trigger MCP to invoke the digest task in development after preparing qualifying rows in Supabase.
Expected: one Resend email arrives for a user with multiple qualifying evaluations from the last 24 hours, and the included `job_evaluations.notified_at` values are updated.

---

## Self-Review

### Spec coverage

- Diagnose existing `notify-users` first: covered in Task 1.
- Single daily digest behavior: covered in Task 3.
- Shared timezone morning schedule: covered in Task 3 cron definition.
- Only last 24 hours: covered in Task 3 query and tests.
- Keep `notified_at` as send marker: covered in Task 3 tests and implementation.
- Resend-backed delivery: covered in Task 3 and Task 5.
- Remove immediate trigger from `evaluate-jobs`: covered in Task 4.

### Placeholder scan

No `TBD` or empty implementation steps remain. Each code step includes explicit file paths, commands, and expected outcomes.

### Type consistency

- `notifyUsersTask` becomes a scheduled task with `run(): Promise<{ notifiedCount: number; evaluationCount: number }>`
- `JobDigestEmail` accepts `jobs: DigestJobItem[]`
- `groupQualifyingEvaluations()` returns `Map<string, { evaluationIds: string[]; jobs: DigestJobItem[] }>`

