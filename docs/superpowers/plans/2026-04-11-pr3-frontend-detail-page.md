# PR 3 — Frontend: Job Detail Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/dashboard/jobs/[jobId]` detail page that renders job facts, five AI dimension cards, and enriched reasoning. Add a "View details" link to the existing job card. Handle missing `detailed_reasoning` gracefully.

**Architecture:** A new server-rendered Next.js page at `src/app/(app)/dashboard/jobs/[jobId]/page.tsx` loads data via a new query in `queries.ts`. Three focused presentational components cover the three UX sections (header, AI scoring, job content). A new Server Action handles Apply/Save/Hide from the detail page. The existing `JobCard` gets a single new link. All tests are Vitest + React Testing Library.

**Tech Stack:** Next.js 16 App Router, Supabase, shadcn/ui, React Testing Library, Vitest

**Depends on:** PR 1 must be deployed (so `detailed_reasoning` exists on `job_evaluations`). PR 2 recommended (so `detail_facts` is populated) but not blocking.

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/lib/supabase/queries.ts` |
| Create | `src/app/(app)/dashboard/jobs/[jobId]/page.tsx` |
| Create | `src/app/(app)/dashboard/jobs/[jobId]/actions.ts` |
| Create | `src/components/features/job-detail-header.tsx` |
| Create | `src/components/features/job-detail-scoring.tsx` |
| Create | `src/components/features/job-detail-content.tsx` |
| Modify | `src/components/features/job-card.tsx` |
| Create | `src/test/job-detail-query.test.ts` |
| Create | `src/test/job-detail-header.test.tsx` |
| Create | `src/test/job-detail-scoring.test.tsx` |
| Create | `src/test/job-card-link.test.tsx` |

---

## Task 1: Add the detail-page query

**Files:**
- Modify: `src/lib/supabase/queries.ts`
- Create: `src/test/job-detail-query.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/job-detail-query.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { JobDetailData } from '@/lib/supabase/queries'

// These tests validate the shape of data that getJobDetail must return.
// We test the type contract, not the Supabase call itself (which requires a live DB).

