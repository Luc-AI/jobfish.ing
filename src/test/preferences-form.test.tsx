import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreferencesForm } from '@/components/features/preferences-form'
import type { RoleSelection } from '@/lib/supabase/types'

const defaultValues = {
  targetRoles: [{ role: 'Head of Product' }] as RoleSelection[],
  yearsExperience: 5,
  targetIndustries: ['Fintech'],
  excludedIndustries: [],
  preferredLanguages: [],
  companySizes: [],
  locations: ['Zurich'],
  excludedCompanies: [],
}

describe('PreferencesForm', () => {
  it('renders the role picker with ROLES header', () => {
    render(<PreferencesForm defaultValues={defaultValues} cvSummary={null} hasCvText={false} onSave={vi.fn()} />)
    expect(screen.getByText('ROLES')).toBeInTheDocument()
  })

  it('shows pre-selected role count', () => {
    render(<PreferencesForm defaultValues={defaultValues} cvSummary={null} hasCvText={false} onSave={vi.fn()} />)
    expect(screen.getByText('1 SELECTED')).toBeInTheDocument()
  })

  it('renders YoeSlider with initial value from defaultValues', () => {
    render(<PreferencesForm defaultValues={defaultValues} cvSummary={null} hasCvText={false} onSave={vi.fn()} />)
    expect(screen.getByText(/years of experience/i)).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('calls onSave when form is submitted', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<PreferencesForm defaultValues={defaultValues} cvSummary={null} hasCvText={false} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('includes yearsExperience in onSave payload', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<PreferencesForm defaultValues={defaultValues} cvSummary={null} hasCvText={false} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ yearsExperience: 5 }))
  })

  it('shows no CV empty state when no CV uploaded', () => {
    render(<PreferencesForm defaultValues={defaultValues} cvSummary={null} hasCvText={false} onSave={vi.fn()} />)
    expect(screen.getByText(/no cv uploaded yet/i)).toBeInTheDocument()
  })

  it('shows processing state when cv_text exists but summary is pending', () => {
    render(<PreferencesForm defaultValues={defaultValues} cvSummary={null} hasCvText={true} onSave={vi.fn()} />)
    expect(screen.getByText(/being processed/i)).toBeInTheDocument()
  })

  it('renders cv summary when provided', () => {
    const summary = {
      name: 'Jane Doe',
      current_title: 'Senior Engineer',
      seniority: 'senior' as const,
      skills: ['TypeScript', 'React'],
      experience: [{ title: 'SWE', company: 'Acme', duration: '2020–2024' }],
      education: [{ degree: 'BSc CS', institution: 'ETH', year: '2020' }],
      key_achievements: ['Shipped X'],
    }
    render(<PreferencesForm defaultValues={defaultValues} cvSummary={summary} hasCvText={true} onSave={vi.fn()} />)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })
})
