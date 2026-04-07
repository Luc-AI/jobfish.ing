import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsForm } from '@/components/features/notifications-form'

describe('NotificationsForm', () => {
  it('renders threshold value', () => {
    render(<NotificationsForm defaultThreshold={7.0} defaultEnabled={true} onSave={vi.fn()} />)
    const thresholdDisplay = screen.getByText('7.0', { selector: 'span.text-3xl' })
    expect(thresholdDisplay).toBeInTheDocument()
  })

  it('renders notifications toggle in enabled state', () => {
    render(<NotificationsForm defaultThreshold={7.0} defaultEnabled={true} onSave={vi.fn()} />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toBeChecked()
  })

  it('calls onSave when saved', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<NotificationsForm defaultThreshold={7.0} defaultEnabled={true} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith({ threshold: 7.0, notificationsEnabled: true })
  })
})
