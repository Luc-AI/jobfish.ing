import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'

const mockUpsert = vi.fn().mockResolvedValue({ error: null })
const mockUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: mockUpsert,
      update: mockUpdate,
    })),
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

// Silence fetch in these tests (LocationPicker and complete route not under test here)
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) }))

describe('OnboardingWizard', () => {
  beforeEach(() => vi.clearAllMocks())

  const defaultProps = { userId: 'test-user-id' }

  it('renders step 1 (name) by default', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText(/let's get started/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
  })

  it('shows step counter as "1 of 4"', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
  })

  it('Next button is disabled when name fields are empty', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('Next button is enabled when both name fields are filled', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace')
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('advances to step 2 (CV) after completing step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace')
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText(/your cv/i)).toBeInTheDocument()
    expect(screen.getByText('2 of 4')).toBeInTheDocument()
  })

  it('can go back from step 2 to step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
  })

  it('renders step 3 (preferences) with "3 of 4"', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={3} />)
    expect(screen.getByText(/preferences/i)).toBeInTheDocument()
    expect(screen.getByText('3 of 4')).toBeInTheDocument()
  })

  it('renders step 4 (notifications) with "4 of 4"', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={4} />)
    expect(screen.getByText(/notifications/i)).toBeInTheDocument()
    expect(screen.getByText('4 of 4')).toBeInTheDocument()
  })
})
