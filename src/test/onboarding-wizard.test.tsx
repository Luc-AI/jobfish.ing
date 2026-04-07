import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

describe('OnboardingWizard', () => {
  const defaultProps = {
    userId: 'test-user-id',
    initialStep: 1 as const,
  }

  it('renders step 1 (CV) by default', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText(/your cv/i)).toBeInTheDocument()
  })

  it('shows step indicator with 3 steps', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('advances to step 2 after clicking Next on step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/preferences/i)).toBeInTheDocument()
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
  })

  it('goes back to step 1 when Back is clicked on step 2', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })
})
