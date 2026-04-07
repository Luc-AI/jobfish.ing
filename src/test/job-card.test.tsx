import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JobCard } from '@/components/features/job-card'

const mockEvaluation = {
  id: 'eval-1',
  score: 8.5,
  reasoning: 'Strong fit because of product background.',
  dimensions: {
    role_fit: 9.0,
    company_fit: 8.0,
    location: 9.0,
    growth_potential: 8.0,
  },
  notified_at: null,
  created_at: new Date().toISOString(),
  jobs: {
    id: 'job-1',
    title: 'Head of Product',
    company: 'Acme Corp',
    location: 'Zurich',
    url: 'https://example.com/apply',
    source: 'linkedin',
    scraped_at: new Date().toISOString(),
  },
  user_job_actions: null,
}

describe('JobCard', () => {
  it('displays job title', () => {
    render(<JobCard evaluation={mockEvaluation} onAction={vi.fn()} />)
    expect(screen.getByText('Head of Product')).toBeInTheDocument()
  })

  it('displays company name', () => {
    render(<JobCard evaluation={mockEvaluation} onAction={vi.fn()} />)
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('displays score badge', () => {
    render(<JobCard evaluation={mockEvaluation} onAction={vi.fn()} />)
    expect(screen.getByText('8.5')).toBeInTheDocument()
  })

  it('toggles reasoning on expand click', async () => {
    const user = userEvent.setup()
    render(<JobCard evaluation={mockEvaluation} onAction={vi.fn()} />)
    expect(screen.queryByText(/strong fit/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /why this job/i }))
    expect(screen.getByText(/strong fit/i)).toBeInTheDocument()
  })

  it('calls onAction with correct args when Save is clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<JobCard evaluation={mockEvaluation} onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onAction).toHaveBeenCalledWith('job-1', 'saved')
  })

  it('calls onAction with correct args when Hide is clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<JobCard evaluation={mockEvaluation} onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: /hide/i }))
    expect(onAction).toHaveBeenCalledWith('job-1', 'hidden')
  })
})
