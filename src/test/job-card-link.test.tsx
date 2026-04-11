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
