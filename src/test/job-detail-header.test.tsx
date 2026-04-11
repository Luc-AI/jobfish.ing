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