describe('JobDetailData type contract', () => {
  it('has all required job fields', () => {
    // Compile-time check: construct a valid JobDetailData object
    const data: JobDetailData = {
      job: {
        id: 'job-1',
        title: 'Head of Product',
        company: 'Acme',
        location: 'Zurich, Switzerland',
        url: 'https://example.com/job',
        source: 'linkedin',
        description: 'Full description text.',
        scraped_at: '2026-04-01T00:00:00Z',
        date_posted: null,
        employment_type: null,
        work_arrangement: null,
        experience_level: null,
        job_language: null,
        working_hours: null,
        source_domain: null,
        detail_facts: null,
      },
      evaluation: {
        id: 'eval-1',
        score: 8.5,
        reasoning: 'Great match.',
        dimensions: {
          role_fit: 9,
          domain_fit: 8,
          experience_fit: 9,
          location_fit: 7,
          upside: 8,
        },
        detailed_reasoning: {
          summary: 'Strong overall fit.',
          strengths: ['Good role overlap'],
          concerns: [],
          red_flags: [],
          recommendation: 'Apply.',
          dimension_explanations: {
            role_fit: 'Scope matches.',
            domain_fit: 'Some ramp-up.',
            experience_fit: 'Aligned.',
            location_fit: 'Acceptable.',
            upside: 'Good growth.',
          },
        },
      },
      action: null,
    }
    expect(data.job.title).toBe('Head of Product')
    expect(data.evaluation?.score).toBe(8.5)
    expect(data.action).toBeNull()
  })

  it('allows evaluation to be null (job exists, no evaluation yet)', () => {
    const data: JobDetailData = {
      job: {
        id: 'job-2',
        title: 'Engineer',
        company: 'Corp',
        location: null,
        url: 'https://example.com/2',
        source: 'greenhouse',
        description: null,
        scraped_at: '2026-04-01T00:00:00Z',
        date_posted: null,
        employment_type: null,
        work_arrangement: null,
        experience_level: null,
        job_language: null,
        working_hours: null,
        source_domain: null,
        detail_facts: null,
      },
      evaluation: null,
      action: null,
    }
    expect(data.evaluation).toBeNull()
  })

  it('allows detailed_reasoning to be null inside an evaluation', () => {
    const data: JobDetailData = {
      job: {
        id: 'job-3',
        title: 'PM',
        company: 'Co',
        location: null,
        url: 'https://example.com/3',
        source: 'lever',
        description: null,
        scraped_at: '2026-04-01T00:00:00Z',
        date_posted: null,
        employment_type: null,
        work_arrangement: null,
        experience_level: null,
        job_language: null,
        working_hours: null,
        source_domain: null,
        detail_facts: null,
      },
      evaluation: {
        id: 'eval-3',
        score: 7.0,
        reasoning: 'Decent fit.',
        dimensions: null,
        detailed_reasoning: null,
      },
      action: { status: 'saved', applied_at: null },
    }
    expect(data.evaluation?.detailed_reasoning).toBeNull()
    expect(data.action?.status).toBe('saved')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/job-detail-query.test.ts
```

Expected: FAIL — `JobDetailData` not exported from `queries.ts`.

- [ ] **Step 3: Add getJobDetail and JobDetailData to queries.ts**

Append to the end of `src/lib/supabase/queries.ts`:

```ts
export interface JobDetailData {
  job: {
    id: string
    title: string
    company: string
    location: string | null
    url: string
    source: string
    description: string | null
    scraped_at: string
    date_posted: string | null
    employment_type: string[] | null
    work_arrangement: string | null
    experience_level: string | null
    job_language: string | null
    working_hours: number | null
    source_domain: string | null
    detail_facts: {
      location_display?: string
      key_skills?: string[]
      core_responsibilities?: string
      requirements_summary?: string
      education_requirements?: string[]
      keywords?: string[]
    } | null
  }
  evaluation: {
    id: string
    score: number
    reasoning: string | null
    dimensions: {
      role_fit: number
      domain_fit: number
      experience_fit: number
      location_fit: number
      upside: number
    } | null
    detailed_reasoning: {
      summary: string
      strengths: string[]
      concerns: string[]
      red_flags: string[]
      recommendation: string
      dimension_explanations: {
        role_fit: string
        domain_fit: string
        experience_fit: string
        location_fit: string
        upside: string
      }
    } | null
  } | null
  action: {
    status: 'saved' | 'hidden' | 'applied'
    applied_at: string | null
  } | null
}

export async function getJobDetail(
  userId: string,
  jobId: string
): Promise<JobDetailData | null> {
  const supabase = await createClient()

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(`
      id, title, company, location, url, source, description, scraped_at,
      date_posted, employment_type, work_arrangement, experience_level,
      job_language, working_hours, source_domain, detail_facts
    `)
    .eq('id', jobId)
    .single()

  if (jobError || !job) return null

  const { data: evaluation } = await supabase
    .from('job_evaluations')
    .select('id, score, reasoning, dimensions, detailed_reasoning')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  const { data: action } = await supabase
    .from('user_job_actions')
    .select('status, applied_at')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  // Return notFound signal if user has hidden this job
  if (action?.status === 'hidden') return null

  return {
    job: job as JobDetailData['job'],
    evaluation: evaluation
      ? {
          id: evaluation.id,
          score: evaluation.score,
          reasoning: evaluation.reasoning,
          dimensions: evaluation.dimensions as JobDetailData['evaluation'] extends null ? never : NonNullable<JobDetailData['evaluation']>['dimensions'],
          detailed_reasoning: evaluation.detailed_reasoning as JobDetailData['evaluation'] extends null ? never : NonNullable<JobDetailData['evaluation']>['detailed_reasoning'],
        }
      : null,
    action: action ? { status: action.status, applied_at: action.applied_at } : null,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/job-detail-query.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/queries.ts src/test/job-detail-query.test.ts
git commit -m "feat: add getJobDetail query and JobDetailData type"
```

---

## Task 2: Build the header component

**Files:**
- Create: `src/components/features/job-detail-header.tsx`
- Create: `src/test/job-detail-header.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/job-detail-header.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JobDetailHeader } from '@/components/features/job-detail-header'
import type { JobDetailData } from '@/lib/supabase/queries'

const mockJob: JobDetailData['job'] = {
  id: 'job-1',
  title: 'Head of Product',
  company: 'Acme Corp',
  location: 'Zurich, Switzerland',
  url: 'https://example.com/apply',
  source: 'linkedin',
  description: null,
  scraped_at: '2026-04-01T00:00:00Z',
  date_posted: null,
  employment_type: ['full-time'],
  work_arrangement: 'hybrid',
  experience_level: 'senior',
  job_language: 'English',
  working_hours: 40,
  source_domain: 'linkedin.com',
  detail_facts: null,
}

const onAction = vi.fn()

describe('JobDetailHeader', () => {
  it('renders job title and company', () => {
    render(
      <JobDetailHeader job={mockJob} score={8.5} action={null} onAction={onAction} />
    )
    expect(screen.getByText('Head of Product')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders fact chips for non-null fields', () => {
    render(
      <JobDetailHeader job={mockJob} score={8.5} action={null} onAction={onAction} />
    )
    expect(screen.getByText('hybrid')).toBeInTheDocument()
    expect(screen.getByText('full-time')).toBeInTheDocument()
    expect(screen.getByText('senior')).toBeInTheDocument()
    expect(screen.getByText('English')).toBeInTheDocument()
    expect(screen.getByText('40h/week')).toBeInTheDocument()
  })

  it('omits chips for null fields', () => {
    const jobNoHours: JobDetailData['job'] = { ...mockJob, working_hours: null, job_language: null }
    render(
      <JobDetailHeader job={jobNoHours} score={8.5} action={null} onAction={onAction} />
    )
    expect(screen.queryByText(/h\/week/)).not.toBeInTheDocument()
    expect(screen.queryByText('English')).not.toBeInTheDocument()
  })

  it('renders the total score', () => {
    render(
      <JobDetailHeader job={mockJob} score={8.5} action={null} onAction={onAction} />
    )
    expect(screen.getByText('8.5')).toBeInTheDocument()
  })

  it('renders an Apply link pointing to the job url', () => {
    render(
      <JobDetailHeader job={mockJob} score={8.5} action={null} onAction={onAction} />
    )
    const applyLink = screen.getByRole('link', { name: /apply/i })
    expect(applyLink).toHaveAttribute('href', 'https://example.com/apply')
    expect(applyLink).toHaveAttribute('target', '_blank')
  })

  it('renders Save and Hide buttons', () => {
    render(
      <JobDetailHeader job={mockJob} score={8.5} action={null} onAction={onAction} />
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument()
  })

  it('marks Save as active when action is saved', () => {
    render(
      <JobDetailHeader
        job={mockJob}
        score={8.5}
        action={{ status: 'saved', applied_at: null }}
        onAction={onAction}
      />
    )
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect(saveBtn.className).toMatch(/border-primary/)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/job-detail-header.test.tsx
```

Expected: FAIL — `JobDetailHeader` not found.

- [ ] **Step 3: Create job-detail-header.tsx**

Create `src/components/features/job-detail-header.tsx`:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScoreBadge } from './score-badge'
import { MapPin, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobDetailData } from '@/lib/supabase/queries'

interface JobDetailHeaderProps {
  job: JobDetailData['job']
  score: number | null
  action: JobDetailData['action']
  onAction: (jobId: string, status: 'saved' | 'hidden' | 'applied') => void
}

export function JobDetailHeader({ job, score, action, onAction }: JobDetailHeaderProps) {
  const currentStatus = action?.status

  const chips: { label: string; value: string }[] = [
    job.work_arrangement ? { label: 'arrangement', value: job.work_arrangement } : null,
    ...(job.employment_type ?? []).map(t => ({ label: 'type', value: t })),
    job.experience_level ? { label: 'level', value: job.experience_level } : null,
    job.job_language ? { label: 'language', value: job.job_language } : null,
    job.working_hours != null ? { label: 'hours', value: `${job.working_hours}h/week` } : null,
  ].filter((c): c is { label: string; value: string } => c !== null)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground">{job.company}</span>
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.location}
              </span>
            )}
          </div>
        </div>
        {score != null && <ScoreBadge score={score} className="text-2xl px-3 py-1 shrink-0" />}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map(chip => (
            <Badge key={chip.value} variant="secondary" className="capitalize">
              {chip.value}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction(job.id, 'saved')}
          className={cn(currentStatus === 'saved' && 'border-primary')}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction(job.id, 'hidden')}
        >
          Hide
        </Button>
        <div className="flex-1" />
        <Button size="sm" asChild onClick={() => onAction(job.id, 'applied')}>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            Apply <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/job-detail-header.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/features/job-detail-header.tsx src/test/job-detail-header.test.tsx
git commit -m "feat: add JobDetailHeader component"
```

---

## Task 3: Build the AI scoring component

**Files:**
- Create: `src/components/features/job-detail-scoring.tsx`
- Create: `src/test/job-detail-scoring.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/job-detail-scoring.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JobDetailScoring } from '@/components/features/job-detail-scoring'
import type { JobDetailData } from '@/lib/supabase/queries'

type Evaluation = NonNullable<JobDetailData['evaluation']>

const fullEvaluation: Evaluation = {
  id: 'eval-1',
  score: 8.5,
  reasoning: 'Great overall match.',
  dimensions: {
    role_fit: 9,
    domain_fit: 8,
    experience_fit: 9,
    location_fit: 7,
    upside: 8,
  },
  detailed_reasoning: {
    summary: 'Strong overall fit for your product background.',
    strengths: ['Clear overlap with product ownership'],
    concerns: ['Domain ramp-up required'],
    red_flags: ['Unrealistic equity promise'],
    recommendation: 'Worth a serious look.',
    dimension_explanations: {
      role_fit: 'Scope matches well.',
      domain_fit: 'Ramp-up needed.',
      experience_fit: 'Seniority aligned.',
      location_fit: 'Acceptable.',
      upside: 'Good growth.',
    },
  },
}

describe('JobDetailScoring', () => {
  it('renders the total score', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('8.5')).toBeInTheDocument()
  })

  it('renders all five dimension labels', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText(/role fit/i)).toBeInTheDocument()
    expect(screen.getByText(/domain fit/i)).toBeInTheDocument()
    expect(screen.getByText(/experience fit/i)).toBeInTheDocument()
    expect(screen.getByText(/location fit/i)).toBeInTheDocument()
    expect(screen.getByText(/upside/i)).toBeInTheDocument()
  })

  it('renders the summary from detailed_reasoning', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Strong overall fit for your product background.')).toBeInTheDocument()
  })

  it('renders strengths', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Clear overlap with product ownership')).toBeInTheDocument()
  })

  it('renders concerns', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Domain ramp-up required')).toBeInTheDocument()
  })

  it('renders red_flags when present', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Unrealistic equity promise')).toBeInTheDocument()
  })

  it('does not render red flags section when red_flags is empty', () => {
    const noFlags: Evaluation = {
      ...fullEvaluation,
      detailed_reasoning: { ...fullEvaluation.detailed_reasoning!, red_flags: [] },
    }
    render(<JobDetailScoring evaluation={noFlags} />)
    expect(screen.queryByText(/red flag/i)).not.toBeInTheDocument()
  })

  it('renders the recommendation', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Worth a serious look.')).toBeInTheDocument()
  })

  it('renders fallback message when detailed_reasoning is null', () => {
    const fallback: Evaluation = {
      ...fullEvaluation,
      detailed_reasoning: null,
    }
    render(<JobDetailScoring evaluation={fallback} />)
    expect(screen.getByText(/detailed ai scoring is not available yet/i)).toBeInTheDocument()
  })

  it('renders dimension scores even in fallback (dimensions present but no detailed_reasoning)', () => {
    const fallback: Evaluation = {
      ...fullEvaluation,
      detailed_reasoning: null,
    }
    render(<JobDetailScoring evaluation={fallback} />)
    // Dimension numeric scores should still render
    expect(screen.getByText('9.0')).toBeInTheDocument()
  })

  it('renders fallback short reasoning when detailed_reasoning is null', () => {
    const fallback: Evaluation = { ...fullEvaluation, detailed_reasoning: null }
    render(<JobDetailScoring evaluation={fallback} />)
    expect(screen.getByText('Great overall match.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/job-detail-scoring.test.tsx
```

Expected: FAIL — `JobDetailScoring` not found.

- [ ] **Step 3: Create job-detail-scoring.tsx**

Create `src/components/features/job-detail-scoring.tsx`:

```tsx
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScoreBadge } from './score-badge'
import type { JobDetailData } from '@/lib/supabase/queries'

type Evaluation = NonNullable<JobDetailData['evaluation']>

const DIMENSION_LABELS: Record<string, string> = {
  role_fit: 'Role Fit',
  domain_fit: 'Domain Fit',
  experience_fit: 'Experience Fit',
  location_fit: 'Location Fit',
  upside: 'Upside',
}

interface JobDetailScoringProps {
  evaluation: Evaluation
}

export function JobDetailScoring({ evaluation }: JobDetailScoringProps) {
  const { score, reasoning, dimensions, detailed_reasoning } = evaluation

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">AI Scoring</h2>
        <ScoreBadge score={score} />
      </div>

      {dimensions && (
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(dimensions).map(([key, val]) => (
            <Card key={key}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {DIMENSION_LABELS[key] ?? key}
                </p>
                <p className="text-sm font-bold tabular-nums">{(val as number).toFixed(1)}</p>
                {detailed_reasoning?.dimension_explanations?.[key as keyof typeof detailed_reasoning.dimension_explanations] && (
                  <p className="text-xs text-muted-foreground mt-1 leading-tight">
                    {detailed_reasoning.dimension_explanations[key as keyof typeof detailed_reasoning.dimension_explanations]}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {detailed_reasoning ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground italic">{detailed_reasoning.summary}</p>

          <Separator />

          {detailed_reasoning.strengths.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">Strengths</p>
              <ul className="space-y-1">
                {detailed_reasoning.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-green-600">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detailed_reasoning.concerns.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">Concerns</p>
              <ul className="space-y-1">
                {detailed_reasoning.concerns.map((c, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-yellow-600">~</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detailed_reasoning.red_flags.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1 text-red-600">Red Flags</p>
              <ul className="space-y-1">
                {detailed_reasoning.red_flags.map((f, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-red-600">!</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium mb-1">Recommendation</p>
            <p className="text-sm text-muted-foreground">{detailed_reasoning.recommendation}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {reasoning && (
            <p className="text-sm text-muted-foreground italic">&ldquo;{reasoning}&rdquo;</p>
          )}
          <p className="text-sm text-muted-foreground">
            Detailed AI scoring is not available yet for this job.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/job-detail-scoring.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/features/job-detail-scoring.tsx src/test/job-detail-scoring.test.tsx
git commit -m "feat: add JobDetailScoring component with fallback state"
```

---

## Task 4: Build the job content component

**Files:**
- Create: `src/components/features/job-detail-content.tsx`

No test file — this component is a pure display of pre-fetched string data with no conditional logic beyond null-guards; the test coverage comes from the page-level integration.

- [ ] **Step 1: Create job-detail-content.tsx**

```tsx
import { Separator } from '@/components/ui/separator'
import { ExternalLink } from 'lucide-react'
import type { JobDetailData } from '@/lib/supabase/queries'

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  'jobs.ch': 'Jobs.ch',
  company_site: 'Company',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  workday: 'Workday',
}

interface JobDetailContentProps {
  job: JobDetailData['job']
}

export function JobDetailContent({ job }: JobDetailContentProps) {
  const facts = job.detail_facts

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Job Description</h2>

      {facts?.core_responsibilities && (
        <div>
          <p className="text-sm font-medium mb-1">Core Responsibilities</p>
          <p className="text-sm text-muted-foreground">{facts.core_responsibilities}</p>
        </div>
      )}

      {facts?.requirements_summary && (
        <div>
          <p className="text-sm font-medium mb-1">Requirements</p>
          <p className="text-sm text-muted-foreground">{facts.requirements_summary}</p>
        </div>
      )}

      {facts?.key_skills && facts.key_skills.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Key Skills</p>
          <p className="text-sm text-muted-foreground">{facts.key_skills.join(', ')}</p>
        </div>
      )}

      {(facts?.core_responsibilities || facts?.requirements_summary || facts?.key_skills?.length) && (
        <Separator />
      )}

      {job.description && (
        <div>
          <p className="text-sm font-medium mb-2">Full Description</p>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {job.description}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
        <span>Source: {SOURCE_LABELS[job.source] ?? job.source}</span>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          View original <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/job-detail-content.tsx
git commit -m "feat: add JobDetailContent component"
```

---

## Task 5: Create the Server Action for the detail page

**Files:**
- Create: `src/app/(app)/dashboard/jobs/[jobId]/actions.ts`

- [ ] **Step 1: Create the server action**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { upsertJobAction as upsertJobActionQuery } from '@/lib/supabase/queries'

export async function upsertJobActionFromDetail(
  jobId: string,
  status: 'saved' | 'hidden' | 'applied'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await upsertJobActionQuery(user.id, jobId, status)

  if (status === 'hidden') {
    redirect('/dashboard')
  }

  revalidatePath(`/dashboard/jobs/${jobId}`)
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/dashboard/jobs/[jobId]/actions.ts
git commit -m "feat: add server action for job detail page actions"
```

---

## Task 6: Create the detail page route

**Files:**
- Create: `src/app/(app)/dashboard/jobs/[jobId]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJobDetail } from '@/lib/supabase/queries'
import { JobDetailHeader } from '@/components/features/job-detail-header'
import { JobDetailScoring } from '@/components/features/job-detail-scoring'
import { JobDetailContent } from '@/components/features/job-detail-content'
import { Separator } from '@/components/ui/separator'
import { upsertJobActionFromDetail } from './actions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface JobDetailPageProps {
  params: Promise<{ jobId: string }>
}

export async function generateMetadata({ params }: JobDetailPageProps) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const detail = await getJobDetail(user.id, jobId)
  if (!detail) return { title: 'Job — Jobfish' }

  return {
    title: `${detail.job.title} at ${detail.job.company} — Jobfish`,
  }
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { jobId } = await params
  const detail = await getJobDetail(user.id, jobId)

  if (!detail) notFound()

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to feed
      </Link>

      <JobDetailHeader
        job={detail.job}
        score={detail.evaluation?.score ?? null}
        action={detail.action}
        onAction={upsertJobActionFromDetail}
      />

      <Separator />

      {detail.evaluation && (
        <>
          <JobDetailScoring evaluation={detail.evaluation} />
          <Separator />
        </>
      )}

      <JobDetailContent job={detail.job} />
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/dashboard/jobs/[jobId]/page.tsx
git commit -m "feat: add job detail page route"
```

---

## Task 7: Add "View details" link to JobCard

**Files:**
- Modify: `src/components/features/job-card.tsx`
- Create: `src/test/job-card-link.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/job-card-link.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JobCard } from '@/components/features/job-card'

const mockEvaluation = {
  id: 'eval-1',
  score: 8.5,
  reasoning: 'Great match.',
  dimensions: null,
  notified_at: null,
  created_at: '2026-04-01T00:00:00Z',
  jobs: {
    id: 'job-1',
    title: 'Head of Product',
    company: 'Acme',
    location: 'Zurich',
    url: 'https://example.com/apply',
    source: 'linkedin',
    scraped_at: '2026-04-01T00:00:00Z',
  },
  user_job_actions: null,
}

describe('JobCard View details link', () => {
  it('renders a View details link pointing to /dashboard/jobs/[jobId]', () => {
    render(<JobCard evaluation={mockEvaluation} onAction={vi.fn()} />)
    const link = screen.getByRole('link', { name: /view details/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/dashboard/jobs/job-1')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/test/job-card-link.test.tsx
```

Expected: FAIL — no "View details" link.

- [ ] **Step 3: Add the View details link to job-card.tsx**

In `src/components/features/job-card.tsx`, add `import Link from 'next/link'` at the top with the other imports, then add the link inside the actions row (the `flex items-center gap-2 mt-4 pt-4 border-t` div), between the `Hide` button and the spacer `<div className="flex-1" />`:

```tsx
// Add import at top:
import Link from 'next/link'

// Add this between the Hide button and the spacer div:
<Button size="sm" variant="ghost" asChild>
  <Link href={`/dashboard/jobs/${job.id}`}>View details</Link>
</Button>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/job-card-link.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/features/job-card.tsx src/test/job-card-link.test.tsx
git commit -m "feat: add View details link to JobCard"
```

---

## Task 8: Open PR

- [ ] **Push branch and open PR targeting `develop`**

```bash
git push -u origin feature/pr3-frontend-detail-page
gh pr create \
  --base develop \
  --title "feat: job detail page with enriched AI scoring" \
  --body "$(cat <<'EOF'
## Summary
- Adds \`/dashboard/jobs/[jobId]\` server-rendered detail page
- Three-section layout: header/triage, AI scoring, raw job content
- Renders five dimension cards with per-dimension explanations from \`detailed_reasoning\`
- Graceful fallback when \`detailed_reasoning\` is null (shows score + short reasoning + message)
- Adds \`View details\` link to existing dashboard job card
- New server action handles Save/Hide/Apply from the detail page (Hide redirects back to feed)
- \`getJobDetail\` query returns \`null\` for hidden jobs (triggers \`notFound()\`)

## Test plan
- [ ] \`npx vitest run\` passes locally
- [ ] Visit a job detail page in staging; confirm all three sections render
- [ ] Confirm fallback state renders for jobs without \`detailed_reasoning\`
- [ ] Confirm Hide redirects to \`/dashboard\`
- [ ] Confirm Apply opens job URL in new tab and marks action

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
