import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'

const mockUpsert = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: mockUpsert,
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

  it('renders YoeSlider with default value 0 on step 3', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={3} />)
    expect(screen.getByText(/years of experience/i)).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders step 4 (notifications) with "4 of 4"', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={4} />)
    expect(screen.getByText(/notifications/i)).toBeInTheDocument()
    expect(screen.getByText('4 of 4')).toBeInTheDocument()
  })

  describe('resume logic', () => {
    it('renders step 2 when initialStep=2 with pre-filled cvText', () => {
      render(
        <OnboardingWizard
          {...defaultProps}
          initialStep={2}
          initialValues={{ firstName: 'Ada', lastName: 'Lovelace', cvText: 'x'.repeat(100) }}
        />
      )
      expect(screen.getByText(/your cv/i)).toBeInTheDocument()
      expect(screen.getByDisplayValue('x'.repeat(100))).toBeInTheDocument()
    })

    it('renders step 3 when initialStep=3', () => {
      render(
        <OnboardingWizard
          {...defaultProps}
          initialStep={3}
          initialValues={{ firstName: 'Ada', lastName: 'Lovelace', cvText: 'x'.repeat(100) }}
        />
      )
      expect(screen.getByText(/preferences/i)).toBeInTheDocument()
      expect(screen.getByText('3 of 4')).toBeInTheDocument()
    })

    it('pre-fills firstName and lastName from initialValues', () => {
      render(
        <OnboardingWizard
          {...defaultProps}
          initialStep={1}
          initialValues={{ firstName: 'Ada', lastName: 'Lovelace' }}
        />
      )
      expect(screen.getByDisplayValue('Ada')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Lovelace')).toBeInTheDocument()
    })

    it('pre-fills targetIndustries when provided', () => {
      render(
        <OnboardingWizard
          {...defaultProps}
          initialStep={3}
          initialValues={{ targetIndustries: 'Fintech, SaaS' }}
        />
      )
      expect(screen.getByDisplayValue('Fintech, SaaS')).toBeInTheDocument()
    })
  })

  describe('CV validation', () => {
    it('disables Next button when CV is empty', () => {
      render(<OnboardingWizard userId="user-1" initialStep={2} />)
      const nextBtn = screen.getByRole('button', { name: /^next$/i })
      expect(nextBtn).toBeDisabled()
    })

    it('shows remaining-characters hint when CV is too short', () => {
      render(<OnboardingWizard userId="user-1" initialStep={2} />)
      expect(screen.getByText('100 more characters needed')).toBeInTheDocument()
    })

    it('enables Next when CV meets the 100-character minimum', () => {
      render(
        <OnboardingWizard
          userId="user-1"
          initialStep={2}
          initialValues={{ cvText: 'x'.repeat(100) }}
        />
      )
      const nextBtn = screen.getByRole('button', { name: /^next$/i })
      expect(nextBtn).not.toBeDisabled()
    })

    it('shows character count when CV meets minimum', () => {
      render(
        <OnboardingWizard
          userId="user-1"
          initialStep={2}
          initialValues={{ cvText: 'x'.repeat(150) }}
        />
      )
      expect(screen.getByText('150 characters')).toBeInTheDocument()
    })
  })
})
