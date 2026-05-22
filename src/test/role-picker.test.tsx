import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RolePicker } from '@/components/features/role-picker'
import type { RoleSelection } from '@/lib/supabase/types'

describe('RolePicker', () => {
  const onChange = vi.fn()

  afterEach(() => vi.clearAllMocks())

  it('renders all 9 category buttons', () => {
    render(<RolePicker value={[]} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Engineering' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Product' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Business' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marketing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Customer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'People & Legal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })

  it('does not show SELECTED count when nothing is selected', () => {
    render(<RolePicker value={[]} onChange={onChange} />)
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument()
  })

  it('shows "2 SELECTED" when two roles are pre-selected', () => {
    const value: RoleSelection[] = [
      { role: 'Product Manager' },
      { role: 'Technical Product Manager' },
    ]
    render(<RolePicker value={value} onChange={onChange} />)
    expect(screen.getByText('2 SELECTED')).toBeInTheDocument()
  })

  it('clicking a category expands its roles', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    expect(screen.getByRole('button', { name: 'Product Manager' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'UX Researcher' })).toBeInTheDocument()
  })

  it('clicking an active category collapses it', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    await user.click(screen.getByRole('button', { name: 'Product' }))
    expect(screen.queryByRole('button', { name: 'Product Manager' })).not.toBeInTheDocument()
  })

  it('clicking a role chip calls onChange with the new selection', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    await user.click(screen.getByRole('button', { name: 'Product Manager' }))
    expect(onChange).toHaveBeenCalledWith([
      { role: 'Product Manager' },
    ])
  })

  it('clicking a selected role chip removes it', async () => {
    const user = userEvent.setup()
    const value: RoleSelection[] = [{ role: 'Product Manager' }]
    render(<RolePicker value={value} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    await user.click(screen.getByRole('button', { name: 'Product Manager' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('Engineering category shows sub-group labels', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Engineering' }))
    expect(screen.getByText('SOFTWARE')).toBeInTheDocument()
    expect(screen.getByText('AI & DATA & ANALYTICS')).toBeInTheDocument()
  })

  it('does not show YEARS OF EXPERIENCE section', () => {
    const value: RoleSelection[] = [{ role: 'Product Manager' }]
    render(<RolePicker value={value} onChange={onChange} />)
    expect(screen.queryByText(/years of experience/i)).not.toBeInTheDocument()
  })

  it('normalizes legacy string[] values without crashing', () => {
    // Simulate data from DB before migration ran
    const value = ['Product Manager', 'Software Engineer'] as unknown as RoleSelection[]
    render(<RolePicker value={value} onChange={onChange} />)
    expect(screen.getByText('2 SELECTED')).toBeInTheDocument()
  })

  it('normalizes legacy {minYoe, maxYoe} objects', () => {
    const value = [{ role: 'Product Manager', minYoe: 2, maxYoe: 5 }] as unknown as RoleSelection[]
    render(<RolePicker value={value} onChange={onChange} />)
    expect(screen.getByText('1 SELECTED')).toBeInTheDocument()
  })

  it('Product category includes Product Owner', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    expect(screen.getByRole('button', { name: 'Product Owner' })).toBeInTheDocument()
  })
})
