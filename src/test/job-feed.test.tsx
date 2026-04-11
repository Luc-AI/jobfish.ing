import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JobFeed } from '@/components/features/job-feed'

const mockEvaluations = [
  {
    id: 'eval-1',
    score: 9.0,
    reasoning: 'Excellent match.',
    dimensions: { role_fit: 9.0, domain_fit: 9.0, experience_fit: 9.0, location_fit: 9.0, upside: 9.0 },
    notified_at: null,
    created_at: new Date().toISOString(),
    jobs: {
      id: 'job-1',
      title: 'Head of Product',
      company: 'Startup A',
      location: 'Zurich',
      url: 'https://example.com',
      source: 'linkedin',
      scraped_at: new Date().toISOString(),
    },
    user_job_actions: null,
  },
]

describe('JobFeed', () => {
  it('renders a list of job cards', () => {
    render(<JobFeed evaluations={mockEvaluations} onAction={vi.fn()} />)
    expect(screen.getByText('Head of Product')).toBeInTheDocument()
  })

  it('shows empty state when no evaluations', () => {
    render(<JobFeed evaluations={[]} onAction={vi.fn()} />)
    expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument()
  })
})
