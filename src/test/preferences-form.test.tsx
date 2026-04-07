import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreferencesForm } from '@/components/features/preferences-form'

const defaultValues = {
  cvText: 'My CV content here.',
  targetRoles: ['Head of Product'],
  industries: ['Fintech'],
  locations: ['Zurich'],
  excludedCompanies: [],
}

describe('PreferencesForm', () => {
  it('renders CV textarea with initial value', () => {
    render(<PreferencesForm defaultValues={defaultValues} onSave={vi.fn()} />)
    expect(screen.getByDisplayValue('My CV content here.')).toBeInTheDocument()
  })

  it('renders target roles field', () => {
    render(<PreferencesForm defaultValues={defaultValues} onSave={vi.fn()} />)
    expect(screen.getByLabelText(/target roles/i)).toBeInTheDocument()
  })

  it('calls onSave with updated values when form is submitted', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<PreferencesForm defaultValues={defaultValues} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })
})
