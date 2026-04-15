import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreferencesForm } from '@/components/features/preferences-form'
import type { RoleSelection } from '@/lib/supabase/types'

const defaultValues = {
  cvText: 'My CV content here.',
  targetRoles: [{ role: 'Head of Product', yoe: 0 }] as RoleSelection[],
  industries: ['Fintech'],
  locations: ['Zurich'],
  excludedCompanies: [],
}

describe('PreferencesForm', () => {
  it('renders CV textarea with initial value', () => {
    render(<PreferencesForm defaultValues={defaultValues} onSave={vi.fn()} />)
    expect(screen.getByDisplayValue('My CV content here.')).toBeInTheDocument()
  })

  it('renders the role picker with ROLES header', () => {
    render(<PreferencesForm defaultValues={defaultValues} onSave={vi.fn()} />)
    expect(screen.getByText('ROLES')).toBeInTheDocument()
  })

  it('shows pre-selected role count', () => {
    render(<PreferencesForm defaultValues={defaultValues} onSave={vi.fn()} />)
    expect(screen.getByText('1 SELECTED')).toBeInTheDocument()
  })

  it('calls onSave when form is submitted', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<PreferencesForm defaultValues={defaultValues} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })
})
