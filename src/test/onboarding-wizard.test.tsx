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

// Stub fetch for LocationPicker autocomplete and CV upload
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ suggestions: [], extractedText: 'mock cv text' }),
}))

describe('OnboardingWizard', () => {
  beforeEach(() => vi.clearAllMocks())

  const defaultProps = { userId: 'test-user-id' }

  // --- Step 1: Name ---

  it('renders step 1 (name) by default', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText(/let's get started/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
  })

  it('shows step counter as "1 of 5"', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText('1 of 5')).toBeInTheDocument()
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

  it('advances to step 2 (Preferences) after completing step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace')
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText('2 of 5')).toBeInTheDocument()
    expect(screen.getByText(/preferences/i)).toBeInTheDocument()
  })

  it('can go back from step 2 to step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('1 of 5')).toBeInTheDocument()
  })

  // --- Step 2: Preferences ---

  it('renders step 2 (Preferences) with YoE slider and work arrangement', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={2} />)
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
    expect(screen.getByText(/years of experience/i)).toBeInTheDocument()
    expect(screen.getByText(/work arrangement/i)).toBeInTheDocument()
  })

  it('Next button on step 2 is disabled when no role is selected', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={2} />)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  // --- Step 3: Advanced ---

  it('renders step 3 (Advanced) with "3 of 5"', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={3} />)
    expect(screen.getByText('3 of 5')).toBeInTheDocument()
    expect(screen.getByText(/advanced/i)).toBeInTheDocument()
  })

  it('step 3 shows preferred language chips', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={3} />)
    expect(screen.getByRole('button', { name: 'German' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'French' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Italian' })).toBeInTheDocument()
  })

  it('step 3 shows company size chips', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={3} />)
    expect(screen.getByRole('button', { name: 'Startup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scale-up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mid-market' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enterprise' })).toBeInTheDocument()
  })

  it('step 3 Next button is always enabled (step is optional)', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={3} />)
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('can go back from step 3 to step 2', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} initialStep={3} />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
  })

  // --- Step 4: CV upload ---

  it('renders step 4 (CV upload) with "4 of 5"', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={4} />)
    expect(screen.getByText('4 of 5')).toBeInTheDocument()
    expect(screen.getByText(/your cv/i)).toBeInTheDocument()
  })

  it('step 4 has a PDF file input', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={4} />)
    const fileInput = screen.getByLabelText(/cv \(pdf\)/i)
    expect(fileInput).toHaveAttribute('type', 'file')
    expect(fileInput).toHaveAttribute('accept', expect.stringContaining('pdf'))
  })

  it('step 4 Skip button advances to step 5 without uploading', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} initialStep={4} />)
    await user.click(screen.getByRole('button', { name: /skip for now/i }))
    expect(screen.getByText('5 of 5')).toBeInTheDocument()
  })

  it('step 4 Next button is disabled before a file is uploaded', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={4} />)
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()
  })

  it('can go back from step 4 to step 3', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} initialStep={4} />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('3 of 5')).toBeInTheDocument()
  })

  // --- Step 5: Notifications ---

  it('renders step 5 (Notifications) with "5 of 5"', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={5} />)
    expect(screen.getByText('5 of 5')).toBeInTheDocument()
    expect(screen.getByText(/notifications/i)).toBeInTheDocument()
  })

  it('step 5 shows score threshold slider with default 7.0', () => {
    render(<OnboardingWizard {...defaultProps} initialStep={5} />)
    expect(screen.getByText(/score threshold/i)).toBeInTheDocument()
    expect(screen.getByText('7.0')).toBeInTheDocument()
  })

  it('can go back from step 5 to step 4', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} initialStep={5} />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('4 of 5')).toBeInTheDocument()
  })
})
